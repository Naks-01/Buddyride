import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          const packagePath = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1];
          return packagePath ? `vendor-${packagePath.replace('@', '').replace('/', '-')}` : undefined;
        },
      },
    },
  },
  server: { port: 5173 }
})