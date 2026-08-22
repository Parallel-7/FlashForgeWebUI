/**
 * @fileoverview Boots the real standalone FlashForgeWebUI server so browser tests
 * drive the production stack.
 *
 * There is deliberately no fixture or stub here. This starts emulator printers, seeds
 * an isolated DATA_DIR, launches the built server (`node dist/index.js
 * --all-saved-printers`), and waits for its HTTP API. Every request a test makes is
 * served by the real Express app: real auth middleware and AuthManager, real security
 * and static-asset middleware, real WebSocketManager broadcasting real polling data
 * from the emulated printers.
 *
 * Nothing in this file may reimplement app behaviour - if a test needs a response,
 * the server has to produce it. (The lesson that created this rule: an earlier
 * fixture-suite elsewhere ran against a hand-written API reimplementation, could not
 * catch a single server-side regression, and drifted silently from the real routes.)
 *
 * Key exports:
 * - startStandaloneWebUI(): boot emulators + the server, return its base URL
 */

import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import type { Readable } from 'node:stream';
import { type EmulatorModel, startEmulatorInstance, stopProcessTree } from './emulator-harness';

const SERVER_READY_TIMEOUT_MS = 60_000;
const PRINTER_READY_TIMEOUT_MS = 90_000;
const READY_POLL_INTERVAL_MS = 400;
const LOG_TAIL_LINES = 40;

/** Password the harness configures the WebUI with. Tests need it to log in. */
export const WEBUI_TEST_PASSWORD = 'e2e-webui-password';

export interface StandalonePrinter {
  label: string;
  model: EmulatorModel;
  serial: string;
  checkCode: string;
  /** Must not contain spaces: the emulator CLI parses argv positionally. */
  machineName: string;
  tcpPort: number;
  httpPort: number;
}

/**
 * Two printers by default so context switching has real contexts to switch between.
 *
 * Only one instance per machine can hold the firmware default ports, so the second is
 * shifted. Both are reached through the saved profile, which carries explicit ports.
 */
export const DEFAULT_STANDALONE_PRINTERS: readonly StandalonePrinter[] = [
  {
    label: 'Adventurer 5M Pro (emulated)',
    model: 'adventurer-5m-pro',
    serial: 'E2E-WEBUI-5MPRO',
    checkCode: '123',
    machineName: 'WebUI-5MPro',
    tcpPort: 8899,
    httpPort: 8898,
  },
  {
    label: 'AD5X (emulated)',
    model: 'adventurer-5x',
    serial: 'E2E-WEBUI-AD5X',
    checkCode: '123',
    machineName: 'WebUI-AD5X',
    tcpPort: 8999,
    httpPort: 8998,
  },
];

export interface StandaloneWebUI {
  /** Base URL of the WebUI server that was started. */
  readonly baseUrl: string;
  readonly password: string;
  /** Printers the server connected, in the order they were seeded. */
  readonly printers: readonly StandalonePrinter[];
  /** Recent server stdout/stderr, for failure messages. */
  logTail(): string;
  stop(): Promise<void>;
}

export interface StartStandaloneWebUIOptions {
  printers?: readonly StandalonePrinter[];
  /**
   * Printers seeded into the saved profile; defaults to `printers`. Pass a subset
   * (or []) to boot emulators the server does NOT auto-connect, e.g. so specs can
   * exercise the manual connect flow against them.
   */
  seedPrinters?: readonly StandalonePrinter[];
  password?: string;
  /** Number of printers the server must have connected before tests start. */
  requireConnectedPrinters?: number;
}

const sleep = async (ms: number): Promise<void> =>
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Asks the OS for a free port so parallel runs and stray servers cannot collide. */
const findFreePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      if (address === null || typeof address === 'string') {
        probe.close(() => reject(new Error('Could not determine a free port for the WebUI')));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });

