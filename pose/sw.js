const CACHE_NAME = 'sw-cache-v10';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './libs/three.min.js',
  './libs/OrbitControls.js',
  './libs/TransformControls.js',
  './libs/GLTFLoader.js',
  './libs/OBJLoader.js',
  './libs/STLLoader.js',
  './libs/OBJExporter.js',
  './libs/GLTFExporter.js'
];

// Install Service Worker and cache all essential static files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching static assets for offline use...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event: clean up older caches if version changes
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event: Intercept requests to serve from cache or network
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // Bypass service worker caching for dynamic API searches (Openverse/Wikimedia)
  if (requestUrl.host.includes('openverse.org') || requestUrl.host.includes('wikimedia.org')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Fallback for API search when offline
        return new Response(JSON.stringify({ results: [], error: "Offline" }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Cache-first strategy for local assets, stale-while-revalidate for Google Fonts
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // If it's a local file, serve it immediately
        // For fonts or CDNs, let's also fetch a fresh copy in the background
        if (event.request.url.includes('fonts.gstatic.com') || event.request.url.includes('fonts.googleapis.com')) {
          fetch(event.request).then((networkResponse) => {
            if (networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, networkResponse);
              });
            }
          }).catch(() => {/* Ignore network errors if offline */});
        }
        return cachedResponse;
      }

      // Not in cache, fetch from network
      return fetch(event.request).then((networkResponse) => {
        // Check if we should cache this new response (only standard successful GET requests)
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        // Cache the newly fetched asset in the background
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch((err) => {
        // Offline fallback for other files
        console.log('[Service Worker] Offline and asset not in cache:', event.request.url);
        
        // If requesting index.html, return the cached one
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        
        return Promise.reject(err);
      });
    })
  );
});
