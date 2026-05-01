// Set env at top — earliest possible point. lib/session.ts throws at import
// if SESSION_SECRET is missing or < 32 chars; lib/db/index.ts uses SQLITE_PATH.
process.env.SESSION_SECRET ??= 'test-secret-32-chars-min-do-not-use-prod'
process.env.SQLITE_PATH ??= ':memory:'
;(process.env as Record<string, string | undefined>).NODE_ENV ??= 'test'

import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['tests/setup/session.ts'],
  },
})
