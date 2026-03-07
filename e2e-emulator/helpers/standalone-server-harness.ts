/**
 * @fileoverview Isolated standalone server process harness for emulator-backed WebUI E2E tests.
 */

import { type ChildProcessByStdio, spawn, spawnSync } from 'node:child_process';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { Readable } from 'node:stream';
import { DEFAULT_CONFIG, type AppConfig } from '../../src/types/config';

const READY_TOKEN = '[Ready] FlashForgeWebUI is ready';
const PROCESS_EXIT_TIMEOUT_MS = 5_000;
const SERVER_START_TIMEOUT_MS = 45_000;
const SERVER_HEALTH_TIMEOUT_MS = 15_000;
const HEALTH_POLL_INTERVAL_MS = 250;
const DIST_ENTRY = path.resolve(process.cwd(), 'dist', 'index.js');
let buildPreparationPromise: Promise<void> | null = null;

export interface SeededPrinterDetailsEntry {
  Name: string;
  IPAddress: string;
  SerialNumber: string;
  CheckCode: string;
  ClientType: 'legacy' | 'new';
  printerModel: string;
  modelType?: string;
  customCameraEnabled?: boolean;
  customCameraUrl?: string;
  customLedsEnabled?: boolean;
  forceLegacyMode?: boolean;
  webUIEnabled?: boolean;
  commandPort?: number;
  httpPort?: number;
}

export interface StandaloneServerHarness {
  readonly baseUrl: string;
  readonly dataDir: string;
  readonly webUiPort: number;
  readonly stdoutLines: string[];
  readonly stderrLines: string[];
  stop(): Promise<void>;
}

interface WaitForReadyResult {
  stdoutLines: string[];
  stderrLines: string[];
}

export interface StartStandaloneServerOptions {
  webUiPort?: number;
  authRequired?: boolean;
  password?: string;
  seededPrinters?: readonly SeededPrinterDetailsEntry[];
  startupTimeoutMs?: number;
}

const sleep = async (ms: number): Promise<void> =>
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const formatLogTail = (lines: readonly string[], maxLines = 20): string => {
  if (lines.length === 0) {
    return '(no output)';
  }

  return lines.slice(-maxLines).join('\n');
};

const getNpmCommand = (): string => {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
};

const ensureFreshBuild = async (): Promise<void> => {
  if (!buildPreparationPromise) {
    buildPreparationPromise = (async () => {
      const buildResult = spawnSync(getNpmCommand(), ['run', 'build'], {
        cwd: process.cwd(),
        env: process.env,
        encoding: 'utf-8',
        shell: process.platform === 'win32',
        windowsHide: true,
      });

      if (buildResult.error) {
        throw buildResult.error;
      }

      if (buildResult.status !== 0) {
        throw new Error(
          `Failed to build standalone server for E2E.\n--- stdout ---\n${
            buildResult.stdout?.trim() || '(no output)'
          }\n--- stderr ---\n${buildResult.stderr?.trim() || '(no output)'}`
        );
      }

      try {
        await access(DIST_ENTRY);
      } catch {
        throw new Error(`Built server entry not found after build at ${DIST_ENTRY}.`);
      }
    })().catch((error) => {
      buildPreparationPromise = null;
      throw error;
    });
  }

  await buildPreparationPromise;
};

export const getFreePort = async (): Promise<number> => {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to acquire a free port')));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
};

export const getDistinctFreePorts = async (count: number): Promise<number[]> => {
  const ports = new Set<number>();
  while (ports.size < count) {
    ports.add(await getFreePort());
  }

  return Array.from(ports.values());
};

const waitForChildExit = async (
  child: ChildProcessByStdio<null, Readable, Readable>,
  timeoutMs: number
): Promise<void> => {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;

    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      child.off('exit', onExit);
      clearTimeout(timeoutId);
      resolve();
    };

    const onExit = (): void => {
      finish();
    };

    const timeoutId = setTimeout(() => {
      finish();
    }, timeoutMs);

    child.on('exit', onExit);
  });
};

const stopProcessTree = async (
  child: ChildProcessByStdio<null, Readable, Readable>
): Promise<void> => {
  if (child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32' && child.pid) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
    });
    await waitForChildExit(child, PROCESS_EXIT_TIMEOUT_MS);
    return;
  }

  child.kill('SIGTERM');
  await waitForChildExit(child, PROCESS_EXIT_TIMEOUT_MS);

  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await waitForChildExit(child, PROCESS_EXIT_TIMEOUT_MS);
  }
};

