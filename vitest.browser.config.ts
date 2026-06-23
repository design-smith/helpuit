import { defineConfig } from 'vitest/config'

// Real-browser (Playwright) e2e tests — run serially so Chromium launches don't
// contend for resources. Invoked via `pnpm test:browser`.
export default defineConfig({
  test: {
    include: ['packages/playwright/src/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 45000,
  },
})
