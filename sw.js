// ============================================
// SERVICE WORKER - PWA INVENTARIO
// Estrategia: Stale While Revalidate para assets
// ============================================

const CACHE_NAME = 'pwa-inventario-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json'
];

// ============================================
// INSTALACIÓN - Cachea los archivos base
// ============================================
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Cache abierto:', CACHE_NAME);
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
            .catch((err) => {
                console.warn('[SW] Error al cachear assets:', err);
            })
    );
});

// ============================================
// ACTIVACIÓN - Limpia caches antiguas
// ============================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activando Service Worker...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('[SW] Eliminando cache antigua:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

// ============================================
// INTERCEPCIÓN DE PETICIONES
// Estrategia: Network First con fallback a Cache
// ============================================
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Ignorar peticiones que no sean GET
    if (request.method !== 'GET') return;

    // Ignorar peticiones al Apps Script (siempre ir a la red)
    if (request.url.includes('script.google.com')) return;

    // Ignorar peticiones externas
    if (!request.url.startsWith(self.location.origin)) return;

    event.respondWith(
        fetch(request)
            .then((networkResponse) => {
                // Si la respuesta es válida, actualizar cache
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(request, responseToCache);
                        });
                }
                return networkResponse;
            })
            .catch(() => {
                // Si falla la red, intentar servir desde cache
                return caches.match(request)
                    .then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        // Si es una navegación, devolver index.html
                        if (request.mode === 'navigate') {
                            return caches.match('./index.html');
                        }
                        return new Response('Sin conexión', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});
