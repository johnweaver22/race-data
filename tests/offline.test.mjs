import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { MessageChannel } from 'node:worker_threads';

const scope = 'https://example.test/race-data/docs/';
const config = JSON.parse(await readFile(new URL('../docs/offline-release.json', import.meta.url)));
const source = await readFile(new URL('../web/sw-template.js', import.meta.url), 'utf8');
const prefix = `race-data:/race-data/docs/:release:`;

class CacheStorage {
  stores = new Map();
  async open(name) {
    if (!this.stores.has(name)) {
      const values = new Map();
      const key = input => typeof input === 'string' ? input : input.url;
      this.stores.set(name, {
        put: async (input, response) => { values.set(key(input), response.clone()); },
        match: async input => values.get(key(input))?.clone(),
        delete: async input => values.delete(key(input)),
        keys: async () => [...values.keys()],
      });
    }
    return this.stores.get(name);
  }
  async has(name) { return this.stores.has(name); }
  async keys() { return [...this.stores.keys()]; }
  async delete(name) { return this.stores.delete(name); }
}

function client({ safe = true, release = config.release, responds = true, url = scope } = {}) {
  return { url, safe, release, responds, received: [], postMessage(data, ports = []) {
    this.received.push(data);
    if (this.responds && ports[0]) {
      ports[0].postMessage(data.type === 'CAN_APPLY_UPDATE' ? { safe: this.safe, release: this.release } : { release: this.release });
      ports[0].close();
    }
  } };
}

function environment({ caches = new CacheStorage(), cfg = config, clients = [] } = {}) {
  const handlers = {};
  const state = { online: true, corrupt: '', fetches: 0, skipped: 0, claimed: 0 };
  const self = { registration: { scope }, clients: { matchAll: async () => clients, claim: async () => state.claimed++ },
    addEventListener: (type, fn) => { handlers[type] = fn; }, skipWaiting: async () => state.skipped++ };
  const fetch = async request => {
    state.fetches++;
    if (!state.online) throw new Error('Network is offline');
    const url = typeof request === 'string' ? request : request.url;
    let name = url.slice(scope.length).split('?')[0];
    if (name === state.corrupt) return new Response('<html>wrong deployment</html>');
    name = name.replace(cfg.release, config.release);
    try { return new Response(await readFile(new URL(`../docs/${name}`, import.meta.url)), { headers: { 'Content-Type': name.endsWith('.html') ? 'text/html' : 'text/javascript' } }); }
    catch { return new Response('Not found', { status: 404 }); }
  };
  const context = vm.createContext({ self, caches, fetch, crypto: webcrypto, URL, Request, Response, Headers,
    Uint8Array, MessageChannel, setTimeout, clearTimeout, console });
  vm.runInContext(source.replace('__OFFLINE_CONFIG__', JSON.stringify(cfg)), context);
  const emit = async (type, extra = {}) => {
    let work, response;
    handlers[type]({ ...extra, waitUntil: p => { work = p; }, respondWith: p => { response = p; } });
    await work;
    return response === undefined ? undefined : await response;
  };
  const message = async (data, requester = clients[0] ?? client()) => {
    let answer;
    await emit('message', { source: requester, data, ports: [{ postMessage: value => { answer = value; } }] });
    return answer;
  };
  return { state, emit, message, caches, clients };
}

