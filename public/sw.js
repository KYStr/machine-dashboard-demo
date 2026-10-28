/* Offline app shell only. Never cache the API or an SSE connection. */
const CACHE_NAME = 'machine-demo-__BUILD_HASH__';
const ASSETS = __PRECACHE_ASSETS__;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('machine-demo-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) { const clone = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, clone)); }
      return response;
    }).catch(async () => (await caches.match(request)) || (await caches.match('./index.html')) || Response.error()));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok && ASSETS.some(path => new URL(path, self.registration.scope).href === request.url)) {
      const clone = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
    }
    return response;
  })));
});
