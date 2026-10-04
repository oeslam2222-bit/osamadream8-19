import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

/**
 * The service worker caches every script under /assets, and in dev Vite serves
 * modules from /src. Registering it locally meant an edit kept serving the
 * cached module, so the change only appeared after a manual hard refresh.
 * Production only: there the worker is what makes the installed app work offline.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
      .then((registration) => {
        // A new build activates while this tab still runs the old bundle.
        // Reload once it takes control, so the update lands without the user
        // having to close the app and sign in again. Every action is already
        // written to local storage / IndexedDB before it reaches this point.
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });

        // Check for a newer build in the background, and on every return to the
        // tab, so a deploy is picked up without a manual reload.
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
