import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import stylex from '@stylexjs/unplugin'

// Served under /dash/ on the VPS (nginx proxies /api to PocketBase on the same
// origin). BASE_URL is injected as base so the app router can strip it.
export default defineConfig({
  base: '/dash/',
  plugins: [stylex.vite(), react()],
  server: {
    proxy: {
      '/api': { target: 'https://15.224.0.22.sslip.io', changeOrigin: true, secure: false },
    },
  },
  build: { chunkSizeWarningLimit: 1200 },
})
