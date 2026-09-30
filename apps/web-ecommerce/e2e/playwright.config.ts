import { defineConfig } from '@playwright/test';

// Opt-in browser tests of the CI console against a running stack (docs/DEMO.md, "Browser tests").
// Run with `yarn e2e` while `yarn dev` and the agent are up; they are not part of the default gates.
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
    channel: process.env.E2E_BROWSER_CHANNEL || 'chrome', // the installed Chrome: no browser download needed
    locale: 'vi-VN',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
