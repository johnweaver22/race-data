import { sequence } from './engine.mjs';
import { RaceCapture, formatClock } from './capture-model.mjs';
import { createTapFeedback } from './tap-feedback.mjs';
import { downloadCsv } from './csv-export.mjs';
import { initializeProfiles } from './profiles-ui.mjs';
import { fadedReportPhoto } from './profiles.mjs';
import { initializeOffline } from './offline.mjs';

const $ = id => document.getElementById(id);
const form = $('setup-form');
const tapButton = $('tap-button');
const tapFeedback = createTapFeedback();
let capture = null;
let activeView = 'setup';
let animation = null;
let wakeLock = null;
let wakeGeneration = 0;
let resetDestination = 'capture';
let profilesReturnView = 'setup';
let preparedPdf = null;
let pdfGeneration = 0;
let pdfModule;
let offline;
const profiles = initializeProfiles({ onChange: () => offline?.refresh() });
function saveSetupForUpdate() {
  try {
    const values = Object.fromEntries(new FormData(form));
    values.profileId = $('race-profile').value;
    sessionStorage.setItem('race-data-update-setup', JSON.stringify(values));
  } catch { /* Profiles are independently retained in IndexedDB. */ }
}
offline = initializeOffline({
  guard: () => capture?.timestamps.length ? capture.state === 'running' ? 'race' : 'results'
    : profiles.hasUnsavedChanges() ? 'profile' : '',
  beforeReload: saveSetupForUpdate,
  onLock: value => {
    document.querySelector('main').inert = value;
    document.querySelector('.steps').inert = value;
    $('open-profiles').disabled = value || capture?.state === 'running' || capture?.state === 'interrupted';
  },
});
function clearExport() {
  $('export-csv').disabled = capture?.state !== 'complete';
  $('export-status').replaceChildren();
}

async function preparePdf() {
  if (preparedPdf || capture?.state !== 'complete') return;
  const generation = ++pdfGeneration;
  const race = capture;
  $('export-pdf').disabled = true;
  $('export-pdf').textContent = 'Preparing PDF…';
  $('pdf-status').textContent = 'Preparing your landscape report…';
  try {
    pdfModule ??= await import('./pdf-report.mjs');
    const portrait = await fadedReportPhoto(race.config.photo);
    const file = await pdfModule.createRacePdf(race.config, race.timestamps, { portrait });
    if (generation !== pdfGeneration || capture !== race) return;
    preparedPdf = file;
    $('export-pdf').disabled = false;
    $('export-pdf').textContent = 'Download PDF';
    $('pdf-status').textContent = `Landscape PDF ready · ${file.pages} page${file.pages === 1 ? '' : 's'}.`;
  } catch {
    if (generation !== pdfGeneration || capture !== race) return;
    $('export-pdf').disabled = false; $('export-pdf').textContent = 'Retry PDF';
    $('pdf-status').textContent = 'Could not prepare the PDF. Retry PDF or download your CSV.';
  }
}

const labels = {
  GO: 'GO', HEAD_15M: '15m', SR_START: 'Start stroke rate',
  SR_STOP: 'Stop stroke rate', WALL: 'Wall / split', FINAL_5M: '5m to go', FINISH: 'Finish',
};
const prompts = {
  GO: ['ON THE START SIGNAL', 'GO', 'Tap to start the race timer'],
  HEAD_15M: ['HEAD AT THE 15m MARK', 'Tap at 15m', 'Record 15m from the starting or turning wall'],
  SR_START: ['AFTER THE 15m TAP', 'Start stroke rate', 'Tap on your chosen stroke-cycle reference point'],
  SR_STOP: ['AFTER 3 COMPLETE CYCLES', 'Stop stroke rate', 'Tap at the same point, three complete cycles later'],
  WALL: ['AT THE TURNING WALL', 'Wall / split', 'Tap at the wall to record this length'],
  FINAL_5M: ['5 METRES FROM THE FINISH', '5m to go', 'Tap when the swimmer reaches the final 5m mark'],
  FINISH: ['AT THE FINISHING TOUCH', 'FINISH', 'Tap to stop the timer and complete the race'],
};
const now = () => performance.now() / 1000;
const formatNumber = value => value === null ? '—' : value.toFixed(2);

