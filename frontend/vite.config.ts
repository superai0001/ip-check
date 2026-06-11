import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// During local dev, proxy /api to the FastAPI backend (default :8000).
// In production the frontend is static; the backend base URL is taken from
// VITE_API_BASE (see src/lib/config.ts). When empty, /api is same-origin.
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
