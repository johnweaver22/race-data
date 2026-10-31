/* RL Race Data: generated release configuration, fixed worker URL. */
const CONFIG = {"version":"0.4.2","release":"0.4.2-04ac704dc9a66840","shell":"releases/0.4.2-04ac704dc9a66840/shell.html","files":[{"path":"releases/0.4.2-04ac704dc9a66840/app.mjs","sha256":"e7abcb853897b8db9848955a0b4302094371cdac18fd739a09777b6310e8d29f"},{"path":"releases/0.4.2-04ac704dc9a66840/styles.css","sha256":"652156247fdc7253de3a4cc80d344240e4626729368d6a5c80067fbdcf2dc5d4"},{"path":"releases/0.4.2-04ac704dc9a66840/engine.mjs","sha256":"f5a6696c358660a6b505313111b95f0c863ffe0351e48e14b4947b42d8ecb019"},{"path":"releases/0.4.2-04ac704dc9a66840/capture-model.mjs","sha256":"375d49f4b3f98b59e12c443a69a94a9e4f0473b26a11d1eda625d5cba4a151b6"},{"path":"releases/0.4.2-04ac704dc9a66840/tap-feedback.mjs","sha256":"d9262a3dce758b51900267acfe01a7163c6320a5f6ab478f856dfaa049f6d621"},{"path":"releases/0.4.2-04ac704dc9a66840/csv-export.mjs","sha256":"dc844bda6670d252c2795fbe198bb5b46b81cb1cc9931c5b8c7524052a8096d8"},{"path":"releases/0.4.2-04ac704dc9a66840/profiles.mjs","sha256":"5c42ac6323c66a2cfcdeb3d0ff4065673e6c60afa865d3ec9ff260240db43d81"},{"path":"releases/0.4.2-04ac704dc9a66840/profiles-ui.mjs","sha256":"82119db3b82611c1dca1d9cc73c2b63fdea9a6dd47d11e5f0a0d45949b40016b"},{"path":"releases/0.4.2-04ac704dc9a66840/report-model.mjs","sha256":"f1c7bf5ea207901b2d55fee2c70aaf72859aa32877f39e37f749095c3e9b76f7"},{"path":"releases/0.4.2-04ac704dc9a66840/pdf-report.mjs","sha256":"18a6f7c487c0fe38bc1452f040fa37fc22268d8f6957f539944649df52b8a9eb"},{"path":"releases/0.4.2-04ac704dc9a66840/report-brand.mjs","sha256":"083b9f90961061b1402453bd345e5b1b2f477ea09d7bba99214a0ed743f506be"},{"path":"releases/0.4.2-04ac704dc9a66840/report-fonts.mjs","sha256":"176bad21a70bd8a382ba0ce65e083827c862d5e56cba88935961fd9395c5fbb1"},{"path":"releases/0.4.2-04ac704dc9a66840/report-font-data.mjs","sha256":"76d339ef37c372f8a6289afe39300cec9b173b537c8242bc40c49f338b06eaac"},{"path":"releases/0.4.2-04ac704dc9a66840/offline.mjs","sha256":"8b00894923af1b97f4e8649a9df5b2089eddfa204eb69e5f457ca9e57e5252ac"},{"path":"releases/0.4.2-04ac704dc9a66840/vendor/pdf-lib.esm.min.mjs","sha256":"72c052d97b4d5d9fa6cdbdcb7ad709f03d4ddb1122390cb3afeba4d88651d969"},{"path":"releases/0.4.2-04ac704dc9a66840/vendor/PDF-Lib-LICENSE.md","sha256":"f2c9fc00fdb66eb99ac156ba52d734af66d8d309f65753ae809ad34ee2883bcb"},{"path":"releases/0.4.2-04ac704dc9a66840/vendor/Report-Fonts-LICENSE.md","sha256":"e180b3d65bf650dffffd71dd21b6180767b469a18dd87e1d8552be69bb9ecdf0"},{"path":"manifest.webmanifest","sha256":"0245af6bec135e90c750783f5c26cc0dc88fbc892b06220126fb7590bc603c42"},{"path":"assets/race-data-icon-180.png","sha256":"0ebdd0310d5a8b8390e9081990f7561f565342a2f6a45f9b2da07d31c38a46a0"},{"path":"assets/race-data-icon-192.png","sha256":"f67dca7bc70fec98cd7be8f1908db71eb7e202c835b7c197d7991e2e7453e616"},{"path":"assets/race-data-icon-512.png","sha256":"cca4480a3d6a38e98488ca3323c70b5c985d8430d1c6535e5b41e2b0d1366d7b"},{"path":"releases/0.4.2-04ac704dc9a66840/app-info.mjs","sha256":"9f8b7386108c77f0ee09eb4b75192292241f4ba5ab2d005ae8a3bffc72d70a55"},{"path":"releases/0.4.2-04ac704dc9a66840/shell.html","sha256":"f797d0c3cf2b9011480d02d4e5f57e9e0a23d5193390f5b68cf3ea5c3f517624"}]};
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
      // Only the approving tab reloads. Other tabs keep their current modules
      // and cache, even if a browser has suspended their JavaScript.
      const requester = event.source;
      participants = [requester];
      const answer = await ask(requester, 'CAN_APPLY_UPDATE');
      if (answer?.safe !== true) {
        const reason = 'Finish/export this race and save swimmer changes before applying the update.';
        requester.postMessage({ type: 'UPDATE_CANCELLED', reason });
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