/** Maps an emulator model token to the printerModel string the app's detection reads. */
const modelToPrinterModel = (model: EmulatorModel): string => {
  switch (model) {
    case 'adventurer-5m-pro':
      return 'Adventurer 5M Pro';
    case 'adventurer-5x':
      return 'AD5X';
    case 'creator-5':
      return 'Creator 5';
    case 'creator-5-pro':
      return 'Creator 5 Pro';
    default:
      return model;
  }
};

/**
 * Writes the saved-printer profile and deterministic config the server reads on boot.
 *
 * printer_details.json mirrors the persisted PrinterDetails the app writes itself;
 * `--all-saved-printers` then connects every entry. The runtime model detection is
 * authoritative either way (the emulated /detail pid decides the backend), so the
 * seeded printerModel string only needs to be plausible for connection display.
 */
const seedDataDir = async (
  dataDir: string,
  printers: readonly StandalonePrinter[],
  ip: string,
  port: number,
  password: string
): Promise<void> => {
  await mkdir(dataDir, { recursive: true });

  const nowIso = new Date().toISOString();
  const entries: Record<string, Record<string, unknown>> = {};
  for (const printer of printers) {
    entries[printer.serial] = {
      Name: printer.machineName,
      IPAddress: ip,
      SerialNumber: printer.serial,
      CheckCode: printer.checkCode,
      ClientType: 'new',
      printerModel: modelToPrinterModel(printer.model),
      commandPort: printer.tcpPort,
      httpPort: printer.httpPort,
      webUIEnabled: true,
      lastConnected: nowIso,
    };
  }

  await writeFile(
    path.join(dataDir, 'printer_details.json'),
    `${JSON.stringify({ lastUsedPrinterSerial: printers[0]?.serial ?? null, printers: entries }, null, 2)}\n`,
    'utf-8'
  );

  // Deterministic auth config so the assertions never depend on whatever the current
  // DEFAULT_CONFIG happens to be. The CLI flags below override these too, but the
  // file keeps the run self-describing.
  await writeFile(
    path.join(dataDir, 'config.json'),
    `${JSON.stringify(
      {
        WebUIEnabled: true,
        WebUIPort: port,
        WebUIPassword: password,
        WebUIPasswordRequired: true,
      },
      null,
      2
    )}\n`,
    'utf-8'
  );
};

interface ServerProcess {
  child: ChildProcessByStdio<null, Readable, Readable>;
  logLines: string[];
}

/**
 * Launches the built server exactly as a headless user would.
 *
 * Detached on POSIX so signalling the parent takes the whole tree; on Windows
 * stopProcessTree uses `taskkill /T`.
 */
const spawnServer = (params: {
  dataDir: string;
  port: number;
  password: string;
}): ServerProcess => {
  const logLines: string[] = [];

  const child = spawn(
    process.execPath,
    [
      'dist/index.js',
      '--all-saved-printers',
      `--webui-port=${params.port}`,
      `--webui-password=${params.password}`,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATA_DIR: params.dataDir },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    }
  ) as ChildProcessByStdio<null, Readable, Readable>;

  const record = (line: string): void => {
    logLines.push(line);
    if (logLines.length > 400) {
      logLines.shift();
    }
  };

  readline.createInterface({ input: child.stdout }).on('line', record);
  readline
    .createInterface({ input: child.stderr })
    .on('line', (line) => record(`[stderr] ${line}`));

  return { child, logLines };
};

const formatLogTail = (logLines: readonly string[]): string =>
  logLines.slice(-LOG_TAIL_LINES).join('\n') || '(no output captured)';

/** Resolves once the server's own HTTP API answers, or throws with the server's log. */
const waitForServer = async (
  baseUrl: string,
  server: ServerProcess,
  timeoutMs: number
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(
        `FlashForgeWebUI exited with code ${server.child.exitCode} before the server started.\n` +
          `Server output:\n${formatLogTail(server.logLines)}`
      );
    }

    try {
      const response = await fetch(`${baseUrl}/api/auth/status`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not listening yet.
    }

    await sleep(READY_POLL_INTERVAL_MS);
  }

  throw new Error(
    `WebUI server did not start within ${timeoutMs}ms.\nServer output:\n${formatLogTail(server.logLines)}`
  );
};

