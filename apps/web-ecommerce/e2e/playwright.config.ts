import { defineConfig } from '@playwright/test';

// Browser tests against a running stack (docs/DEMO.md): `yarn e2e` against local processes or the compose e2e stack.
// Browser: the installed Chrome by default; E2E_BROWSER_CHANNEL picks another channel, and E2E_CHROMIUM_PATH launches
// a given Chromium binary (when the installed browsers do not match this Playwright version).
export default defineConfig({
  testDir: '.',
  outputDir: '.results',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // the specs share one shop and one agent
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: '.report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:6050',
    ...(process.env.E2E_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.E2E_CHROMIUM_PATH } }
      : { channel: process.env.E2E_BROWSER_CHANNEL || 'chrome' }), // the installed Chrome: no browser download needed
    locale: 'vi-VN',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
