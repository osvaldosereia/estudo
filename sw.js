// sw.js - Service Worker revisado
const CACHE_NAME = "direito-love-v28"; // 🔄 altere a versão SEMPRE que fizer update
const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/favicon-32.png",
  "./icons/favicon-192.png",
  "./icons/apple-touch-icon.png"
];

// Instalação
self.addEventListener("install", (event) => {
  self.skipWaiting(); // força ativação imediata
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
});

// Ativação
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key); // 🔥 remove caches antigos
          }
        })
      );
    }).then(() => self.clients.claim()) // 🔄 assume imediatamente
  );
});

// Fetch
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Para HTML (navegação), tenta rede primeiro
  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Para estáticos (CSS, JS, imagens): cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        return res;
      });
    })
  );
});
