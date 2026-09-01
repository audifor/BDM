import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/ui/entityContextMenu/**/*.test.tsx', 'src/ui/navigation/EntityLink.test.tsx', 'src/ui/screens/StaffScreen.test.tsx'],
  },
})
