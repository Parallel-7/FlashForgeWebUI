/**
 * @fileoverview Helper utilities for launching and controlling flashforge-emulator-v2
 * instances during browser E2E runs, including readiness checks and teardown.
 *
 * Ported from FlashForgeUI-Electron's Electron E2E harness so both frontends drive
 * the same emulator surface. The process-tree teardown discipline matters just as
 * much here: the emulator binds its ports in a tsx grandchild that npm does not
 * forward signals to, so a naive kill leaks a process holding 8899/8898 and the
 * next spec fails with EADDRINUSE.
 */

import { type ChildProcessByStdio, spawn, spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import type { Readable } from 'node:stream';

const EMULATOR_READY_TOKEN = 'EMULATOR_READY';
const DEFAULT_START_TIMEOUT_MS = 30_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 20_000;
const HEALTH_POLL_INTERVAL_MS = 250;
const PROCESS_EXIT_TIMEOUT_MS = 5_000;

export type EmulatorModel =
  | 'adventurer-3'
  | 'adventurer-4'
  | 'adventurer-5m'
  | 'adventurer-5m-pro'
  | 'adventurer-5x'
  | 'creator-5'
  | 'creator-5-pro';

type SimulationMode = 'auto' | 'manual';

export interface EmulatorInstanceConfig {
  instanceId: string;
  model: EmulatorModel;
  serial: string;
  checkCode: string;
  machineName: string;
  tcpPort: number;
  httpPort: number;
  discoveryEnabled: boolean;
  simulationMode?: SimulationMode;
  simulationSpeed?: number;
}

export interface EmulatorReadyPayload {
  instanceId: string;
  ip: string;
  tcpPort: number;
  httpPort: number;
  serial: string;
  model: string;
}

interface WaitForReadyResult {
  readyPayloads: EmulatorReadyPayload[];
  stdoutLines: string[];
  stderrLines: string[];
}

interface HealthPayload {
  ok: boolean;
}

interface StartHarnessResult {
  readyPayloads: EmulatorReadyPayload[];
  stop: () => Promise<void>;
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

const resolveEmulatorRoot = (): string => {
  const fromEnv = process.env.FF_EMULATOR_ROOT?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return path.resolve(fromEnv);
  }

  return path.resolve(process.cwd(), '..', 'flashforge-emulator-v2');
};

const assertEmulatorRoot = async (emulatorRoot: string): Promise<void> => {
  const packageJsonPath = path.join(emulatorRoot, 'package.json');
  try {
    await access(packageJsonPath);
  } catch {
    throw new Error(
      `Unable to locate flashforge-emulator-v2 package.json at ${packageJsonPath}. Set FF_EMULATOR_ROOT to the emulator repo path.`
    );
  }
};

const buildInstanceArgs = (instance: EmulatorInstanceConfig): string[] => {
  return [
    '--instance-id',
    instance.instanceId,
    '--model',
    instance.model,
    '--serial',
    instance.serial,
    '--check-code',
    instance.checkCode,
    '--machine-name',
    instance.machineName,
    '--tcp-port',
    String(instance.tcpPort),
    '--http-port',
    String(instance.httpPort),
    '--discovery-enabled',
    String(instance.discoveryEnabled),
    '--simulation-mode',
    instance.simulationMode ?? 'auto',
    '--simulation-speed',
    String(instance.simulationSpeed ?? 100),
  ];
};

const spawnEmulatorProcess = (
  emulatorRoot: string,
  args: readonly string[]
): ChildProcessByStdio<null, Readable, Readable> => {
  const child = spawn(getNpmCommand(), args, {
    cwd: emulatorRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    windowsHide: true,
    // The command is `npm run headless:instance`, so the process that actually binds
    // the printer ports is a grandchild (npm -> tsx). npm does not forward SIGTERM to
    // it, so signalling the child alone leaves the grandchild alive still holding
    // 8899/8898 and the next describe fails with EADDRINUSE. Detaching puts the whole
    // tree in its own process group, which stopProcessTree can then signal as a unit.
    // Windows has no process groups and uses `taskkill /T` instead.
    detached: process.platform !== 'win32',
  }) as ChildProcessByStdio<null, Readable, Readable>;

  return child;
};

const waitForReady = async (params: {
  child: ChildProcessByStdio<null, Readable, Readable>;
  expectedReadyCount: number;
  timeoutMs: number;
  label: string;
}): Promise<WaitForReadyResult> => {
  const { child, expectedReadyCount, timeoutMs, label } = params;

  return await new Promise<WaitForReadyResult>((resolve, reject) => {
    const readyPayloads: EmulatorReadyPayload[] = [];
    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];
    const stdoutReader = readline.createInterface({ input: child.stdout });
    const stderrReader = readline.createInterface({ input: child.stderr });

    let expectingReadyJson = false;
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
            `${label} failed: ${message}\n--- stdout ---\n${formatLogTail(stdoutLines)}\n--- stderr ---\n${formatLogTail(stderrLines)}`
          )
        );
      });
    };

    const handleError = (error: Error): void => {
      fail(`process error: ${error.message}`);
    };

    const handleExit = (code: number | null, signal: NodeJS.Signals | null): void => {
      if (readyPayloads.length >= expectedReadyCount) {
        finish(() => {
          resolve({ readyPayloads, stdoutLines, stderrLines });
        });
        return;
      }

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

      if (expectingReadyJson) {
        expectingReadyJson = false;
        try {
          const payload = JSON.parse(trimmed) as EmulatorReadyPayload;
          readyPayloads.push(payload);
        } catch {
          fail(`invalid JSON after ${EMULATOR_READY_TOKEN}: ${trimmed}`);
          return;
        }

        if (readyPayloads.length >= expectedReadyCount) {
          finish(() => {
            resolve({ readyPayloads, stdoutLines, stderrLines });
          });
        }
        return;
      }

      if (trimmed === EMULATOR_READY_TOKEN) {
        expectingReadyJson = true;
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

const waitForHealthReady = async (httpPort: number, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${httpPort}/__health`);
      if (response.ok) {
        const payload = (await response.json()) as HealthPayload;
        if (payload.ok === true) {
          return;
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(HEALTH_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Health endpoint did not become ready for httpPort=${httpPort}. Last error: ${lastError ?? 'none'}`
  );
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

/**
 * Kills a spawned process and everything it started.
 *
 * Exported because the standalone-server harness spawns the WebUI server the same
 * way and must not re-derive the POSIX process-group handling; getting it wrong
 * leaks a process that still holds a port and breaks the next suite with
 * EADDRINUSE.
 */
export const stopProcessTree = async (
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

  // Signal the whole process group (negative pid) so the tsx grandchild holding the
  // printer ports dies with npm. Falls back to the child alone if the group is already
  // gone, which surfaces as ESRCH.
  const signalTree = (signal: NodeJS.Signals): void => {
    try {
      if (child.pid) {
        process.kill(-child.pid, signal);
        return;
      }
    } catch {
      // Group already reaped, or the platform refused it - fall through.
    }
    child.kill(signal);
  };

  signalTree('SIGTERM');
  await waitForChildExit(child, PROCESS_EXIT_TIMEOUT_MS);

  if (child.exitCode === null) {
    signalTree('SIGKILL');
    await waitForChildExit(child, PROCESS_EXIT_TIMEOUT_MS);
  }
};

const createHarnessResult = (
  child: ChildProcessByStdio<null, Readable, Readable>,
  readyPayloads: EmulatorReadyPayload[],
  cleanup: (() => Promise<void>) | null = null
): StartHarnessResult => {
  return {
    readyPayloads,
    stop: async () => {
      await stopProcessTree(child);
      if (cleanup) {
        await cleanup();
      }
    },
  };
};

export const startEmulatorInstance = async (params: {
  instance: EmulatorInstanceConfig;
  startupTimeoutMs?: number;
  healthTimeoutMs?: number;
}): Promise<StartHarnessResult> => {
  const emulatorRoot = resolveEmulatorRoot();
  await assertEmulatorRoot(emulatorRoot);

  const startupTimeoutMs = params.startupTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
  const healthTimeoutMs = params.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;

  const args = ['run', 'headless:instance', '--', ...buildInstanceArgs(params.instance)];
  const child = spawnEmulatorProcess(emulatorRoot, args);

  const readiness = await waitForReady({
    child,
    expectedReadyCount: 1,
    timeoutMs: startupTimeoutMs,
    label: 'Single-instance emulator',
  });

  await waitForHealthReady(readiness.readyPayloads[0].httpPort, healthTimeoutMs);

  return createHarnessResult(child, readiness.readyPayloads);
};
