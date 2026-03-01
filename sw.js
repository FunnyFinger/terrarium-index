/**
 * Service Worker: caches static assets and plant bundle for faster repeat loads.
 * Stale-while-revalidate for same-origin GET (js, css, html, json, images).
 */
const CACHE_NAME = 'vivarium-v3';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const u = new URL(event.request.url);
  if (u.origin !== self.location.origin) return;
  if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
    event.respondWith(fetch(event.request));
    return;
  }
  if (u.pathname.includes('/api/') || u.pathname.includes('create-checkout')) return;
  const ext = u.pathname.split('.').pop().toLowerCase();
  const isCacheable = /^(json|js|css|html|jpg|jpeg|png|gif|webp|svg|ico|woff2?)$/.test(ext) || u.pathname.endsWith('/') || u.search.includes('v=');
  if (!isCacheable) return;
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((res) => {
          if (res.ok && res.type === 'basic') cache.put(event.request, res.clone());
          return res;
        });
        return cached || fetchPromise;
      })
    )
  );
});
