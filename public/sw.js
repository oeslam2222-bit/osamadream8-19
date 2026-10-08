// Service Worker for Tantawy Group - Official PWA & Offline Image Caching
const CACHE_NAME = 'tantawy-group-pwa-v7';
const ASSET_CACHE_NAME = 'tantawy-group-assets-v7';
const IMAGE_CACHE_NAME = 'tantawy-group-images-v5';

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
          const fallback = (await caches.match('/index.html')) || (await caches.match('/'));
          return fallback || new Response('Offline', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        })
    );
    return;
  }

  // 2. Supabase API calls: Preserve network failures so callers can keep local data
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(request));
    return;
  }

  // 3. App Shell Code (JS / CSS / Fonts / Vite Chunks).
  // Cache-first with background refresh keeps all previously opened screens working offline
  if (
    (url.origin === self.location.origin &&
      (request.destination === 'script' ||
        request.destination === 'style' ||
        request.destination === 'font' ||
        url.pathname.startsWith('/assets/') ||
        url.pathname.startsWith('/src/') ||
        url.pathname.startsWith('/@') ||
        url.pathname.includes('node_modules') ||
        url.pathname.match(/\.(js|jsx|ts|tsx|css)$/))) ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.open(ASSET_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const networkPromise = fetch(request)
            .then((networkResponse) => {
              if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                const clone = networkResponse.clone();
                cache.put(request, clone).catch(() => {});
              }
              return networkResponse;
            })
            .catch(() => null);

          if (cachedResponse) {
            // Return cached version immediately, revalidate in background if online
            networkPromise.catch(() => {});
            return cachedResponse;
          }

          return networkPromise.then((response) => {
            return response || cachedResponse || new Response('Application asset unavailable', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
          });
        });
      })
    );
    return;
  }

  // 4. App Icons and Brand Assets
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

  // 5. Product Images (Cloudinary, Google Drive CDN, Unsplash, etc.) - Cache First with Data Saver
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
