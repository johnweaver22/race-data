import { APP_VERSION, APP_RELEASE } from './app-info.mjs';

export function initializeOffline({ guard, beforeReload, onLock }) {
  const $ = id => document.getElementById(id);
  const unavailable = { refresh() {}, get locked() { return false; } };
  if (!$('offline-status')) return unavailable;
  let registration, ready = false, checking = false, locked = false, previousController = false;
  let waiting = null, checkLater = false, lockTimer, lastCheck = 0, installPrompt;
  const label = $('offline-status'), button = $('apply-update'), notice = $('update-notice');
  $('app-version').textContent = `v${APP_VERSION}`;
  function lock(value) {
    locked = value; onLock(value); clearTimeout(lockTimer);
    // If a browser delays activation, leave the race protected by guard().
    if (value) lockTimer = setTimeout(() => { lock(false); render(); }, 20000);
  }
  function render() {
    const reason = guard();
    const racing = reason === 'race';
    label.textContent = ready ? `Offline ready${navigator.onLine === false ? ' · Offline' : ''}`
      : navigator.onLine === false ? 'Not ready offline · Reconnect to finish setup' : 'Preparing offline use…';
    label.dataset.ready = String(ready);
    $('check-updates').disabled = checking || locked || !!reason || navigator.onLine === false;
    notice.hidden = !waiting || racing;
    button.disabled = locked || !!reason;
    if (waiting && !locked) $('update-copy').textContent = reason
      ? reason === 'results' ? 'Update ready. Export this race, then choose New race to apply it.' : 'Update ready. Save your swimmer changes first.'
      : 'Update downloaded. Apply it when you are ready.';
    if (checkLater && !reason && !locked) { checkLater = false; void check(); }
  }
  function message(worker, data, timeout = 7000) {
    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); reject(new Error('No update response')); }, timeout);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data); };
      worker.postMessage(data, [channel.port2]);
    });
  }
  async function status(repair = false) {
    const worker = navigator.serviceWorker.controller || registration?.active;
    if (!worker) return;
    try {
      let answer = await message(worker, { type: 'OFFLINE_STATUS', release: APP_RELEASE });
      if (!answer.ready && repair && navigator.onLine !== false && answer.release === APP_RELEASE) {
        answer = await message(worker, { type: 'REPAIR_CACHE', release: APP_RELEASE }, 90000);
      }
      ready = !!answer.ready && !!navigator.serviceWorker.controller;
      render();
    } catch { ready = false; render(); }
  }
  function watch(worker) {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') { waiting = registration.waiting; render(); }
      if (worker.state === 'activated') void status();
      if (worker.state === 'redundant' && !ready) {
        label.textContent = 'Offline setup incomplete · Check updates to retry';
      }
    });
  }
  async function check(manual = false) {
    if (!registration || navigator.onLine === false || checking) return;
    if (guard() || locked) { checkLater = true; return; }
    if (!manual && Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now(); checking = true; render();
    try {
      await status(true);
      await registration.update();
      waiting = registration.waiting; render();
      if (manual && !waiting && !registration.installing) $('update-check-status').textContent = 'Your app is up to date.';
    } catch { if (manual) $('update-check-status').textContent = 'Could not check online. Your saved offline version is unchanged.'; }
    finally { checking = false; render(); }
  }
  $('check-updates').addEventListener('click', () => { $('update-check-status').textContent = ''; void check(true); });
  button.addEventListener('click', async () => {
    if (!waiting || guard() || locked) return;
    beforeReload(); lock(true); render();
    $('update-copy').textContent = 'Applying update…';
    try {
      const answer = await message(waiting, { type: 'APPLY_UPDATE' });
      if (!answer.applied) { lock(false); render(); $('update-copy').textContent = answer.reason; }
    } catch { lock(false); render(); $('update-copy').textContent = 'Update could not be applied. You can retry when ready.'; }
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event; $('install-app').hidden = false;
  });
  $('install-app').addEventListener('click', async () => {
    if (!installPrompt || guard() || locked) return;
    await installPrompt.prompt(); installPrompt = null; $('install-app').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('install-app').hidden = true; });
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    label.textContent = 'Offline mode needs a supported browser and HTTPS';
    $('check-updates').disabled = true; return unavailable;
  }
  previousController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'GET_CLIENT_RELEASE') event.ports[0]?.postMessage({ release: APP_RELEASE });
    if (event.data?.type === 'CAN_APPLY_UPDATE') {
      const safe = !guard();
      if (safe) { beforeReload(); lock(true); render(); }
      event.ports[0]?.postMessage({ safe, release: APP_RELEASE });
    }
    if (event.data?.type === 'UPDATE_CANCELLED') {
      lock(false); render();
      if (event.data.reason) $('update-copy').textContent = event.data.reason;
    }
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (previousController && locked && !guard()) { beforeReload(); location.reload(); return; }
    previousController = !!navigator.serviceWorker.controller;
    waiting = registration?.waiting ?? null;
    void status();
  });
  const workerUrl = new URL('./sw.js', document.baseURI);
  const scopeUrl = new URL('./', document.baseURI);
  const getRegistration = async () => {
    const existing = await navigator.serviceWorker.getRegistration(scopeUrl.href);
    if (existing?.scope === scopeUrl.href) return existing;
    return navigator.serviceWorker.register(workerUrl, { scope: scopeUrl.href, updateViaCache: 'none' });
  };
  void getRegistration().then(reg => {
    registration = reg; waiting = reg.waiting;
    reg.addEventListener('updatefound', () => watch(reg.installing));
    watch(reg.installing); render();
    void navigator.serviceWorker.ready.then(() => status(true));
    void check();
  }).catch(() => { label.textContent = 'Offline setup incomplete · Reopen online to retry'; });
  window.addEventListener('online', () => { render(); void check(true); });
  window.addEventListener('offline', render);
  window.addEventListener('focus', () => { void status(); void check(); });
  setInterval(() => { if (document.visibilityState === 'visible') void check(); }, 15 * 60 * 1000);
  return { refresh: render, get locked() { return locked; } };
}
