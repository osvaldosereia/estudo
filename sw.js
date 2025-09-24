// sw.js — direito.love (cache leve com versionamento por querystring)

const CACHE_NAME = 'dlove-v6';
const CORE = [
  './',
  'index.html',
  'icons/logo.png',
  'icons/favicon-32.png',
  'icons/favicon-192.png',
  'icons/apple-touch-icon.png',
];

// instala: pré-cache só do shell mínimo
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE.map((u) => new Request(u, { cache: 'reload' })));
    } catch (e) {
      // ignore
    }
    self.skipWaiting();
  })());
});

// ativa: limpa caches antigos e habilita navigation preload
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter((k) => k !== CACHE_NAME)
        .map((k) => caches.delete(k)));
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
    } finally {
      await self.clients.claim();
    }
  })());
});

// util: responde com network-first
async function networkFirst(req) {
  try {
    const preload = await eventPreloadResponse(); // pode vir do nav preload
    if (preload) return preload;
  } catch (_) {}
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

// util: responde com cache-first (e revalida em background)
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) {
    // revalida sem bloquear a resposta
    fetch(req).then((res) => caches.open(CACHE_NAME).then((c) => c.put(req, res))).catch(() => {});
    return cached;
  }
  const res = await fetch(req);
  const cache = await caches.open(CACHE_NAME);
  cache.put(req, res.clone());
  return res;
}

// tenta pegar resposta de navigation preload (se existir)
async function eventPreloadResponse() {
  // acessível apenas dentro do fetch handler; tratamos via closure em handleFetch
  return null;
}

// fetch: roteamento simples por tipo de recurso
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // navegações (HTML): network-first com fallback ao cache
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
        cache.put('index.html', res.clone());
        return res;
      } catch {
        const cached = await caches.match('index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // assets versionados (?v=...): network-first (sempre atualiza quando você troca o v)
  if (isSameOrigin && url.searchParams.has('v')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // textos de leis (para offline): cache-first
  if (isSameOrigin && /\/data\/.+\.txt$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // imagens e ícones locais: cache-first
  if (isSameOrigin && /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // default: tenta rede e cai pro cache se offline
  event.respondWith(networkFirst(event.request));
});

// mensagem opcional pra forçar atualização do SW (se quiser usar no futuro)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
