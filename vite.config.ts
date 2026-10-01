import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // MapLibre's worker is an ES module (see src/components/GroupMap.tsx).
  worker: { format: 'es' },
})
