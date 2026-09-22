import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    base: '/',
    plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.png'],
      manifest: {
        name: 'BuddyRide1',
        short_name: 'BuddyRide1',
        description: 'eHailing for Limpopo - fast, light, affordable rides',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/logos/app-icon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/logos/app-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
    ],
    server: {
      host: 'localhost',
      port: 5173,
      strictPort: true,
    },
    optimizeDeps: {
      exclude: ['maplibre-gl'],
    },
    build: {
      target: 'es2020', // maplibre-gl uses BigInt literals, which es2018 can't parse
      chunkSizeWarningLimit: 1300,
      outDir: 'dist',
    },
});
