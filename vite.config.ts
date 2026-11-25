import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es'
  },
  define: {
    global: {}
  },
  optimizeDeps: {
    exclude: ['@capacitor/core', '@capacitor/status-bar']
  },
  build: {
    chunkSizeWarningLimit: 1500,
    commonjsOptions: {
      include: [/node_modules/]
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('leaflet')) return 'leaflet-vendor'
            // Keep ALL mapbox-gl in one chunk - splitting creates circular chunks
            if (id.includes('mapbox-gl')) return 'mapbox-vendor'
            if (id.includes('maplibre')) return 'maplibre-vendor'
            if (id.includes('supabase')) return 'supabase-vendor'
            if (id.includes('react-router')) return 'router-vendor'
            return 'vendor'
          }
        }
      }
    }
  }
})