function readConfig() {
  const data = new FormData(form);
  return { distance: Number(data.get('distance')), pool: Number(data.get('pool')),
    stroke: data.get('stroke'), swimmer: data.get('swimmer').trim(), meet: data.get('meet').trim(),
    ...profiles.forRace(), raceDate: new Date().toISOString() };
}

function syncSetup() {
  let config = readConfig();
  const options = [...form.querySelectorAll('input[name="distance"]')];
  for (const option of options) {
    try { sequence({ ...config, distance: Number(option.value) }); option.disabled = false; }
    catch { option.disabled = true; }
  }
  if (options.find(option => option.checked)?.disabled) {
    const valid = options.filter(option => !option.disabled);
    const replacement = valid.find(option => Number(option.value) >= config.distance) ?? valid[0];
    replacement.checked = true;
    config = readConfig();
  }
  $('preview-distance').textContent = config.distance;
  $('preview-stroke').textContent = config.stroke === 'IM' ? 'Individual medley' : config.stroke;
  $('preview-course').textContent = `${config.pool === 25 ? 'SC' : 'LC'} / ${config.pool}m`;
  $('preview-lengths').textContent = `${config.distance / config.pool} lengths`;
  $('preview-taps').textContent = `${sequence(config).length} taps`;
  $('setup-error').hidden = true;
}

