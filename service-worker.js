const APP_CACHE = 'sigr-pwa-v11-paginacao-exclusao';
const STATIC_CACHE = 'sigr-static-v11-paginacao-exclusao';

const CORE_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/f39-gripen-fab.webp',
  './assets/danger-zone-30s.mp3'
];

const OPTIONAL_ASSETS = [
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

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then(async cache => {
        await cache.addAll(CORE_SHELL);
        await Promise.allSettled(OPTIONAL_ASSETS.map(asset => cache.add(asset)));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => (key.startsWith('sigr-pwa-') || key.startsWith('sigr-static-')) && key !== APP_CACHE && key !== STATIC_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Dados, autenticação, Realtime e Edge Functions nunca entram no cache.
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  // Navegação usa rede primeiro para receber imediatamente a versão publicada no GitHub.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response?.ok) {
            const copy = response.clone();
            caches.open(APP_CACHE).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response?.ok) caches.open(APP_CACHE).then(cache => cache.put(request, response.clone()));
        return response;
      }))
    );
    return;
  }

  if (STATIC_HOSTS.has(url.hostname)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request).then(response => {
        if (response && (response.ok || response.type === 'opaque')) caches.open(STATIC_CACHE).then(cache => cache.put(request, response.clone()));
        return response;
      }))
    );
  }
});

// Web Push: mensagens, chamadas e alertas mesmo com o SIGR fechado.
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch (_) { payload = { body: event.data ? event.data.text() : '' }; }

  const kind = payload.kind || payload.data?.kind || 'notification';
  const title = payload.title || (kind === 'call' ? 'SIGR | Chamada recebida' : kind === 'chat' ? 'SIGR | Nova mensagem' : 'SIGR | Notificação');
  const options = {
    body: payload.body || '',
    icon: './icons/sigr-192.png',
    badge: './icons/sigr-192.png',
    tag: payload.tag || `${kind}-${payload.data?.id || Date.now()}`,
    renotify: payload.renotify !== false,
    requireInteraction: kind === 'call',
    silent: false,
    vibrate: kind === 'call' ? [250,120,250,120,500] : [120,60,120],
    data: {
      url: payload.url || payload.data?.url || (kind === 'chat' || kind === 'call' ? './?view=comunicacao' : './'),
      kind,
      ...(payload.data || {})
    }
  };
  if (kind === 'call') options.actions = [
    { action: 'open-call', title: 'Atender' },
    { action: 'dismiss', title: 'Agora não' }
  ];
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      kind === 'chat' && 'setAppBadge' in self.navigator ? self.navigator.setAppBadge() : Promise.resolve()
    ])
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const rawTarget = event.notification.data?.url || './';
  const target = new URL(rawTarget, self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const openClient = clients.find(client => client.url.startsWith(self.location.origin));
      if (openClient) {
        openClient.navigate(target);
        return openClient.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
