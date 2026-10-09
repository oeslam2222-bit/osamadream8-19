import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const CHUNK_RECOVERY_KEY = 'tantawy:chunk-recovery';

window.addEventListener('vite:preloadError', (event) => {
  let shouldReload = true;
  try {
    const lastRecovery = Number(sessionStorage.getItem(CHUNK_RECOVERY_KEY));
    if (Number.isFinite(lastRecovery) && Date.now() - lastRecovery < 60_000) {
      shouldReload = false;
    } else {
      sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(Date.now()));
      window.setTimeout(() => sessionStorage.removeItem(CHUNK_RECOVERY_KEY), 60_000);
    }
  } catch {
    shouldReload = false;
  }

  if (!shouldReload) return;
  event.preventDefault();
  window.location.reload();
});

/**
 * The service worker caches every script under /assets, and in dev Vite serves
 * modules from /src. Registering it locally meant an edit kept serving the
 * cached module, so the change only appeared after a manual hard refresh.
 * Production only: there the worker is what makes the installed app work offline.
 */
// Service worker registration for full offline PWA capabilities
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      .then((registration) => {
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });

        registration.update().catch(() => {});
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        });
      })
      .catch((error) => {
        console.warn('Service Worker registration notice:', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
