const CACHE = 'market-lens-v1';
const STATIC = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Alpha Vantage requests: network first, no cache (fresh data)
  if (e.request.url.includes('alphavantage.co')) {
    e.respondWith(fetch(e.request).catch(() => new Response('{"Error":"offline"}', {headers:{'Content-Type':'application/json'}})));
    return;
  }
  // App shell: cache first
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => {
    if (res.status === 200) { const c = res.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); }
    return res;
  })));
});
