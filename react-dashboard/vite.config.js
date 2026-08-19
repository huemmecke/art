import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Allows serving the build from a subfolder (e.g. /dashboard/) as static files.
  base: './',
  plugins: [react()],
})
