/**
 * @fileoverview Playwright configuration for headless emulator-backed standalone WebUI tests.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-emulator',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  retries: 0,
  timeout: 180_000,
  workers: 1,
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
});
