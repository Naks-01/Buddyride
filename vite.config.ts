import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('leaflet')) return 'leaflet-vendor'
            if (id.includes('maplibre') || id.includes('mapbox') || id.includes('mapbox-gl')) return 'map-vendor'
            if (id.includes('supabase')) return 'supabase-vendor'
            if (id.includes('react-router')) return 'router-vendor'
            return 'vendor'
          }
          // DON'T split pages - this causes circular chunks!
          // Let Vite handle pages automatically
        }
      }
    }
  }
})