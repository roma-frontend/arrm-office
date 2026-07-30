import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ['html', { open: 'never' }],
        ['junit', { outputFile: 'reports/e2e-results.xml' }],
      ]
    : [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(process.env.CI
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
        ]
      : []),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // CI runs the *production* server against a real build. `next dev`
        // (Turbopack) compiles routes on demand, and on 2026-07-30 it came up
        // with a broken route tree: the root layout rendered, but every nested
        // route — /login, /api/auth/* — 404'd for the entire run, failing all
        // 9 auth tests. A rerun of the same SHA passed, confirming a race
        // rather than a code regression. `next start` serves a prebuilt
        // manifest, so there is no such window.
        command: process.env.CI ? 'npm run start' : 'npm run dev',
        // Probe a real nested route rather than '/'. Playwright treats any
        // status < 404 as "ready", so probing '/' would have accepted exactly
        // the broken state above — the root served fine while routes 404'd.
        url: 'http://localhost:3000/login',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
