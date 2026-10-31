/* RL Race Data: generated release configuration, fixed worker URL. */
const CONFIG = __OFFLINE_CONFIG__;
const SCOPE = self.registration.scope;
const PREFIX = `race-data:${new URL(SCOPE).pathname}:release:`;
const CACHE = PREFIX + CONFIG.release;
const MARKER = new URL('__offline_ready__', SCOPE).href;
const SHELL = new URL(CONFIG.shell, SCOPE).href;
const files = CONFIG.files.map(file => ({ ...file, url: new URL(file.path, SCOPE).href }));
const ownClient = client => client.url.startsWith(SCOPE);
let activating = false;

async function cacheComplete(name, expected = files) {
  if (!await caches.has(name)) return false;
  const cache = await caches.open(name);
  const marker = await cache.match(MARKER);
  if (!marker) return false;
  const data = await marker.json();
  if (data.release !== name.slice(PREFIX.length)) return false;
  const paths = expected === null ? data.files : expected.map(f => f.url);
  return (await Promise.all(paths.map(url => cache.match(url)))).every(Boolean);
}

async function prepareCache() {
  if (await cacheComplete(CACHE)) return;
  // Validate the complete immutable release before touching its cache.
  // A partial deployment or lost connection leaves the active release intact.
  const responses = await Promise.all(files.map(async file => {
    const response = await fetch(new Request(file.url, { cache: 'reload' }));
    if (!response.ok || response.type === 'opaque') throw new Error('Offline file unavailable');
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
    if (hex !== file.sha256) throw new Error('Offline file does not match this release');
    const headers = new Headers(response.headers);
    headers.delete('Content-Encoding'); headers.delete('Content-Length');
    return new Response(bytes, { status: 200, headers });
  }));
  const existed = await caches.has(CACHE);
  const cache = await caches.open(CACHE);
  try {
    await Promise.all(files.map((file, i) => cache.put(file.url, responses[i])));
    await cache.put(MARKER, new Response(JSON.stringify({ release: CONFIG.release, version: CONFIG.version,
      createdAt: Date.now(), files: files.map(f => f.url) }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (error) {
    if (!existed) await caches.delete(CACHE);
    throw error;
  }
}

self.addEventListener('install', event => event.waitUntil(prepareCache()));

function ask(client, type) {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = value => { clearTimeout(timer); channel.port1.close(); resolve(value); };
    const timer = setTimeout(() => finish(null), 1800);
    channel.port1.onmessage = event => finish(event.data);
    try { client.postMessage({ type, release: CONFIG.release }, [channel.port2]); }
    catch { finish(null); }
  });
}

async function cleanup() {
  const clients = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(ownClient);
  const versions = await Promise.all(clients.map(client => ask(client, 'GET_CLIENT_RELEASE')));
  // Unknown/older tabs may still need their cached PDF dependencies.
  if (versions.some(value => !value?.release)) return;
  const keep = new Set([CONFIG.release, ...versions.map(v => v.release)]);
  const cached = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX)) continue;
    const marker = await (await caches.open(name)).match(MARKER);
    if (marker) cached.push({ name, ...await marker.json() });
  }
  cached.sort((a, b) => b.createdAt - a.createdAt).slice(0, 2).forEach(value => keep.add(value.release));
  await Promise.all(cached.filter(value => !keep.has(value.release)).map(value => caches.delete(value.name)));
}

self.addEventListener('activate', event => event.waitUntil((async () => {
  await self.clients.claim();
  await cleanup();
})()));

async function cachedResponse(request) {
  const url = new URL(request.url);
  const cache = await caches.open(CACHE);
  const base = new URL(SCOPE);
  const navigation = request.mode === 'navigate' && [base.pathname, base.pathname + 'index.html'].includes(url.pathname);
  if (navigation) {
    const shell = await cache.match(SHELL);
    if (shell) return new Response(shell.body, { status: 200, headers: shell.headers });
  }
  const exact = await cache.match(request, { ignoreSearch: false });
  if (exact) return exact;
  // Old tabs keep requesting their own immutable release URLs after an update.
  if (url.pathname.startsWith(base.pathname + 'releases/')) {
    for (const name of await caches.keys()) {
      if (!name.startsWith(PREFIX) || name === CACHE) continue;
      const match = await (await caches.open(name)).match(request);
      if (match) return match;
    }
  }
  return fetch(request);
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== new URL(SCOPE).origin || !url.href.startsWith(SCOPE)) return;
  // sw.js is always checked by the browser against the network.
  if (url.pathname === new URL('sw.js', SCOPE).pathname) return;
  event.respondWith(cachedResponse(event.request));
});

self.addEventListener('message', event => {
  if (!event.source?.url || !ownClient(event.source)) return;
  const reply = message => event.ports[0]?.postMessage(message);
  if (event.data?.type === 'OFFLINE_STATUS') {
    event.waitUntil((async () => {
      const release = event.data.release;
      const ready = typeof release === 'string' && /^[a-zA-Z0-9._-]+$/.test(release)
        ? await cacheComplete(PREFIX + release, release === CONFIG.release ? files : null) : false;
      reply({ ready, release: CONFIG.release, version: CONFIG.version });
    })());
  } else if (event.data?.type === 'REPAIR_CACHE') {
    event.waitUntil((async () => {
      if (event.data.release !== CONFIG.release) { reply({ ready: false }); return; }
      try { await prepareCache(); reply({ ready: true }); } catch { reply({ ready: false }); }
    })());
  } else if (event.data?.type === 'APPLY_UPDATE' && !activating) {
    activating = true;
    let participants = [];
    event.waitUntil((async () => {
      const clients = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(ownClient);
      participants = clients;
      const answers = await Promise.all(clients.map(client => ask(client, 'CAN_APPLY_UPDATE')));
      if (answers.some(value => value?.safe !== true)) {
        const reason = 'Finish/export races and save profile edits in other Race Data tabs, or close those tabs.';
        clients.forEach(client => client.postMessage({ type: 'UPDATE_CANCELLED', reason }));
        reply({ applied: false, reason });
        activating = false;
        return;
      }
      reply({ applied: true });
      await self.skipWaiting();
    })().catch(() => {
      activating = false;
      const reason = 'Could not apply update. Your current app is unchanged.';
      participants.forEach(client => client.postMessage({ type: 'UPDATE_CANCELLED', reason }));
      reply({ applied: false, reason });
    }));
  }
});
