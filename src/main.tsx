import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import TemplateApp from './templates/TemplateApp';
// الخطوط مضمّنة محليًا (self-hosted) — مفيش طلبات لـ Google Fonts وقت التشغيل.
import '@fontsource/cairo/arabic-400.css';
import '@fontsource/cairo/latin-400.css';
import '@fontsource/cairo/arabic-500.css';
import '@fontsource/cairo/latin-500.css';
import '@fontsource/cairo/arabic-600.css';
import '@fontsource/cairo/latin-600.css';
import '@fontsource/cairo/arabic-700.css';
import '@fontsource/cairo/latin-700.css';
import '@fontsource/cairo/arabic-800.css';
import '@fontsource/cairo/latin-800.css';
import '@fontsource/cairo/arabic-900.css';
import '@fontsource/cairo/latin-900.css';
import cairoArabic400 from '@fontsource/cairo/files/cairo-arabic-400-normal.woff2?url';
import cairoArabic700 from '@fontsource/cairo/files/cairo-arabic-700-normal.woff2?url';
import cairoArabic900 from '@fontsource/cairo/files/cairo-arabic-900-normal.woff2?url';
import cairoLatin400 from '@fontsource/cairo/files/cairo-latin-400-normal.woff2?url';
import cairoLatin700 from '@fontsource/cairo/files/cairo-latin-700-normal.woff2?url';
import './index.css';
import './styles/tailwind-utilities.css';
import './styles/missing-utilities.css';
import './styles/theme-tokens.css';
import './components/mobile-styles.css';
import './styles/beautiful-cards.css';
import './styles/app-shell.css';
import './styles/identity.css';
// هوية البراند v2 (مطابقة المرجع المعتمد) — آخر ملف فيثبّت القيم فوق الكل
import './styles/brand-v2.css';
// معاينة أمر البيع / الفاتورة الإلكترونية — هيدر وفوتر وورق مضبوط
import './styles/electronic-invoice.css';
// تنسيق صفحة مبيعات الأصناف في الوضعين (النهار/الليل)
import './styles/item-sales-page.css';
// توحيد شكل الكروت والنصوص في الوضع الليلي على مستوى التطبيق
import './styles/theme-consistency.css';
// تلوين كارت العميل الدلالي — لازم بعد theme-consistency عشان ألوان البنود تثبت
import './styles/customer-card.css';
// عائلة الخط الموحدة — لازم يكون آخر ملف عشان يثبّت var(--app-font) فوق الكل
import './styles/fonts.css';

import { initMonitoring } from './services/monitoring';

// Sentry بيتهيّأ فقط لو VITE_SENTRY_DSN مضبوط (بيتحمّل ديناميكيًا).
initMonitoring();

// Template preview (?template in the URL — captured before AppContext strips
// the query string as a security measure).
const TEMPLATE_PREVIEW = new URLSearchParams(window.location.search).has('template');

// Apply the saved theme before first paint to avoid a light flash.
// Template previews manage their own class-based dark mode.
if (!TEMPLATE_PREVIEW) {
  try {
    document.documentElement.classList.toggle(
      'dark',
      localStorage.getItem('tantawy_dark_mode') === 'true',
    );
  } catch {}
}

// كثافة العرض: مصغّر افتراضياً — بيتحكم فيه من زر (مصغّر/مريح) في التوب بار
try {
  if (localStorage.getItem('tantawy_density') !== 'comfortable') {
    document.documentElement.classList.add('tg-compact');
  } else {
    document.documentElement.classList.remove('tg-compact');
  }
} catch {
  document.documentElement.classList.add('tg-compact');
}

const preloadFont = (href: string) => {
  if (typeof document === 'undefined') return;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'font';
  link.type = 'font/woff2';
  link.crossOrigin = 'anonymous';
  link.href = href;
  document.head.appendChild(link);
};

preloadFont(cairoArabic400);
preloadFont(cairoArabic700);
preloadFont(cairoArabic900);
preloadFont(cairoLatin400);
preloadFont(cairoLatin700);

