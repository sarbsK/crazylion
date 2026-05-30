const CACHE_NAME = 'anatomica-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './images/form_cylinders.png',
  './images/form_hands.png',
  './images/form_head.png',
  './images/form_mannequin.png',
  './images/form_planes.png',
  './images/form_ribcage.png',
  './images/gesture.png',
  './images/mu_arms.png',
  './images/mu_legs.png',
  './images/mu_torso.png',
  './images/muscles.png',
  './images/proportions.png',
  './images/sk_limb_joints.png',
  './images/sk_ribcage_pelvis.png',
  './images/sk_shoulder_girdle.png',
  './images/sk_spine.png',
  './images/skeleton.png'
];

// Install Event — Pre-cache all core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Pre-caching static assets...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event — Clean up old caches if any
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Clearing old cache...', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event — Cache-First Strategy with Network Fallback
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Serve from cache
          return cachedResponse;
        }

        // Otherwise try the network
        return fetch(event.request)
          .then((networkResponse) => {
            // Check for valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // Clone and dynamically cache any newly fetched item
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });

            return networkResponse;
          })
          .catch(() => {
            // If offline and request is for page, return cached index
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
      })
  );
});
