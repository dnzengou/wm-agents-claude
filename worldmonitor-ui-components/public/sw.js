// WorldMonitor Agents — Service Worker
// Strategy: Network-first for API/pages, Cache-first for static assets.

const CACHE = 'wm-v1';
const STATIC = [
  '/',
  '/manifest.json',
];

// ── Install: pre-cache shell ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()),
  );
});

// ── Activate: clear old caches ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

// ── Fetch: network-first for API + pages, cache-first for assets ──────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Always go network for API calls and cross-origin requests
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    return; // browser handles it
  }

  // Static assets: cache-first
  if (/\.(js|css|woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
        return res;
      })),
    );
    return;
  }

  // HTML pages: network-first, fall back to cache
  event.respondWith(
    fetch(request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(request, clone));
        return res;
      })
      .catch(() => caches.match(request)),
  );
});
