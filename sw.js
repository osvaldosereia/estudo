// sw.js - Service Worker revisado
const CACHE_NAME = "direito-love-v7"; // 🔄 altere a versão SEMPRE que fizer update
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
  // força ativação imediata
  self.skipWaiting();
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
            return caches.delete(key); // 🔥 limpa caches antigos
          }
        })
      );
    }).then(() => {
      return self.clients.claim(); // 🔄 força assumir imediatamente
    })
  );
});

// Fetch
self.addEventListener("fetch", (event) => {
  // Para HTML (navegação), tenta sempre da rede primeiro
  if (event.request.mode === "navigate" || event.request.headers.get("accept").includes("text/html")) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Para outros arquivos (CSS, JS, imagens), usa cache-first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
      );
    })
  );
});
