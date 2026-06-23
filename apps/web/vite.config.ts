import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, proxy the API/ops paths to the running backend so the SPA is
// same-origin (cookies + bearer both work, no CORS). In prod the SPA is built
// to dist/ and served by the same Fastify server, so no proxy is needed.
const proxyTarget = 'http://localhost:3000'
const proxied = ['/admin', '/healthz', '/readyz', '/metrics', '/webhooks']

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      proxied.map((p) => [p, { target: proxyTarget, changeOrigin: true }]),
    ),
  },
})
