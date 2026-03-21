#!/usr/bin/env node

/**
 * @fileoverview Wrapper script that runs the guarded standalone hardware Playwright
 * Discord validation against a real printer.
 */

const { spawnSync } = require('node:child_process');

const requiredEnvNames = ['FFUI_E2E_AD5X_IP', 'FFUI_E2E_AD5X_CHECK_CODE'];

for (const name of requiredEnvNames) {
  if (!process.env[name] || process.env[name].trim().length === 0) {
    console.error(`[e2e:hardware] Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const env = {
  ...process.env,
  FFUI_E2E_HARDWARE: '1',
};

const passthroughArgs = process.argv.slice(2);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const testResult = spawnSync(
  npmCommand,
  ['run', 'test:e2e', '--', 'e2e/discord-hardware.spec.ts', ...passthroughArgs],
  {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
    windowsHide: true,
  }
);

process.exit(testResult.status ?? 1);
