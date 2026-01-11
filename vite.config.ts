import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
// Note: Static site generation for SEO routes is handled by a post-build script
// (scripts/generate-static-routes.ts) that runs after vite build. This config
// is optimized for standard SPA builds.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Force single React instance
      "react": path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
    dedupe: ['react', 'react-dom'], // Prevent multiple React instances
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    force: true, // Force re-optimization
  },
})

