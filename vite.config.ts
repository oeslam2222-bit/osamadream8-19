import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // صور aistudio القديمة (16MB+) مش مستخدمة في التطبيق، وكانت بتتحمّل
          // كلها في الخلفية أول ما الـservice worker يتثبّت وبتزاحم باقي الملفات
          // على نفس الشبكة. بنستثنيها من الـprecache من غير ما نمسح ملفات المستخدم.
          // مكتبات Excel/PDF/الصور البعيدة بقت chunks عند الطلب (2 ميجا+).
          // تضمينها في الـprecache كان بيتحمّلها في الخلفية أول تثبيت على
          // الموبايل من غير ما حد يفتح الشاشة اللي بتستخدمها.
          globIgnores: [
            'assets/aistudio/**',
            '**/*.apk',
            'assets/xlsx.min-*.js',
            'assets/pdfService-*.js',
            'assets/encodingService-*.js',
            'assets/html2canvas.esm-*.js',
          ],
          maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
          // الكاش الـruntime ده كان في sw.js اليدوي القديم، بس المولّد من
          // vite-plugin-pwa كان بيكتب فوقه بنفس الاسم فيبقى ميت في الإنتاج.
          // النتيجة: كل تشغيل بارد كان بينزّل خطوط Google تاني، وصور
          // Cloudinary/Drive ما كانتش بتتخزن على مستوى الـSW.
          runtimeCaching: [
            {
              // خطوط Google: نادرة التغيير — stale-while-revalidate كافي.
              urlPattern: ({ url }: { url: URL }) =>
                url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-runtime',
                expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 180 },
                cacheableResponse: { statuses: [0, 200] }, // 0 = استجابة opaque (بدون CORS)
              },
            },
            {
              // الـchunks المستثناة من الـprecache بتتخزن أول ما تُفتح شاشتها،
              // وأسماء ملفاتها فيها hash فمفيش خطر إن نسخة قديمة تخدم الجديدة.
              urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
                sameOrigin && /\/assets\/.+\.(js|css)$/.test(url.pathname),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'app-assets-runtime',
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              // صور المنتجات من Cloudinary و Google Drive — cache-first مع سقف.
              urlPattern: ({ url }: { url: URL }) =>
                url.hostname === 'res.cloudinary.com' ||
                url.hostname === 'lh3.googleusercontent.com' ||
                url.hostname === 'drive.google.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'product-images-runtime',
                expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 60 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        manifest: {
          id: '/',
          name: 'مجموعة الطنطاوي - مندوب دريم',
          short_name: 'الطنطاوي',
          description: 'نظام إدارة المبيعات والمخزون وقاعدة العملاء',
          dir: 'rtl',
          lang: 'ar',
          theme_color: '#1e3a8a',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              // أيقونة maskable: لازمها أندرويد عشان الأيقونة تتقص بشكل
              // دائري/مطابق للنظام من غير ما يتقص محتواها — بتخلي التطبيق
              // المثبت شكله مطابق لأي تطبيق من المتجر.
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    optimizeDeps: {
      include: ['react', 'react-dom', '@supabase/supabase-js'],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-supabase': ['@supabase/supabase-js'],
          },
        },
      },
    },
  };
});
