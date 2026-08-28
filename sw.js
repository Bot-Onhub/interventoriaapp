const CACHE_NAME = 'aaas-campo-v3'; // Cambiamos la versión para forzar actualización

// SOLO archivos locales reales. Si falta uno, la caché colapsa.
const urlsToCache = [
    './',
    './index.html',
    './app.js',
    './manifest.json',
    './icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Archivos cacheados exitosamente');
                return cache.addAll(urlsToCache);
            })
            .catch(err => {
                console.error("Fallo crítico al cachear archivos:", err);
            })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Retorna la versión en caché o hace la petición a la red si hay internet
                return response || fetch(event.request);
            })
    );
});
