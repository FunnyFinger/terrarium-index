/**
 * Service Worker — tiered caching strategy:
 *
 * NETWORK-FIRST  → HTML pages, JSON data files
 *   Always try the network first so deployments are picked up immediately.
 *   Falls back to cache only when offline.
 *
 * CACHE-FIRST    → Images (jpg, jpeg, png, gif, webp, svg, ico)
 *   Images change rarely; serve from cache instantly and revalidate in background.
 *
 * NETWORK-ONLY   → API calls, localhost
 *
 * To force all clients to pick up a new SW after a deploy, bump CACHE_VERSION.
 */

// ── Bump this on every deploy that changes JS/CSS/HTML ──
const CACHE_VERSION = 5;
const CACHE_NAME = `vivarium-v${CACHE_VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const u = new URL(event.request.url);

  // Never intercept on localhost (dev) or external origins
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return;
  if (u.origin !== self.location.origin) return;

  // Never intercept API / payment calls
  if (u.pathname.includes('/api/') || u.pathname.includes('create-checkout')) return;

  const ext = u.pathname.split('.').pop().toLowerCase();
  const isImage = /^(jpg|jpeg|png|gif|webp|svg|ico)$/.test(ext);
  const isDoc   = /^(html|json|js|css|woff2?)$/.test(ext)
                  || u.pathname.endsWith('/')
                  || u.search.includes('v=');

  if (!isImage && !isDoc) return;

  if (isImage) {
    // CACHE-FIRST for images: fast and images change rarely
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request).then((res) => {
            if (res.ok && res.type === 'basic') cache.put(event.request, res.clone());
            return res;
          }).catch(() => cached); // offline fallback
          return cached || networkFetch;
        })
      )
    );
  } else {
    // NETWORK-FIRST for HTML/JS/CSS/JSON: always get latest on deploy
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            // Clone immediately so the browser's stream can be consumed separately
            const resClone = res.clone();
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, resClone))
              .catch(() => {
                // Ignore cache put errors (e.g. body already used); network response still succeeds
              });
          }
          return res;
        })
        .catch(() =>
          // Offline: serve cached version if available
          caches.open(CACHE_NAME).then((cache) => cache.match(event.request))
        )
    );
  }
});
