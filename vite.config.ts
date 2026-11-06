import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es'
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('leaflet')) return 'leaflet-vendor'
            if (id.includes('mapbox-gl/dist/esm/core.js')) return 'mapbox-core'
            if (id.includes('mapbox-gl/dist/esm/shared.js')) return 'mapbox-shared'
            if (id.includes('mapbox-gl')) return 'mapbox-vendor'
            if (id.includes('maplibre')) return 'maplibre-vendor'
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