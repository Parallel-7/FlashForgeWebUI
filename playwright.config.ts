import { defineConfig, devices } from '@playwright/test';

/**
 * Browser E2E for the standalone FlashForgeWebUI server.
 *
 * workers is pinned to 1 because each spec file boots its own emulator set on
 * FIXED ports (8899/8898 + shifts). Parallel workers would collide with
 * EADDRINUSE, exactly like the FlashForgeUI-Electron browser suite this was
 * ported from.
 */
export default defineConfig({
  testDir: './tests/e2e/browser',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
  },
});
