// Service Worker for Tantawy Group - Official PWA & Offline Image Caching
const CACHE_NAME = 'tantawy-group-pwa-v5';
const ASSET_CACHE_NAME = 'tantawy-group-assets-v5';
const IMAGE_CACHE_NAME = 'tantawy-group-images-v4';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon.png',
  '/tantawy-brand-logo.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Precache partial warning (continuing):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== IMAGE_CACHE_NAME && key !== ASSET_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  
  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 1. Navigation requests (App Shell - Network first with Cache fallback for Chrome installability check)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) return cachedResponse;
          const fallback = await caches.match('/index.html');
          return fallback || new Response('Offline', { status: 200, headers: { 'Content-Type': 'text/html' } });
        })
    );
    return;
  }

  // 2. App Shell Code (JS / CSS / Fonts).
  // The app is code-split, so every screen is a separate hashed chunk. Without
  // this cache a rep who opens a screen for the first time while offline gets a
  // permanent loading skeleton. Cache-first with a background refresh keeps the
  // previously opened screens working offline and still picks up new builds.
  if (
    url.origin === self.location.origin &&
    (request.destination === 'script' ||
      request.destination === 'style' ||
      request.destination === 'font' ||
      url.pathname.startsWith('/assets/'))
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const networkPromise = fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                const clone = networkResponse.clone();
                cache.put(request, clone).catch(() => {});
              }
              return networkResponse;
            })
            .catch(() => null);

          if (cachedResponse) {
            // Refresh in the background, but never block on the network.
            networkPromise.catch(() => {});
            return cachedResponse;
          }
          return networkPromise.then((response) => {
            return response || new Response('', { status: 504, statusText: 'Offline' });
          });
        });
      })
    );
    return;
  }

  // 3. App Icons and Brand Assets
  if (
    url.pathname.includes('icon') ||
    url.pathname.includes('tantawy') ||
    url.pathname.includes('logo') ||
    url.pathname.includes('favicon') ||
    url.pathname.includes('manifest.json')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 4. Product Images (Cloudinary, Google Drive CDN, Unsplash, etc.) - Cache First with Data Saver
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
            return cachedResponse;
          }
          return fetch(request).then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
              try {
                cache.put(request, networkResponse.clone());
              } catch (e) {
                // Ignore quota errors
              }
            }
            return networkResponse;
          }).catch(() => {
            return cachedResponse || new Response('', { status: 408 });
          });
        });
      })
    );
    return;
  }
});