const CHUNK_RECOVERY_KEY = 'tantawy:chunk-recovery';

/**
 * بيحصل لما نسخة جديدة تتنشر: ملف chunk قديم اتشال من السيرفر، أو الـservice
 * worker لسه ماسك index.html قديم بيشاور على الملفات القديمة. الرد على الطلب
 * الغلط بيرجع index.html بنوع text/html فالـmodule بيفشل.
 *
 * الإصلاح: نتأكد إنه مايتكررش أكتر من مرة كل دقيقة، ونلغي تسجيل الـservice
 * worker ونمسح كاش الأصول قبل الريلود — من غير كده الريلود بيرجع لنفس
 * النسخة القديمة والخطأ يفضل زي ما هو.
 */
const recoverFromStaleBuild = (): boolean => {
  try {
    const lastRecovery = Number(sessionStorage.getItem(CHUNK_RECOVERY_KEY));
    if (Number.isFinite(lastRecovery) && Date.now() - lastRecovery < 60_000) {
      return false;
    }
    sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(Date.now()));
    window.setTimeout(() => sessionStorage.removeItem(CHUNK_RECOVERY_KEY), 60_000);
  } catch {
    return false;
  }

  const reload = () => window.location.reload();
  try {
    const clearServiceWorker =
      'serviceWorker' in navigator
        ? navigator.serviceWorker
            .getRegistrations()
            .then((registrations) =>
              Promise.all(registrations.map((registration) => registration.unregister())),
            )
            .catch(() => {})
        : Promise.resolve();
    const clearCaches =
      typeof caches !== 'undefined'
        ? caches
            .keys()
            .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
            .catch(() => {})
        : Promise.resolve();
    Promise.all([clearServiceWorker, clearCaches]).finally(reload);
  } catch {
    reload();
  }
  return true;
};

window.addEventListener('vite:preloadError', (event) => {
  if (!recoverFromStaleBuild()) return;
  event.preventDefault();
});

// بعض الـimport() الديناميكية بترجع خطأ مباشر من غير حدث vite:preloadError،
// فبنغطيها من هنا — بس لو الرسالة فعلاً بتاعة نسخة قديمة/ملف مش موجود،
// عشان ما نعملش reload مع أي خطأ شبكة عادي.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { message?: unknown } | undefined;
  const message = typeof reason?.message === 'string' ? reason.message : '';
  if (!/Failed to fetch dynamically imported module|MIME type|Importing a module script failed/i.test(message)) {
    return;
  }
  if (!recoverFromStaleBuild()) return;
  event.preventDefault();
});

/**
 * The service worker caches every script under /assets, and in dev Vite serves
 * modules from /src. Registering it locally meant an edit kept serving the
 * cached module, so the change only appeared after a manual hard refresh.
 * Production only: there the worker is what makes the installed app work offline.
 */
// Service worker registration for full offline PWA capabilities
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // In dev mode, unregister any service worker so Vite's on-the-fly transforms are instant
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((r) => r.unregister());
    }).catch(() => {});
  } else {
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

          // تقليل الـ egress: sw.js مضبوط no-cache، فكل استدعاء update() بينزّل
          // الملف من السيرفر. بنخنقه لمرّة كل 15 دقيقة كحد أقصى بدل كل رجوع للتاب.
          const SW_UPDATE_COOLDOWN_MS = 15 * 60 * 1000;
          let lastSwUpdateCheck = 0;
          const maybeUpdateSw = () => {
            const now = Date.now();
            if (now - lastSwUpdateCheck < SW_UPDATE_COOLDOWN_MS) return;
            lastSwUpdateCheck = now;
            registration.update().catch(() => {});
          };
          maybeUpdateSw();
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
              maybeUpdateSw();
            }
          });
        })
        .catch((error) => {
          console.warn('Service Worker registration notice:', error);
        });
    });
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {TEMPLATE_PREVIEW ? (
      <TemplateApp />
    ) : (
      <App />
    )}
  </StrictMode>,
);
