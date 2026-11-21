/* KnowList — service worker : coquille hors ligne, cache des données consultées, médias. */
const VERSION = 'kl-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const API = `${VERSION}-api`;
const MEDIA = `${VERSION}-media`;
const PRECACHE = ['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/theme.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'logout') {
    event.waitUntil(Promise.all([caches.delete(API), caches.delete(MEDIA), caches.delete(SHELL)]));
  }
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // On ne met en cache que la coquille de l'application (pas les redirections vers la connexion).
          if (res.ok && !res.redirected && (res.headers.get('content-type') || '').includes('text/html')) {
            const cache = await caches.open(SHELL);
            cache.put('/__shell', res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match('/__shell');
          return cached || new Response('<h1>Hors ligne</h1><p>Reconnecte-toi au réseau pour ouvrir KnowList.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
      })(),
    );
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(req, ASSETS));
    return;
  }
  if (url.pathname.startsWith('/api/v1/media/')) {
    event.respondWith(cacheFirst(req, MEDIA));
    return;
  }
  if (url.pathname.startsWith('/api/v1/') && !url.pathname.startsWith('/api/v1/admin') && !url.pathname.includes('/export')) {
    event.respondWith(networkFirst(req, API));
    return;
  }
  if (PRECACHE.includes(url.pathname)) event.respondWith(cacheFirst(req, SHELL));
});
