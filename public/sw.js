// Service Worker for Dream Tantawy - Mobile Data Saver & Offline Image Caching
const CACHE_NAME = 'dream-tantawy-app-v2';
const IMAGE_CACHE_NAME = 'dream-tantawy-images-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
];

// Precache app shell on install for instant loading
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // App shell precache is best-effort; the app will still work without it
        return Promise.resolve();
      });
    }).then(() => self.skipWaiting())
  );
});

// Clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== IMAGE_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Stale-while-revalidate for images (instant display + background refresh)
  if (
    request.destination === 'image' ||
    url.hostname.includes('cloudinary.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.hostname.includes('drive.google.com') ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|gif)$/i)
  ) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const networkFetch = fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            return cachedResponse || new Response('', { status: 408 });
          });

          // Return cached immediately, then update in background
          return cachedResponse || networkFetch;
        });
      })
    );
    return;
  }

  // Network-first for everything else (HTML, JS, CSS, API)
  if (request.mode === 'navigate' || url.origin === self.location.origin) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      }).catch(() => {
        return caches.match(request).then((cached) => {
          return cached || caches.match('/index.html');
        });
      })
    );
    return;
  }
});
