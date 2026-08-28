// Service Worker for Tantawy Group - Mobile Data Saver & Offline Image Caching
const CACHE_NAME = 'tantawy-group-cache-v3';
const IMAGE_CACHE_NAME = 'tantawy-group-images-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

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

  // For app branding icons, always prefer network first or bypass stale caches
  if (url.pathname.includes('icon') || url.pathname.includes('tantawy') || url.pathname.includes('logo') || url.pathname.includes('favicon')) {
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(IMAGE_CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // Cache-First strategy for product images (Cloudinary, Google Drive CDN, Unsplash)
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
          if (cachedResponse) {
            // Serve immediately from device cache without consuming mobile internet
            return cachedResponse;
          }
          // If not in cache, fetch from network and store in cache for future offline / data-saver use
          return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => {
            // Return cached response if available even if network failed
            return cachedResponse || new Response('', { status: 408 });
          });
        });
      })
    );
    return;
  }
});
