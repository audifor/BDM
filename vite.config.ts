import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'lucide-react': fileURLToPath(new URL('./src/ui/pcb-migrated/shared/PcbLucideIcons.jsx', import.meta.url)),
    },
  },
  clearScreen: false,
  define: {
    __BDM_WORLD_DB_PATH__: JSON.stringify(process.env.BDM_WORLD_DB_PATH ?? ''),
    __BDM_WORLD_DB_RUNTIME_BUNDLE_PATH__: JSON.stringify(process.env.BDM_WORLD_DB_RUNTIME_BUNDLE_PATH ?? ''),
  },
  server: {
    port: 1420,
    strictPort: true,
  },
})