function showView(view) {
  activeView = view;
  document.body.dataset.view = view;
  for (const name of ['setup', 'capture', 'results', 'profiles']) {
    $(`${name}-view`).hidden = name !== view;
    const nav = $(`nav-${name}`);
    if (!nav) continue;
    if (name === view) nav.setAttribute('aria-current', 'step');
    else nav.removeAttribute('aria-current');
  }
  $('nav-setup').disabled = !!capture && capture.state !== 'ready';
  $('nav-capture').disabled = !capture || capture.state === 'complete';
  $('nav-results').disabled = capture?.state !== 'complete';
  $('open-profiles').disabled = capture?.state === 'running' || capture?.state === 'interrupted';
  offline.refresh();
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function eventDescription() {
  const { distance, stroke, pool } = capture.config;
  return `${distance}m ${stroke === 'IM' ? 'IM' : stroke} · ${pool}m pool`;
}

function paintClock() {
  const time = formatClock(capture ? capture.elapsed(now()) : 0, capture?.state === 'running');
  const [main, decimals] = time.split('.');
  $('race-clock').replaceChildren(document.createTextNode(main));
  const small = document.createElement('span');
  small.textContent = `.${decimals}`;
  $('race-clock').append(small);
}

function tick() {
  if (capture?.state !== 'running') { animation = null; return; }
  paintClock();
  animation = requestAnimationFrame(tick);
}

async function releaseWakeLock() {
  wakeGeneration++;
  const held = wakeLock;
  wakeLock = null;
  try { await held?.release(); } catch { /* Best effort only. */ }
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  const generation = ++wakeGeneration;
  try {
    const held = await navigator.wakeLock.request('screen');
    if (generation !== wakeGeneration || !capture || !['ready', 'running'].includes(capture.state)) {
      await held.release();
      return;
    }
    wakeLock = held;
  } catch { /* Keep the instruction to leave the screen open. */ }
}

function paintLiveSplits() {
  const splits = capture.splits();
  const lengthCount = capture.config.distance / capture.config.pool;
  const currentLength = capture.next?.length || 1;
  $('live-splits').replaceChildren();
  for (let i = 1; i <= lengthCount; i++) {
    const row = document.createElement('div');
    row.className = 'live-split';
    row.dataset.current = String(i === currentLength);
    const name = document.createElement('span');
    name.textContent = `${i * capture.config.pool}m`;
    const time = document.createElement('strong');
    time.textContent = splits[i - 1] ? formatNumber(splits[i - 1].split) : '—';
    row.append(name, time);
    $('live-splits').append(row);
  }
  const currentRow = $('live-splits').querySelector('[data-current="true"]');
  if (currentRow) $('live-splits').scrollTop = Math.max(0, currentRow.offsetTop - $('live-splits').firstElementChild.offsetTop - 65);
}

function paintCapture() {
  const next = capture.next;
  if (!next) return;
  $('nav-setup').disabled = capture.state !== 'ready';
  $('open-profiles').disabled = capture.state !== 'ready';
  offline.refresh();
  const count = capture.timestamps.length;
  const lengthCount = capture.config.distance / capture.config.pool;
  const length = Math.max(1, next.length);
  $('capture-swimmer').textContent = capture.config.swimmer;
  $('capture-meet').textContent = capture.config.meet;
  $('capture-event').textContent = eventDescription();
  $('length-indicator').textContent = `LENGTH ${length} / ${lengthCount}${capture.config.stroke === 'IM' && next.type !== 'GO' ? ` · ${next.stroke.toUpperCase()}` : ''}`;
  $('capture-progress-fill').style.width = `${count / capture.events.length * 100}%`;
  const [kicker, label, help] = prompts[next.type];
  $('tap-kicker').textContent = kicker;
  $('tap-label').textContent = label;
  $('tap-help').textContent = help;
  $('tap-number').textContent = `TAP ${count + 1} OF ${capture.events.length}`;
  tapButton.dataset.finish = String(next.type === 'FINISH');
  tapButton.disabled = capture.state === 'interrupted';
  tapButton.setAttribute('aria-label', `${label}. ${help}`);
  $('next-prompt').textContent = labels[capture.events[count + 1]?.type] ?? 'Race results';
  $('capture-status').replaceChildren();
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  $('capture-status').append(dot, document.createTextNode(capture.state === 'ready' ? 'READY TO START'
    : capture.state === 'interrupted' ? 'CAPTURE INTERRUPTED' : 'RACE IN PROGRESS'));
  $('interruption').hidden = capture.state !== 'interrupted';
  if (count) {
    $('last-tap-time').textContent = formatClock(capture.timestamps.at(-1) - capture.timestamps[0]);
    const event = capture.events[count - 1];
    $('last-tap-label').textContent = event.type === 'GO' ? 'Start signal recorded' : `Length ${event.length} · ${labels[event.type]}`;
  } else {
    $('last-tap-time').textContent = '—';
    $('last-tap-label').textContent = 'Waiting for the start';
  }
  paintClock();
  paintLiveSplits();
}

function appendRow(body, values) {
  const row = document.createElement('tr');
  for (const value of values) {
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(cell);
  }
  body.append(row);
}

function paintResults() {
  const result = capture.results();
  $('results-identity').textContent = `${capture.config.swimmer} · ${capture.config.meet}`;
  $('results-event').textContent = eventDescription();
  $('result-total').textContent = formatClock(result.total);
  $('summary-splits').hidden = result.summarySplitDistance === null;
  $('summary-splits-title').textContent = `${result.summarySplitDistance}m ${capture.config.distance >= 800 ? 'splits' : capture.config.stroke === 'IM' && capture.config.distance === 400 ? 'stroke splits' : 'half splits'}`;
  $('summary-splits-content').replaceChildren();
  $('average-pace').hidden = result.average100Pace === null;
  $('result-average').textContent = result.average100Pace === null ? '' : formatClock(result.average100Pace);
  if (capture.config.distance >= 800) {
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const heading = document.createElement('tr');
    for (const label of ['Distance', '100m split', 'Cumulative']) {
      const cell = document.createElement('th');
      cell.scope = 'col'; cell.textContent = label; heading.append(cell);
    }
    head.append(heading);
    const body = document.createElement('tbody');
    for (const row of result.summarySplits) appendRow(body, [
      `${row.from}–${row.to}m`, formatClock(row.split), formatClock(row.cumulative),
    ]);
    table.append(head, body);
    $('summary-splits-content').append(table);
  } else {
    const cards = document.createElement('div');
    cards.className = 'split-cards';
    for (const row of result.summarySplits) {
      const card = document.createElement('div');
      card.className = 'split-card';
      const label = document.createElement('span');
      label.textContent = `${row.from}–${row.to}m${row.stroke ? ` · ${row.stroke}` : ''}`;
      const value = document.createElement('strong');
      value.textContent = formatClock(row.split);
      card.append(label, value);
      cards.append(card);
    }
    $('summary-splits-content').append(cards);
  }
  $('result-start').textContent = formatNumber(result.start15m);
  $('result-final').textContent = formatNumber(result.final5m);
  $('result-rows').replaceChildren();
  for (const row of result.lengths) appendRow($('result-rows'), [
    `${row.length * capture.config.pool}m`, row.stroke, formatNumber(row.split),
    formatNumber(row.cumulative), formatNumber(row.turn15m), formatNumber(row.strokeRate),
    formatNumber(row.surfaceSpeed), formatNumber(row.estimatedDPS),
  ]);
  $('event-log-rows').replaceChildren();
  for (const [i, event] of result.events.entries()) appendRow($('event-log-rows'), [
    i + 1, event.length || '—', labels[event.type], formatNumber(event.t - capture.timestamps[0]),
  ]);
  $('event-log-count').textContent = `${result.events.length} taps`;
  clearExport();
  showView('results');
  $('results-title').setAttribute('tabindex', '-1');
  $('results-title').focus({ preventScroll: true });
  void preparePdf();
}

function recordTap() {
  const timestamp = now(); // Capture before layout, calculation, or asynchronous work.
  if (offline.locked || activeView !== 'capture' || $('reset-dialog').open || !capture) return;
  if (!capture.record(timestamp)) return;
  tapFeedback.beep();
  if (capture.state === 'complete') {
    cancelAnimationFrame(animation);
    animation = null;
    void releaseWakeLock();
    paintResults();
    return;
  }
  paintCapture();
  if (animation === null) animation = requestAnimationFrame(tick);
  if (!wakeLock) void requestWakeLock();
}

form.addEventListener('input', () => {
  for (const input of [$('swimmer'), $('meet')]) input.setCustomValidity('');
  syncSetup();
});
form.addEventListener('change', syncSetup);
form.addEventListener('submit', event => {
  event.preventDefault();
  if (offline.locked) return;
  for (const input of [$('swimmer'), $('meet')]) {
    input.setCustomValidity(input.value.trim() ? '' : `Enter a ${input.id === 'swimmer' ? 'swimmer' : 'meet'} name.`);
  }
  if (!form.reportValidity()) return;
  try { capture = new RaceCapture(readConfig()); }
  catch (error) { $('setup-error').textContent = error.message; $('setup-error').hidden = false; return; }
  tapFeedback.prepare();
  showView('capture');
  paintCapture();
  tapButton.focus({ preventScroll: true });
  void requestWakeLock();
});

tapButton.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  recordTap();
});
// Keyboard and assistive-technology activation; ignore the synthetic click after pointerdown.
tapButton.addEventListener('click', event => { if (event.detail === 0) recordTap(); });
tapButton.addEventListener('keydown', event => {
  if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
});
tapButton.addEventListener('contextmenu', event => event.preventDefault());

