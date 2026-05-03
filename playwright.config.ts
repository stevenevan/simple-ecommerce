import { defineConfig } from '@playwright/test'

const PORT = process.env.E2E_PORT ?? '3100'
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/fixtures/globalSetup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'api',
      testMatch: /tests\/api\/.*\.spec\.ts$/,
    },
    {
      name: 'chromium',
      testMatch: /tests\/e2e\/.*\.spec\.ts$/,
      use: {
        baseURL: BASE_URL,
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      SQLITE_PATH: process.env.SQLITE_PATH ?? 'data/test.db',
      SESSION_SECRET:
        process.env.SESSION_SECRET ?? 'test-secret-32-chars-min-do-not-use-prod',
      NODE_ENV: 'development',
      PORT,
    },
  },
})
