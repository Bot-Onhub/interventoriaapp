const CACHE_NAME = 'interventoria-v8'; // Obligatorio subir la versión para forzar actualización
const urlsToCache = [
  './',
  './index.html',
  './app.js',
  './manifest.json'
];

// 1. Instalación del Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Abriendo caché v8...');
        return cache.addAll(urlsToCache).catch(err => {
          console.warn("Algunos archivos no se pudieron cachear, continuando...", err);
        });
      })
  );
  self.skipWaiting(); // Obliga al SW a instalarse inmediatamente
});

// 2. Activación y purga de cachés zombis
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Borrando caché obsoleto:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Toma el control de los clientes de inmediato
});

// 3. Interceptor de peticiones de red (Lógica de ruteo)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // EXCEPCIÓN A: El portal de clientes NUNCA usa caché (Network Only)
  if (url.pathname.includes('cliente.html')) {
    event.respondWith(
      fetch(event.request).catch((err) => {
        console.error("Sin conexión para el portal de clientes:", err);
        throw err;
      })
    );
    return; // Detiene la ejecución aquí
  }

  // EXCEPCIÓN B: Las consultas a la Base de Datos NUNCA usan caché (Network Only)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return; // Detiene la ejecución aquí
  }

  // REGLA GENERAL: App de campo para técnicos (Cache First, Fallback to Network)
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Devuelve el archivo del disco duro si existe, sino, va a internet
        return response || fetch(event.request);
      }).catch(() => {
        // Fallback silencioso si no hay red ni caché
        console.warn("Modo offline sin recursos en caché para:", event.request.url);
      })
  );
});
