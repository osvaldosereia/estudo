// sw.js — direito.love (cache leve com versionamento por querystring)

const CACHE_NAME = 'dlove-v15';
const CORE = [
  './',
  'index.html',
  'style.css?v=9',
  'app.js?v=9',
  'manifest.webmanifest',
  'icons/logo.png',
  'icons/favicon-32.png',
  'icons/favicon-192.png',
  'icons/apple-touch-icon.png',
];

// instala: pré-cache do shell mínimo
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));
    } catch (_) {}
    self.skipWaiting();
  })());
});

// ativa: limpa caches antigos e habilita navigation preload
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
    } finally {
      await self.clients.claim();
    }
  })());
});

// util: responde com network-first (salva no cache ao sucesso)
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    const cache = await caches.open(CACHE_NAME);
    cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(req);
    if (hit) return hit;
    throw err;
  }
}

// util: responde com cache-first e revalida em background
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) {
    fetch(req)
      .then((res) =>
        caches.open(CACHE_NAME).then((c) => c.put(req, res))
      )
      .catch(() => {});
    return cached;
  }
  const res = await fetch(req);
  const cache = await caches.open(CACHE_NAME);
  cache.put(req, res.clone());
  return res;
}

// fetch: roteamento por tipo de recurso
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // Navegações (HTML): network-first com fallback ao cache
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        // usa navigation preload se disponível
        const preload = await event.preloadResponse;
        if (preload) return preload;
      } catch (_) {}
      try {
        const res = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(new Request('index.html', { cache: 'reload' }), res.clone());
        return res;
      } catch {
        const cached = await caches.match('index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // Assets versionados (?v=...): network-first
  if (isSameOrigin && url.searchParams.has('v')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Dados (txt/json) em /data: cache-first
  if (isSameOrigin && /\/data\/.+\.(txt|json)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Imagens locais: cache-first
  if (isSameOrigin && /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Default: apenas mesmo domínio entra no cache; terceiros passam direto
  if (isSameOrigin) {
    event.respondWith(networkFirst(event.request));
  }
});

// Mensagem opcional pra forçar atualização do SW
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
