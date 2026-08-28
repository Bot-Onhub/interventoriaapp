const CACHE_NAME = 'interventoria-v7';
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

// Instalación del Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Abriendo caché...');
        return cache.addAll(urlsToCache).catch(err => {
          console.warn("Algunos archivos no se pudieron cachear, continuando...", err);
        });
      })
  );
  self.skipWaiting();
});

// Activación y limpieza de cachés antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Borrando caché antiguo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptar peticiones de red
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      }).catch(() => {
        // Si falla la red y no está en caché, evitamos que la app colapse
      })
  );
});
