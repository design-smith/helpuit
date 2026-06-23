import { defineConfig } from 'vitest/config'

// Real-Postgres tests via testcontainers (Docker required) — isolated from the
// default suite so it stays dependency-free. Invoked via `pnpm test:pg`.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.pg.test.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