test('offline build caches the entire module graph, fonts, PDF tools and install icons', async () => {
  const names = new Set(config.files.map(file => file.path));
  for (const ending of ['pdf-report.mjs', 'report-font-data.mjs', 'report-fonts.mjs', 'vendor/pdf-lib.esm.min.mjs', 'profiles.mjs', 'offline.mjs']) {
    assert.ok([...names].some(name => name.endsWith('/' + ending)), ending);
  }
  assert.ok(names.has('assets/race-data-icon-512.png'));
  assert.ok(names.has('manifest.webmanifest'));
  for (const file of config.files.filter(file => file.path.endsWith('.mjs'))) {
    const content = await readFile(new URL('../docs/' + file.path, import.meta.url), 'utf8');
    const imports = [...content.matchAll(/(?:from\s+|import\()['"](\.\/[^'"]+)['"]/g)].map(match => match[1]);
    for (const module of imports) {
      const resolved = new URL(module, new URL(file.path, scope)).href.slice(scope.length);
      assert.ok(names.has(resolved), `${file.path} depends on uncached ${resolved}`);
    }
  }
  const manifest = JSON.parse(await readFile(new URL('../docs/manifest.webmanifest', import.meta.url)));
  assert.equal(manifest.start_url, './'); assert.equal(manifest.scope, './'); assert.equal(manifest.display, 'standalone');
});

test('app navigation, arbitrary version queries and every dependency work with all network access failing', async () => {
  const env = environment();
  await env.emit('install');
  assert.equal(env.state.skipped, 0, 'install must never force an update');
  await env.emit('activate');
  assert.equal((await env.message({ type: 'OFFLINE_STATUS', release: config.release })).ready, true);
  env.state.online = false;
  const requests = env.state.fetches;
  for (const route of [scope, scope + '?v=old-bookmark', scope + 'index.html']) {
    const response = await env.emit('fetch', { request: { url: route, method: 'GET', mode: 'navigate' } });
    const text = await response.text();
    assert.ok(text.includes(config.release)); assert.ok(text.includes('id="export-pdf"'));
  }
  for (const file of config.files) {
    const response = await env.emit('fetch', { request: new Request(new URL(file.path, scope)) });
    assert.ok(response?.ok, file.path); assert.ok((await response.arrayBuffer()).byteLength, file.path);
  }
  assert.equal(env.state.fetches, requests, 'cached use must not need even one network request');
  assert.equal(await env.emit('fetch', { request: new Request('https://example.test/swim-timer/') }), undefined);
  assert.equal(await env.emit('fetch', { request: new Request(scope + 'api/test', { method: 'POST', body: 'race data' }) }), undefined);
});

test('a wrong/missing update file cannot replace or delete the working cache', async () => {
  const env = environment(); await env.emit('install');
  const next = { ...config, release: '0.4.1-incomplete', version: '0.4.1' };
  const updated = environment({ caches: env.caches, cfg: next });
  updated.state.corrupt = config.files.find(file => file.path.endsWith('/report-font-data.mjs')).path;
  await assert.rejects(updated.emit('install'), /does not match/);
  assert.equal(await updated.caches.has(prefix + next.release), false);
  env.state.online = false;
  assert.equal((await env.message({ type: 'OFFLINE_STATUS', release: config.release })).ready, true);
  assert.equal(updated.state.skipped, 0);
});

test('the approving tab must be safe; other busy or suspended race tabs are never reloaded', async () => {
  const busy = client({ safe: false }), safe = client();
  const env = environment({ clients: [busy, safe] }); await env.emit('install');
  const blocked = await env.message({ type: 'APPLY_UPDATE' });
  assert.equal(blocked.applied, false); assert.equal(env.state.skipped, 0);
  assert.equal(safe.received.length, 0, 'other tabs must not be locked or reloaded');
  busy.safe = true;
  assert.equal((await env.message({ type: 'APPLY_UPDATE' })).applied, true);
  assert.equal(env.state.skipped, 1);
  const suspended = client({ responds: false });
  const old = environment({ clients: [suspended] });
  assert.equal((await old.message({ type: 'APPLY_UPDATE' }, client())).applied, true);
  assert.equal(suspended.received.length, 0);
  assert.equal(old.state.skipped, 1);
  const unknownRequester = environment();
  assert.equal((await unknownRequester.message({ type: 'APPLY_UPDATE' }, client({ responds: false }))).applied, false);
  assert.equal(unknownRequester.state.skipped, 0);
});

test('a new worker retains immutable files for old tabs and never touches Swim Clock caches', async () => {
  const storage = new CacheStorage();
  await (await storage.open('swim-clock-do-not-touch')).put('https://example.test/swim-timer/', new Response('clock'));
  const old = environment({ caches: storage }); await old.emit('install');
  const next = { ...config, version: '0.4.1', release: '0.4.1-update-test',
    shell: config.shell.replace(config.release, '0.4.1-update-test'),
    files: config.files.map(file => ({ ...file, path: file.path.replace(config.release, '0.4.1-update-test') })) };
  const live = client({ release: config.release });
  const updated = environment({ caches: storage, cfg: next, clients: [live] });
  await updated.emit('install'); await updated.emit('activate'); updated.state.online = false;
  const oldPdf = config.files.find(file => file.path.endsWith('/pdf-report.mjs')).path;
  const response = await updated.emit('fetch', { request: new Request(new URL(oldPdf, scope)) });
  assert.ok((await response.text()).includes('createRacePdf'));
  assert.equal(await storage.has('swim-clock-do-not-touch'), true);
  assert.equal(await storage.has(prefix + config.release), true);
});

test('offline readiness detects missing cached export tools and repair only succeeds after reconnecting', async () => {
  const env = environment(); await env.emit('install');
  const pdf = config.files.find(file => file.path.endsWith('/pdf-report.mjs'));
  await (await env.caches.open(prefix + config.release)).delete(new URL(pdf.path, scope).href);
  assert.equal((await env.message({ type: 'OFFLINE_STATUS', release: config.release })).ready, false);
  env.state.online = false;
  assert.equal((await env.message({ type: 'REPAIR_CACHE', release: config.release })).ready, false);
  env.state.online = true;
  assert.equal((await env.message({ type: 'REPAIR_CACHE', release: config.release })).ready, true);
  assert.equal((await env.message({ type: 'OFFLINE_STATUS', release: config.release })).ready, true);
});

test('the visible update control blocks races, unexported results and profile edits; reload requires the update lock', async () => {
  const code = (await readFile(new URL('../web/offline.mjs', import.meta.url), 'utf8'))
    .replace(/^import[^\n]+\n/, `const APP_VERSION='${config.version}', APP_RELEASE='${config.release}';\n`)
    .replace('export function initializeOffline', 'globalThis.initializeOffline = function');
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { hidden: false, disabled: false, textContent: '', dataset: {}, handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; } });
    return elements.get(id);
  };
  const listeners = {}, events = {}, state = { reason: '', reloads: 0, updateMessages: 0, locks: [], saves: 0 };
  const active = { postMessage(data, ports) { ports[0].postMessage({ ready: true, release: config.release }); ports[0].close(); } };
  const waiting = { postMessage(data, ports) { state.updateMessages++; ports[0].postMessage({ applied: true }); ports[0].close(); } };
  const reg = { scope, active, waiting, update: async () => {}, addEventListener() {} };
  const navigator = { onLine: true, serviceWorker: { controller: active,
    getRegistration: async () => reg, ready: Promise.resolve(reg), addEventListener: (type, fn) => { listeners[type] = fn; } } };
  const context = vm.createContext({ document: { baseURI: scope, getElementById: element, visibilityState: 'visible' },
    navigator, window: { isSecureContext: true, addEventListener: (type, fn) => { events[type] = fn; } },
    MessageChannel, URL, console, clearTimeout, setTimeout: (fn, delay) => { const timer = setTimeout(fn, delay); timer.unref(); return timer; },
    setInterval() {}, location: { reload: () => state.reloads++ } });
  vm.runInContext(code, context);
  const api = context.initializeOffline({ guard: () => state.reason, beforeReload: () => state.saves++, onLock: v => state.locks.push(v) });
  await new Promise(resolve => setTimeout(resolve, 30));
  for (const reason of ['race', 'results', 'profile']) {
    state.reason = reason; api.refresh();
    assert.equal(element('apply-update').disabled, true);
    await element('apply-update').handlers.click();
    assert.equal(state.updateMessages, 0);
  }
  state.reason = ''; api.refresh();
  await element('apply-update').handlers.click();
  assert.equal(state.updateMessages, 1); assert.equal(api.locked, true);
  state.reason = 'race'; listeners.controllerchange(); assert.equal(state.reloads, 0);
  state.reason = ''; listeners.controllerchange(); assert.equal(state.reloads, 1);
  assert.ok(state.saves >= 2);
  // An update approved elsewhere must wait for this tab's own results to clear.
  listeners.message({ data: { type: 'UPDATE_CANCELLED' } });
  reg.waiting = null;
  active.postMessage = (data, ports) => { ports[0].postMessage({ ready: true, release: 'a-newer-release' }); ports[0].close(); };
  state.reason = 'race'; listeners.controllerchange();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(state.reloads, 1); assert.equal(element('update-notice').hidden, true);
  state.reason = ''; api.refresh();
  assert.equal(element('update-notice').hidden, false);
  await element('apply-update').handlers.click();
  assert.equal(state.reloads, 2); assert.equal(state.updateMessages, 1);
});