function askReset(destination) {
  resetDestination = destination;
  const newRace = destination === 'setup';
  $('dialog-title').textContent = newRace ? 'Start a new race?' : 'Reset this race?';
  $('dialog-copy').textContent = newRace ? 'This race will be cleared. Your setup details will stay.'
    : 'Recorded taps will be cleared. Your race details will stay.';
  $('reset-dialog').querySelector('[value="reset"]').textContent = newRace ? 'New race' : 'Reset race';
  $('reset-dialog').returnValue = 'cancel';
  $('reset-dialog').showModal();
}
$('reset-race').addEventListener('click', () => askReset('capture'));
$('new-race').addEventListener('click', () => askReset('setup'));
$('reset-dialog').addEventListener('close', () => {
  if ($('reset-dialog').returnValue !== 'reset') { if (activeView === 'capture') tapButton.focus(); return; }
  clearExport();
  preparedPdf = null; pdfGeneration++; $('pdf-status').replaceChildren();
  cancelAnimationFrame(animation);
  animation = null;
  void releaseWakeLock();
  capture = resetDestination === 'capture' ? new RaceCapture(capture.config) : null;
  showView(resetDestination);
  if (capture) { paintCapture(); tapButton.focus({ preventScroll: true }); void requestWakeLock(); }
});
$('nav-setup').addEventListener('click', () => {
  if (!capture || capture.state === 'ready') { showView('setup'); void releaseWakeLock(); }
});
$('nav-capture').addEventListener('click', () => {
  if (!capture || capture.state === 'complete') return;
  showView('capture'); paintCapture(); void requestWakeLock();
});
$('nav-results').addEventListener('click', () => { if (capture?.state === 'complete') paintResults(); });
$('open-profiles').addEventListener('click', () => {
  if (capture?.state === 'running' || capture?.state === 'interrupted') return;
  if (activeView === 'profiles') return;
  profilesReturnView = activeView;
  showView('profiles');
});
$('close-profiles').addEventListener('click', () => showView(profilesReturnView));
$('export-pdf').addEventListener('click', () => {
  if (capture?.state !== 'complete') return;
  if (!preparedPdf) { void preparePdf(); return; }
  try {
    pdfModule.downloadRacePdf(preparedPdf);
    $('pdf-status').textContent = 'PDF download requested. Open the .pdf file to view your report.';
  } catch { $('pdf-status').textContent = 'Could not start the PDF download. Your results are still here.'; }
});
$('export-csv').addEventListener('click', () => {
  if (capture?.state !== 'complete') return;
  try {
    downloadCsv(capture.config, capture.timestamps);
    $('export-status').textContent = 'CSV download requested. Open the .csv file in Excel.';
  } catch {
    $('export-status').textContent = 'Could not start the CSV download. Your results are still here.';
  }
});
$('theme-toggle').addEventListener('click', () => {
  const light = document.documentElement.dataset.theme !== 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  $('theme-toggle').setAttribute('aria-label', `Switch to ${light ? 'dark' : 'light'} theme`);
  document.querySelector('meta[name="theme-color"]').content = light ? '#f4f5f0' : '#10191f';
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (capture?.interrupt(now())) {
      cancelAnimationFrame(animation); animation = null;
      if (activeView === 'capture') paintCapture();
    }
    void releaseWakeLock();
  } else if (activeView === 'capture' && capture?.state === 'ready') void requestWakeLock();
});
window.addEventListener('beforeunload', event => {
  if (capture?.timestamps.length) { event.preventDefault(); event.returnValue = ''; }
});
$('race-clock').setAttribute('role', 'timer');
$('race-clock').setAttribute('aria-live', 'off');
$('capture-status').setAttribute('aria-live', 'polite');
try {
  const values = JSON.parse(sessionStorage.getItem('race-data-update-setup') || 'null');
  if (values) {
    for (const name of ['swimmer', 'meet']) if (typeof values[name] === 'string') $(name).value = values[name];
    for (const name of ['pool', 'distance']) {
      const field = [...form.querySelectorAll(`input[name="${name}"]`)].find(input => input.value === values[name]);
      if (field) field.checked = true;
    }
    if ([...$('stroke').options].some(option => option.value === values.stroke)) $('stroke').value = values.stroke;
    void profiles.restoreRaceSelection(values.profileId, values.swimmer);
    sessionStorage.removeItem('race-data-update-setup');
  }
} catch { /* A blocked session store does not block timing. */ }
syncSetup();
