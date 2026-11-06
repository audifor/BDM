import { configDefaults, defineConfig } from 'vitest/config'
import base from './vitest.config'

// Reusable for M0.2–M0.6. Milliseconds; six hours accommodates season certification.
const timeout = Number(process.env.M0_TEST_TIMEOUT_MS ?? 21_600_000)
if (!Number.isSafeInteger(timeout) || timeout <= 0) throw new Error('M0_TEST_TIMEOUT_MS must be a positive safe integer')

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['src/certification/m0/**/*.test.ts'],
    exclude: configDefaults.exclude,
    testTimeout: timeout,
    hookTimeout: timeout,
    fileParallelism: false,
  },
})
