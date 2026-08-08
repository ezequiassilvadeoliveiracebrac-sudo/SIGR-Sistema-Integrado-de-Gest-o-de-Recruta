const APP_CACHE = 'sigr-pwa-v1';
const STATIC_CACHE = 'sigr-static-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/sigr-180.png',
  './icons/sigr-192.png',
  './icons/sigr-512.png',
  './icons/sigr-maskable-512.png'
];

const STATIC_HOSTS = new Set([
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => (key.startsWith('sigr-pwa-') || key.startsWith('sigr-static-')) && key !== APP_CACHE && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Dados e autenticação sempre vão direto ao Supabase.
  if (url.hostname.endsWith('.supabase.co')) return;

  // A página principal usa rede primeiro para receber atualizações do GitHub.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(APP_CACHE).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Arquivos locais do PWA podem ser servidos do cache.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(APP_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
    );
    return;
  }

  // Dependências visuais já carregadas ficam disponíveis no cache do aplicativo.
  if (STATIC_HOSTS.has(url.hostname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response && (response.ok || response.type === 'opaque')) {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
    );
  }
});
