const CACHE_NAME = 'interventoria-cache-v6'; // Sube este número cada vez que hagas un cambio en app.js o index.html

const urlsToCache = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/style.css' // Agrega aquí tus archivos
];

// Evento de instalación
self.addEventListener('install', event => {
  // ESTA LÍNEA ES CRÍTICA: Obliga al nuevo Service Worker a instalarse de inmediato
  self.skipWaiting(); 
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento de activación
self.addEventListener('activate', event => {
  // ESTA LÍNEA ES CRÍTICA: Hace que el nuevo Service Worker tome el control al instante
  event.waitUntil(clients.claim()); 

  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName); // Borra las versiones viejas
          }
        })
      );
    })
  );
});

// Evento Fetch para trabajar sin conexión
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});
