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
    include: [
      'src/**/*.test.ts',
      'src/ui/entityContextMenu/**/*.test.tsx',
      'src/ui/navigation/EntityLink.test.tsx',
      'src/ui/screens/StaffScreen.test.tsx',
      'src/ui-ng/applications/roster/**/*.test.tsx',
      'src/ui-ng/applications/scouting/**/*.test.tsx',
      'src/ui-ng/applications/tactics/**/*.test.tsx',
      'src/ui-ng/applications/training/**/*.test.tsx',
      'src/ui-ng/applications/mentoring/**/*.test.tsx',
      'src/ui-ng/applications/staff/**/*.test.tsx',
      'src/ui-ng/applications/medical/**/*.test.tsx',
      'src/ui-ng/applications/home/**/*.test.tsx',
      'src/ui-ng/applications/recruiting/**/*.test.tsx',
      'src/ui-ng/applications/competition/**/*.test.tsx',
      'src/ui-ng/applications/match/**/*.test.tsx',
      'src/ui-ng/system/**/*.test.tsx',
    ],
  },
})
