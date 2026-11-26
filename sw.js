/* Offline use (roadmap 7-6). Everything is fetched network-first, so a new release shows up at once and a stale
   recording can never play (clip files are renumbered when lines are added). The cache is only the offline fallback. */
importScripts('clips.js'); // defines CLIPS: line key -> file in audio/
const CACHE = 'zhuyin-offline-v1';
const SHELL = ['./', 'index.html', 'style.css', 'data.js', 'art.js', 'clips.js', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];
const AUDIO = [...new Set(Object.values(CLIPS))].map(f => 'audio/' + f);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Audio is cached best effort: a missing clip must not block the install.
    await Promise.all(AUDIO.map(u => cache.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // fonts etc. go to the network
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(no, 4000))]);
      if (res && res.ok && !req.headers.has('range')) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('index.html') : Response.error());
    }
  })());
});
