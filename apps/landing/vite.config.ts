import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath } from "node:url"

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // Landing lives under /landing/ on the VPS so the citizen app (base "/")
  // can own the root paths: /, /login, /signup, /home, /report, ...
  // "/" itself is served from the landing build by the container nginx.
  base: "/landing/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
})
