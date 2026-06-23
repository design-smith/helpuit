import { defineConfig } from 'vitest/config'

// Unit + integration suite. Heavy/infra tests live in separate configs so the
// default run stays fast + dependency-free: real-browser Playwright
// (`vitest.browser.config.ts`) and real-Postgres/testcontainers
// (`vitest.pg.config.ts`, `*.pg.test.ts`, run via `pnpm test:pg`).
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'packages/playwright/**', '**/*.smoke.test.ts', '**/*.pg.test.ts'],
  },
})
