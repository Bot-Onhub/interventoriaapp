// sw_v2.js - Service Worker para Soporte Offline (PWA) V2
const CACHE_NAME = 'interventoria-v3-cache-v1';
const ASSETS_TO_CACHE = [
    './index_v2.html',
    './app_v2.js', // O './app_v2.js' según cómo lo nombres, pero asegúrate de que coincida con tus archivos
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/html5-qrcode'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Las peticiones a Supabase (API, Auth, Storage) nunca se cachean
    if (event.request.url.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((response) => {
                return response;
            }).catch(() => {
                // Fallback en caso de requerirse
            });
        })
    );
});
