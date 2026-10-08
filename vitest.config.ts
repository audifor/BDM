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
    // Vitest forks do not inherit the parent's V8 flags. Long-horizon memory
    // measurements require actual forced GC in the simulation worker.
    ...(process.env.BS15I_LONG_HORIZON === '1' || process.env.BS15I_CLOSURE_REPLAY ? {
      execArgv: ['--expose-gc', '--max-old-space-size=12000'],
    } : {}),
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
    ],
  },
})