const waitForReady = async (params: {
  child: ChildProcessByStdio<null, Readable, Readable>;
  timeoutMs: number;
  webUiPort: number;
}): Promise<WaitForReadyResult> => {
  const { child, timeoutMs, webUiPort } = params;

  return await new Promise<WaitForReadyResult>((resolve, reject) => {
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const stdoutReader = readline.createInterface({ input: child.stdout });
    const stderrReader = readline.createInterface({ input: child.stderr });

    let settled = false;

    const cleanup = (): void => {
      clearTimeout(timeoutId);
      stdoutReader.close();
      stderrReader.close();
      child.off('error', handleError);
      child.off('exit', handleExit);
    };

    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const fail = (message: string): void => {
      finish(() => {
        reject(
          new Error(
            `Standalone WebUI server failed on port ${webUiPort}: ${message}\n--- stdout ---\n${formatLogTail(stdoutLines)}\n--- stderr ---\n${formatLogTail(stderrLines)}`
          )
        );
      });
    };

    const handleError = (error: Error): void => {
      fail(`process error: ${error.message}`);
    };

    const handleExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      fail(`process exited before readiness (code=${String(code)}, signal=${String(signal)})`);
    };

    const timeoutId = setTimeout(() => {
      fail(`timed out waiting for readiness after ${timeoutMs}ms`);
    }, timeoutMs);

    stdoutReader.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        stdoutLines.push(trimmed);
      }

      if (trimmed.includes(READY_TOKEN)) {
        finish(() => {
          resolve({ stdoutLines, stderrLines });
        });
      }
    });

    stderrReader.on('line', (line) => {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        stderrLines.push(trimmed);
      }
    });

    child.on('error', handleError);
    child.on('exit', handleExit);
  });
};

const waitForServerReady = async (baseUrl: string, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/status`);
      if (response.ok) {
        return;
      }
      lastError = `status=${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(HEALTH_POLL_INTERVAL_MS);
  }

  throw new Error(`Server at ${baseUrl} did not become ready. Last error: ${lastError ?? 'none'}`);
};

const buildConfigPayload = (params: {
  webUiPort: number;
  authRequired: boolean;
  password: string;
}): AppConfig => {
  return {
    ...DEFAULT_CONFIG,
    WebUIEnabled: true,
    WebUIPort: params.webUiPort,
    WebUIPassword: params.password,
    WebUIPasswordRequired: params.authRequired,
    WebUITheme: { ...DEFAULT_CONFIG.WebUITheme },
  };
};

const writeSeededConfig = async (params: {
  dataDir: string;
  webUiPort: number;
  authRequired: boolean;
  password: string;
}): Promise<void> => {
  const configPath = path.join(params.dataDir, 'config.json');
  const payload = buildConfigPayload(params);
  await writeFile(configPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
};

const writeSeededPrinters = async (
  dataDir: string,
  printers: readonly SeededPrinterDetailsEntry[]
): Promise<void> => {
  if (printers.length === 0) {
    return;
  }

  const printerConfigPath = path.join(dataDir, 'printer_details.json');
  const nowIso = new Date().toISOString();
  const printerMap = printers.reduce<Record<string, SeededPrinterDetailsEntry & { lastConnected: string }>>(
    (acc, printer) => {
      acc[printer.SerialNumber] = {
        ...printer,
        lastConnected: nowIso,
      };
      return acc;
    },
    {}
  );

  await writeFile(
    printerConfigPath,
    `${JSON.stringify(
      {
        lastUsedPrinterSerial: printers[0]?.SerialNumber ?? null,
        printers: printerMap,
      },
      null,
      2
    )}\n`,
    'utf-8'
  );
};

export const startStandaloneServer = async (
  options: StartStandaloneServerOptions = {}
): Promise<StandaloneServerHarness> => {
  await ensureFreshBuild();

  const webUiPort = options.webUiPort ?? (await getFreePort());
  const authRequired = options.authRequired ?? false;
  const password = options.password ?? 'secret';
  const startupTimeoutMs = options.startupTimeoutMs ?? SERVER_START_TIMEOUT_MS;
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'flashforge-webui-e2e-'));

  await writeSeededConfig({
    dataDir,
    webUiPort,
    authRequired,
    password,
  });
  await writeSeededPrinters(dataDir, options.seededPrinters ?? []);

  const child = spawn(process.execPath, [DIST_ENTRY, '--no-printers', `--webui-port=${webUiPort}`], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }) as ChildProcessByStdio<null, Readable, Readable>;

  const readiness = await waitForReady({
    child,
    timeoutMs: startupTimeoutMs,
    webUiPort,
  });

  const baseUrl = `http://127.0.0.1:${webUiPort}`;
  await waitForServerReady(baseUrl, SERVER_HEALTH_TIMEOUT_MS);

  return {
    baseUrl,
    dataDir,
    webUiPort,
    stdoutLines: readiness.stdoutLines,
    stderrLines: readiness.stderrLines,
    stop: async () => {
      await stopProcessTree(child);
      await rm(dataDir, { recursive: true, force: true });
    },
  };
};
