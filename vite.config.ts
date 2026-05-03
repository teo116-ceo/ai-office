import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

function manualChunks(id: string) {
  if (!id.includes('node_modules')) return undefined
  if (id.includes('/node_modules/three/')) return 'three-core'
  if (id.includes('/node_modules/@react-three/fiber/')) return 'react-three-fiber'
  if (id.includes('/node_modules/@react-three/drei/')) return 'react-three-drei'
  return undefined
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
    hmr: {
      timeout: 120000,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    // Vite's emptyOutDir step crashes in this Windows workspace when dist already exists.
    // The build script removes dist up front instead, so stale files are still avoided.
    emptyOutDir: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      external: [],
      output: {
        manualChunks,
      },
    },
  },
})
