import path from "path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { unplugin as stylex } from "@stylexjs/unplugin"

const dirname = path.dirname(fileURLToPath(import.meta.url))
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}

export default defineConfig({
  // "/" when the web app is served on its own origin (`npm run dev`, a
  // plain static host). The combined site build (frontend/build-site.mjs)
  // passes BASE_URL=/app/ because the landing page owns the root there.
  base: env.BASE_URL || "/",
  // StyleX (staff console) runs first so its CSS is collected per entry:
  // the console's stylesheet only loads with the console document.
  plugins: [stylex.vite(), react(), tailwindcss()],
  // One web app, two documents: the citizen screens with the shared login
  // (index.html) and the staff console (dashboard/index.html). They share the
  // session; the console keeps its own design-system stylesheets to itself.
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(dirname, "index.html"),
        // Emitted as dist/dashboard/index.html, so /dashboard/ opens on any static host.
        dashboard: path.resolve(dirname, "dashboard/index.html"),
      },
    },
    chunkSizeWarningLimit: 1200,
  },
  server: {
    proxy: {
      // Local dev talks to the live API; override with VITE_DEV_API.
      "/api": { target: env.VITE_DEV_API || "https://51-44-152-213.sslip.io", changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
})
