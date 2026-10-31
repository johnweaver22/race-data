import { compute } from './engine.mjs';

export const CSV_MIME = 'text/csv;charset=utf-8';

function csvCell(value) {
  if (value === null || value === undefined) return '';
  // Keep names literal when opened in Excel. Numeric metrics remain numeric.
  const text = typeof value === 'string' && /^[\s]*[=+@-]/u.test(value) ? `'${value}` : String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createCsvExport(config, timestamps, date = new Date()) {
  const result = compute(config, timestamps);
  const rows = [
    ['Race Data'],
    ['Swimmer', config.swimmer], ['Meet', config.meet],
    ['Race distance (m)', config.distance], ['Pool length (m)', config.pool],
    ['Stroke', config.stroke === 'IM' ? 'Individual medley' : config.stroke],
    ['Exported at (UTC)', date.toISOString()], [],
    ['Summary', 'Seconds'], ['Finish time', result.total],
    ['Start to 15m', result.start15m], ['Final 5m', result.final5m],
  ];
  if (result.average100Pace !== null) rows.push(['Average 100m pace', result.average100Pace]);
  rows.push([]);
  if (result.summarySplitDistance !== null) {
    const kind = config.distance >= 800 ? 'splits'
      : config.distance === 400 && config.stroke === 'IM' ? 'stroke splits' : 'half splits';
    rows.push([`${result.summarySplitDistance}m ${kind}`],
      ['From (m)', 'To (m)', 'Stroke', 'Split (s)', 'Cumulative (s)']);
    for (const row of result.summarySplits) rows.push([row.from, row.to, row.stroke ?? config.stroke, row.split, row.cumulative]);
    rows.push([]);
  }
  rows.push(['Length metrics'], ['Length', 'Distance (m)', 'Stroke', 'Split (s)', 'Cumulative (s)',
    'Start to 15m (s)', 'Turn to 15m (s)', 'Stroke rate (cycles/min)', 'Estimated surface speed (m/s)', 'Estimated DPS (m/cycle)']);
  for (const row of result.lengths) rows.push([row.length, row.length * config.pool, row.stroke,
    row.split, row.cumulative, row.start15m, row.turn15m, row.strokeRate, row.surfaceSpeed, row.estimatedDPS]);
  rows.push([], ['Surface speed and DPS are estimates. Same-stroke freestyle/backstroke turns use a fixed 0.8s and 1m allowance.'],
    ['Open turns, IM stroke changes and finishes use no allowance. Blank metrics are unavailable.']);
  // UTF-8 BOM preserves swimmer names and symbols in Excel; CRLF is standard CSV.
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function csvFilename(config, date = new Date()) {
  const safe = value => String(value).normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 45) || 'Race';
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1Z');
  return `Race-Data_${safe(config.swimmer)}_${config.distance}m-${safe(config.stroke)}_${stamp}.csv`;
}

export function downloadCsv(config, timestamps, scope = globalThis) {
  const date = new Date();
  const blob = new Blob([createCsvExport(config, timestamps, date)], { type: CSV_MIME });
  const url = scope.URL.createObjectURL(blob);
  const link = scope.document.createElement('a');
  link.href = url;
  link.download = csvFilename(config, date);
  scope.document.body.append(link);
  link.click();
  link.remove();
  scope.setTimeout(() => scope.URL.revokeObjectURL(url), 60000);
}
