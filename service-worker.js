self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open('direito-cache').then(function(cache) {
      return cache.addAll([
        './',
        './index_flexivel_direito.html',
        './manifest.json'
      ]);
    })
  );
});

self.addEventListener('fetch', function(e) {
  e.respondWith(
    caches.match(e.request).then(function(response) {
      return response || fetch(e.request);
    })
  );
});