const CACHE = 'dlove-v3-2025-09-11';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept')||'').includes('text/html');
  const isCore = /\/(index\.html|script\.js|style\.css)$/.test(url.pathname);

  if (isHTML || isCore) {
    e.respondWith(
      fetch(req).then(res => {
        caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      caches.open(CACHE).then(c => c.put(req, res.clone()));
      return res;
    }))
  );
});
