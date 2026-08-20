import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      minify: 'esbuild',
      esbuild: {
        drop: ['debugger'],
      },
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom'],
            'vendor-icons': ['lucide-react'],
            'vendor-data': ['xlsx', '@supabase/supabase-js', '@google/genai'],
          },
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name?.endsWith('.css')) {
              return 'assets/css/[name]-[hash][extname]';
            }
            const extType = assetInfo.name?.split('.').pop();
            if (extType === 'png' || extType === 'jpg' || extType === 'jpeg' || extType === 'gif' || extType === 'svg' || extType === 'webp') {
              return 'assets/images/[name]-[hash][extname]';
            }
            if (extType === 'woff' || extType === 'woff2' || extType === 'ttf' || extType === 'eot') {
              return 'assets/fonts/[name]-[hash][extname]';
            }
            return 'assets/[name]-[hash][extname]';
          },
        },
      },
      chunkSizeWarningLimit: 800,
      sourcemap: false,
      reportCompressedSize: false,
    },
  };
});
