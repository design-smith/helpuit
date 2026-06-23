import { defineConfig } from 'vitest/config'

// Boot smoke tests spawn the real server process (via tsx) and probe it over HTTP.
// Kept out of the default suite (process spawn + port binding) and run serially.
export default defineConfig({
  test: {
    include: ['apps/*/src/**/*.smoke.test.ts'],
    fileParallelism: false,
    testTimeout: 60000,
  },
})
