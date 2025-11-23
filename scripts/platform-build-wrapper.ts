/**
 * @fileoverview Wraps platform-specific npm build scripts to add timing output.
 *
 * Accepts a platform argument (win, linux, linux-arm, linux-armv7, mac, mac-arm),
 * proxies the existing npm build script, and reports the total duration using a
 * green bullet log format.
 */

import { spawn } from 'child_process';

type PlatformKey = 'win' | 'linux' | 'linux-arm' | 'linux-armv7' | 'mac' | 'mac-arm';

interface PlatformConfig {
  displayName: string;
  scriptName: string;
}

const PLATFORM_CONFIG: Record<PlatformKey, PlatformConfig> = {
  win: {
    displayName: 'Windows x64',
    scriptName: 'build:win',
  },
  linux: {
    displayName: 'Linux x64',
    scriptName: 'build:linux',
  },
  'linux-arm': {
    displayName: 'Linux ARM64',
    scriptName: 'build:linux-arm',
  },
  'linux-armv7': {
    displayName: 'Linux ARMv7',
    scriptName: 'build:linux-armv7',
  },
  mac: {
    displayName: 'macOS x64',
    scriptName: 'build:mac',
  },
  'mac-arm': {
    displayName: 'macOS ARM64',
    scriptName: 'build:mac-arm',
  },
};

const GREEN = '\u001B[32m';
const RED = '\u001B[31m';
const RESET = '\u001B[0m';
const GREEN_DOT = `${GREEN}•${RESET}`;
const RED_CROSS = `${RED}✖${RESET}`;

function logBullet(message: string): void {
  process.stdout.write(`  ${GREEN_DOT} ${message}\n`);
}

function logError(message: string): void {
  process.stderr.write(`  ${RED_CROSS} ${message}\n`);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }

  return `${(ms / 1000).toFixed(2)}s`;
}

interface ParsedArgs {
  platform: PlatformKey | null;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let platform: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--platform' && args[i + 1]) {
      platform = args[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--platform=')) {
      platform = arg.split('=')[1];
      continue;
    }

    if (!arg.startsWith('--') && !platform) {
      platform = arg;
      continue;
    }
  }

  if (platform && isPlatformKey(platform)) {
    return { platform };
  }

  return { platform: null };
}

function isPlatformKey(value: string): value is PlatformKey {
  return value in PLATFORM_CONFIG;
}

function runNpmScript(scriptName: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(`npm run ${scriptName}`, {
      shell: true,
      stdio: 'inherit',
    });

    child.on('error', reject);

    child.on('close', (code, signal) => {
      if (signal) {
        reject(new Error(`Build process terminated by signal: ${signal}`));
        return;
      }

      resolve(code);
    });
  });
}

async function runPlatformBuild(platform: PlatformKey): Promise<void> {
  const { displayName, scriptName } = PLATFORM_CONFIG[platform];
  logBullet(`starting ${displayName} build via ${scriptName}`);

  const start = Date.now();
  const exitCode = await runNpmScript(scriptName);
  const duration = formatDuration(Date.now() - start);

  if (exitCode && exitCode !== 0) {
    logError(`${displayName} build failed after ${duration} (exit code ${exitCode})`);
    process.exit(exitCode);
    return;
  }

  logBullet(`${displayName} build complete in ${duration}`);
}

async function main(): Promise<void> {
  const { platform } = parseArgs();

  if (!platform) {
    const supported = Object.keys(PLATFORM_CONFIG).join('|');
    logError(`Missing or invalid platform argument. Usage: tsx scripts/platform-build-wrapper.ts --platform <${supported}>`);
    process.exit(1);
    return;
  }

  try {
    await runPlatformBuild(platform);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(message);
    process.exit(1);
  }
}

void main();
