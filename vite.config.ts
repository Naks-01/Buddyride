import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split big libraries into their own chunks
          if (id.includes('node_modules')) {
            if (id.includes('leaflet')) return 'leaflet-vendor'
            if (id.includes('maplibre') || id.includes('mapbox')) return 'map-vendor'
            if (id.includes('supabase')) return 'supabase-vendor'
            if (id.includes('react-router')) return 'router-vendor'
            return 'vendor'
          }
          // Split Admin pages - passengers don't need them
          if (id.includes('/pages/Admin')) return 'admin-pages'
          if (id.includes('/pages/Driver')) return 'driver-pages'
        }
      }
    }
  }
})