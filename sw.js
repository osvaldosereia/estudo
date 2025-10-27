const CACHE_NAME = 'vademecum-cache-v1';
// Lista de arquivos principais da aplicação para cachear na instalação.
// Não incluiremos os arquivos das leis aqui; eles serão cacheados sob demanda.
const urlsToCache = [
  './', // Cacheia o index.html (ou o arquivo raiz acessado)
  './vademecum.html', // Cacheia explicitamente o arquivo principal
  // Adicione aqui outros assets essenciais se houver (CSS, JS principal, ícones)
  'https://cdn.tailwindcss.com', // Cacheia o Tailwind (pode falhar devido a CORS em alguns cenários)
  'https://unpkg.com/ionicons@5.5.2/dist/ionicons/ionicons.esm.js',
  'https://unpkg.com/ionicons@5.5.2/dist/ionicons/ionicons.js',
  'https://cdnjs.cloudflare.com/ajax/libs/mark.js/8.11.1/mark.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' // Cacheia a fonte
];

// Evento de Instalação: Cacheia os arquivos principais da aplicação
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cache aberto, adicionando arquivos principais.');
        // Adiciona todos os URLs definidos. Se um falhar, a instalação falha.
        // Usamos addAll com { mode: 'no-cors' } para tentar cachear recursos de terceiros,
        // mas isso pode resultar em respostas "opacas" que não mostram o status real.
        // A melhor abordagem para recursos de terceiros seria verificar se já estão no cache do navegador.
        // Por simplicidade, tentamos cachear aqui.
        return cache.addAll(urlsToCache.map(url => new Request(url, { mode: 'no-cors' })))
            .catch(error => {
                console.warn('Service Worker: Falha ao cachear alguns recursos iniciais (pode ser CORS):', error);
                // Mesmo com falha em alguns, tentamos adicionar os outros que funcionam
                return Promise.all(
                    urlsToCache.map(url =>
                        cache.add(new Request(url, { mode: 'no-cors' })).catch(e => console.warn(`Falha ao cachear ${url}: ${e}`))
                    )
                );
            });
      })
      .then(() => {
        console.log('Service Worker: Instalação concluída.');
        return self.skipWaiting(); // Força o SW a ativar imediatamente
      })
  );
});

// Evento de Ativação: Limpa caches antigos
self.addEventListener('activate', event => {
  console.log('Service Worker: Ativando...');
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Deletando cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('Service Worker: Ativação completa, controlando clientes.');
        return self.clients.claim(); // Controla clientes abertos imediatamente
      })
  );
});

// Evento Fetch: Intercepta requisições e serve do cache ou da rede (Cache falling back to network)
self.addEventListener('fetch', event => {
  // Ignora requisições que não são GET (como POST) e extensões do Chrome
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Se encontrar no cache, retorna a resposta cacheada
        if (cachedResponse) {
          // console.log('Service Worker: Servindo do cache:', event.request.url);
          return cachedResponse;
        }

        // Se não encontrar no cache, busca na rede
        // console.log('Service Worker: Buscando na rede:', event.request.url);
        return fetch(event.request).then(
          networkResponse => {
            // Verifica se a resposta é válida
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              // Não cacheia respostas inválidas, de erro ou de terceiros (opacas sem no-cors)
              // console.log('Service Worker: Resposta inválida da rede, não cacheando:', event.request.url, networkResponse.status, networkResponse.type);
               if (networkResponse && networkResponse.type === 'opaque') {
                   // Respostas opacas (CORS) podem ser usadas, mas não cacheadas facilmente sem 'no-cors' no pedido inicial.
                   // Neste ponto, apenas retornamos a resposta opaca sem cachear.
                   return networkResponse;
               }
               // Retorna a resposta de erro ou inválida diretamente
              return networkResponse;
            }

             // Clona a resposta - uma para o cache, outra para o navegador
            const responseToCache = networkResponse.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                // console.log('Service Worker: Cacheando resposta da rede:', event.request.url);
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        ).catch(error => {
          // Em caso de falha na rede (offline)
          console.error('Service Worker: Erro ao buscar na rede:', error);
          // Poderia retornar uma página offline padrão aqui, se definida
          // return caches.match('/offline.html');
          // Por enquanto, apenas propaga o erro
          throw error;
        });
      })
  );
});
