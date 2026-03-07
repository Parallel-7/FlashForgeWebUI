/**
 * @fileoverview Playwright global setup that ensures the standalone WebUI is built.
 */

import { spawnSync } from 'node:child_process';

function getNpmCommand(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export default async function globalSetup(): Promise<void> {
  const result = spawnSync(getNpmCommand(), ['run', 'build'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    shell: process.platform === 'win32',
    stdio: 'pipe',
    windowsHide: true,
  });

  if (result.status === 0) {
    return;
  }

  throw new Error(
    [
      'Failed to build FlashForgeWebUI before running Playwright tests.',
      result.stdout?.trim() ?? '',
      result.stderr?.trim() ?? '',
    ]
      .filter((line) => line.length > 0)
      .join('\n')
  );
}