/**
 * Waits until the server reports the expected number of connected printers.
 *
 * Uses the real /api/contexts endpoint, which means the wait also proves the printers
 * actually connected rather than merely that the HTTP server bound its port.
 */
const waitForPrinters = async (
  baseUrl: string,
  token: string,
  expected: number,
  server: ServerProcess,
  timeoutMs: number
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let lastSeen = 0;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/contexts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const payload = (await response.json()) as { contexts?: unknown[] };
        lastSeen = payload.contexts?.length ?? 0;
        if (lastSeen >= expected) {
          return;
        }
      }
    } catch {
      // Transient while the server finishes connecting.
    }

    await sleep(READY_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Expected ${expected} connected printer(s) but the server reported ${lastSeen} after ${timeoutMs}ms.\n` +
      `Server output:\n${formatLogTail(server.logLines)}`
  );
};

/** Logs in through the real auth route to obtain a token for readiness polling. */
const login = async (baseUrl: string, password: string): Promise<string> => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  const payload = (await response.json()) as {
    success?: boolean;
    token?: string;
    message?: string;
  };
  if (!payload.success || !payload.token) {
    throw new Error(`Harness could not log into the WebUI: ${payload.message ?? response.status}`);
  }

  return payload.token;
};

export const startStandaloneWebUI = async (
  options: StartStandaloneWebUIOptions = {}
): Promise<StandaloneWebUI> => {
  const printers = options.printers ?? DEFAULT_STANDALONE_PRINTERS;
  const seedPrinters = options.seedPrinters ?? printers;
  const password = options.password ?? WEBUI_TEST_PASSWORD;
  const requiredPrinters = options.requireConnectedPrinters ?? seedPrinters.length;

  const emulators: Array<{ stop: () => Promise<void> }> = [];
  let dataRoot: string | null = null;
  let server: ServerProcess | null = null;

  const cleanup = async (): Promise<void> => {
    if (server) {
      await stopProcessTree(server.child);
    }
    for (const emulator of emulators.reverse()) {
      await emulator.stop();
    }
    if (dataRoot) {
      await rm(dataRoot, { recursive: true, force: true });
    }
  };

  try {
    let printerIp = '127.0.0.1';
    for (const printer of printers) {
      const instance = await startEmulatorInstance({
        instance: {
          instanceId: `webui-${printer.serial.toLowerCase()}`,
          model: printer.model,
          serial: printer.serial,
          checkCode: printer.checkCode,
          machineName: printer.machineName,
          tcpPort: printer.tcpPort,
          httpPort: printer.httpPort,
          discoveryEnabled: true,
          simulationMode: 'manual',
          simulationSpeed: 100,
        },
      });
      emulators.push(instance);

      const ready = instance.readyPayloads[0];
      if (!ready) {
        throw new Error(`Emulator "${printer.label}" never reported ready`);
      }
      printerIp = ready.ip;
    }

    dataRoot = await mkdtemp(path.join(os.tmpdir(), 'ffwebui-e2e-'));
    const dataDir = path.join(dataRoot, 'data');

    const port = await findFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;

    await seedDataDir(dataDir, seedPrinters, printerIp, port, password);

    server = spawnServer({ dataDir, port, password });
    await waitForServer(baseUrl, server, SERVER_READY_TIMEOUT_MS);

    const token = await login(baseUrl, password);
    await waitForPrinters(baseUrl, token, requiredPrinters, server, PRINTER_READY_TIMEOUT_MS);

    const startedServer = server;
    return {
      baseUrl,
      password,
      printers: seedPrinters,
      logTail: () => formatLogTail(startedServer.logLines),
      stop: cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
};
