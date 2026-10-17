/**
 * @fileoverview E2E coverage for per-job Spoolman tracking on material-station
 * printers (GitHub issue #21).
 *
 * Runs against the local flashforge-emulator-v2 checkout plus its Spoolman
 * mock sidecar (`npm run headless:spoolman`). CI clones the emulator at a
 * pinned version that may predate the sidecar, so the whole suite skips with
 * an explanatory message when `scripts/headless/run-spoolman.ts` is absent.
 *
 * The user picks a spool for each tool in the matching dialog; the choice
 * belongs to that one print. Scenarios:
 * - Completion charges each chosen spool its full slicer estimate.
 * - Cancel at 40% and at 75% charges each tool from the per-tool usage curve
 *   of the fixture's gcode (tool 0 prints the first half, tool 2 the second).
 * - Pause/resume charges nothing; completion afterwards charges in full.
 * - "Do not track" for a tool, no spool choices at all, and a file sent
 *   without Start Now all leave those tools uncharged.
 * - A reprint of a tracked file started on the printer itself charges
 *   nothing: the spool choice ended with the first print.
 * - The panel data shows the tracked job while it prints.
 * - Same completion on the Creator 5 Pro and AD5X; AD5X stored-file starts
 *   through the matching dialog are charged from the printer's per-tool data.
 * - 5M Pro regression: the single-spool flow is unchanged.
 *
 * Expected amounts come from two-tool-toolchange.expected.json, which the
 * fixture generator computes independently of the app (tolerance ±0.05 g).
 */

import * as fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import { fetchApiToken, postJson, postRaw, readEmulatorDetail, resolveContextId } from './helpers/api';
import {
  type StandalonePrinter,
  type StandaloneWebUI,
  startStandaloneWebUI,
} from './helpers/standalone-server';
import { PRINTER_BY_MACHINE_NAME } from './helpers/targets';
import {
  type SpoolmanSidecar,
  SPOOLMAN_SIDECAR_SKIP_MESSAGE,
  isSpoolmanSidecarAvailable,
  startSpoolmanSidecar,
} from './helpers/spoolman-sidecar';

const FIXTURES_DIR = path.resolve('tests/fixtures/print-files');
const TWO_TOOL_FIXTURE = 'two-tool-toolchange.3mf';
const SINGLE_TOOL_GCODE = 'adventurer5m-single-color.gcode';

interface ExpectedTool {
  usedG: number;
  gramsAt40: number;
  gramsAt75: number;
}
const EXPECTED = JSON.parse(
  readFileSync(path.join(FIXTURES_DIR, 'two-tool-toolchange.expected.json'), 'utf8')
) as { tools: Record<'0' | '2', ExpectedTool> };
const TOOL_0 = EXPECTED.tools['0'];
const TOOL_2 = EXPECTED.tools['2'];

/** Gram tolerance for fixture-computed expectations. */
const G_TOLERANCE = 0.05;

/** WebUI polling cadence plus headroom; waits account for at least one cycle. */
const POLL_CYCLE_MS = 4500;

/** Spools chosen for the two tools across the station scenarios. */
const SPOOL_A = 1;
const SPOOL_B = 2;

/** The 5M regression pins 50% progress, so the cached weight is half of 96 g. */
const EMULATOR_HALF_WEIGHT_G = 48;

/** Tool→slot mapping the matching dialog sends: filaments 1 and 3 print with T0 and T2. */
const MAPPINGS = [
  { toolId: 0, slotId: 1, materialName: 'PLA', toolMaterialColor: '#4DA3FF', slotMaterialColor: '#4DA3FF' },
  { toolId: 2, slotId: 2, materialName: 'PETG', toolMaterialColor: '#FF8A3D', slotMaterialColor: '#FF8A3D' },
] as const;

const BOTH_SPOOLS = [
  { toolId: 0, spoolId: SPOOL_A },
  { toolId: 2, spoolId: SPOOL_B },
];

interface StagePayload {
  success?: boolean;
  uploadId?: string;
  error?: string;
}

interface StartPayload {
  success?: boolean;
  fileName?: string;
  error?: string;
}

const sidecarAvailable = isSpoolmanSidecarAvailable();

const emulatorStatus = async (printer: StandalonePrinter): Promise<string> => {
  return (await readEmulatorDetail(printer)).status?.toLowerCase() ?? '';
};

const emulatorPost = async (
  printer: StandalonePrinter,
  route: string,
  body: Record<string, unknown>
): Promise<void> => {
  const response = await fetch(`http://127.0.0.1:${printer.httpPort}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.ok).toBe(true);
  await response.body?.cancel();
};

const emulatorSimulate = (printer: StandalonePrinter, body: Record<string, unknown>) =>
  emulatorPost(printer, '/__simulate', body);

const clearPlatform = async (printer: StandalonePrinter): Promise<void> => {
  await emulatorPost(printer, '/control', {
    serialNumber: printer.serial,
    checkCode: printer.checkCode,
    payload: { cmd: 'stateCtrl_cmd', args: { action: 'setClearPlatform' } },
  });
  await expect.poll(async () => emulatorStatus(printer), { timeout: 20_000 }).toBe('ready');
};

/**
 * Wait until the job is actually printing, freeze auto simulation, and let
 * one WebUI poll cycle pass so the tracker sees the job start. A real print
 * lasts far longer than one poll; the emulator's jumps do not.
 */
const driveToPrinting = async (printer: StandalonePrinter): Promise<void> => {
  await emulatorSimulate(printer, { action: 'resume' });
  await expect.poll(async () => emulatorStatus(printer), { timeout: 60_000 }).toBe('printing');
  await emulatorSimulate(printer, { action: 'pause' });
  await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS));
};

/** Start a file already on the printer directly, bypassing the WebUI. */
const startOnPrinter = async (printer: StandalonePrinter, fileName: string): Promise<void> => {
  const start = await fetch(`http://127.0.0.1:${printer.httpPort}/printGcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serialNumber: printer.serial,
      checkCode: printer.checkCode,
      fileName,
      levelingBeforePrint: false,
    }),
  });
  expect(start.ok).toBe(true);
  expect(((await start.json()) as { code?: number }).code).toBe(0);
};

const chargesBySpool = async (sidecar: SpoolmanSidecar): Promise<Map<number, number>> => {
  const map = new Map<number, number>();
  for (const entry of await sidecar.requests()) {
    map.set(entry.spoolId, (map.get(entry.spoolId) ?? 0) + (entry.useWeight ?? 0));
  }
  return map;
};

const expectCharge = (charges: Map<number, number>, spoolId: number, grams: number): void => {
  const charged = charges.get(spoolId) ?? 0;
  expect(Math.abs(charged - grams), `spool ${spoolId}: charged ${charged} g, expected ${grams} g`).toBeLessThanOrEqual(
    G_TOLERANCE
  );
};

/** Upload a fixture through the WebUI with the given matching-dialog choices. */
const uploadThroughApp = async (
  webui: StandaloneWebUI,
  token: string,
  contextId: string,
  options: {
    fixture?: string;
    startNow?: boolean;
    spoolAssignments?: ReadonlyArray<{ toolId: number; spoolId: number | null }>;
    mappings?: ReadonlyArray<(typeof MAPPINGS)[number]>;
  } = {}
): Promise<string> => {
  const fixture = options.fixture ?? TWO_TOOL_FIXTURE;
  const { payload: stage } = await postRaw<StagePayload>(
    webui,
    token,
    `/api/jobs/upload/stage?contextId=${contextId}&filename=${encodeURIComponent(fixture)}`,
    await fs.readFile(path.join(FIXTURES_DIR, fixture))
  );
  expect(stage.error).toBeUndefined();

  const { payload: start } = await postJson<StartPayload>(webui, token, `/api/jobs/upload/start?contextId=${contextId}`, {
    uploadId: stage.uploadId,
    startNow: options.startNow ?? true,
    autoLevel: false,
    materialMappings: options.mappings ?? MAPPINGS,
    spoolAssignments: options.spoolAssignments,
  });
  expect(start.error).toBeUndefined();
  return start.fileName ?? fixture;
};

const startSuite = async (printers: StandalonePrinter[]) => {
  const sidecar = await startSpoolmanSidecar();
  const webui = await startStandaloneWebUI({
    printers,
    configOverrides: {
      SpoolmanEnabled: true,
      SpoolmanServerUrl: sidecar.baseUrl,
      SpoolmanUpdateMode: 'weight',
    },
    // Auto simulation so the emulator can heat up and reach 'printing';
    // each scenario freezes progress with /__simulate pause + jump.
    emulatorSimulationMode: 'auto',
  });
  const token = await fetchApiToken(webui);
  return { sidecar, webui, token };
};

// ============================================================================
// Creator 5 — core scenarios
// ============================================================================

test.describe('Spoolman per-job tracking (Creator 5)', () => {
  test.skip(!sidecarAvailable, SPOOLMAN_SIDECAR_SKIP_MESSAGE);
  test.describe.configure({ mode: 'serial' });

  const printer: StandalonePrinter = PRINTER_BY_MACHINE_NAME['Matrix-Creator5'];
  let sidecar: SpoolmanSidecar;
  let webui: StandaloneWebUI;
  let token = '';
  let contextId = '';

  test.beforeAll(async () => {
    ({ sidecar, webui, token } = await startSuite([printer]));
    contextId = await resolveContextId(webui, token, printer.machineName);
  });

  test.afterAll(async () => {
    await webui?.stop();
    await sidecar?.stop();
  });

  const upload = (options: Parameters<typeof uploadThroughApp>[3] = {}) =>
    uploadThroughApp(webui, token, contextId, options);

  const readStation = async () => {
    const response = await fetch(`${webui.baseUrl}/api/spoolman/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return ((await response.json()) as {
      station?: { activeJob: { fileName: string; tools: Array<{ spoolId: number }> } | null };
    }).station;
  };

  test('completion charges each chosen spool its full estimate', async () => {
    await sidecar.reset();
    await upload({ spoolAssignments: BOTH_SPOOLS });
    await driveToPrinting(printer);

    const station = await readStation();
    expect(station?.activeJob?.fileName).toBe(TWO_TOOL_FIXTURE);
    expect(station?.activeJob?.tools.map((tool) => tool.spoolId)).toEqual([SPOOL_A, SPOOL_B]);

    await emulatorSimulate(printer, { action: 'jump', percent: 100 });
    await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(2);

    const charges = await chargesBySpool(sidecar);
    expectCharge(charges, SPOOL_A, TOOL_0.usedG);
    expectCharge(charges, SPOOL_B, TOOL_2.usedG);
    expect((await sidecar.requests()).every((entry) => entry.useLength === null)).toBe(true);
    await expect.poll(async () => (await readStation())?.activeJob ?? null).toBeNull();

    await clearPlatform(printer);
  });

  for (const percent of [40, 75] as const) {
    test(`cancel at ${percent}% charges each tool from its own usage curve`, async () => {
      await sidecar.reset();
      await upload({ spoolAssignments: BOTH_SPOOLS });
      await driveToPrinting(printer);
      await emulatorSimulate(printer, { action: 'jump', percent });
      // Let the WebUI's polling cycle observe the progress before cancelling.
      await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS));

      const { payload } = await postJson<{ error?: string }>(
        webui,
        token,
        `/api/printer/control/cancel?contextId=${contextId}`,
        {}
      );
      expect(payload.error).toBeUndefined();

      const expectedTool0 = percent === 40 ? TOOL_0.gramsAt40 : TOOL_0.gramsAt75;
      const expectedTool2 = percent === 40 ? TOOL_2.gramsAt40 : TOOL_2.gramsAt75;
      const expectedRequests = [expectedTool0, expectedTool2].filter((grams) => grams > 0).length;
      await expect
        .poll(async () => (await sidecar.requests()).length, { timeout: 30_000 })
        .toBe(expectedRequests);
      await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS));
      expect(await sidecar.requests()).toHaveLength(expectedRequests);

      const charges = await chargesBySpool(sidecar);
      expectCharge(charges, SPOOL_A, expectedTool0);
      expectCharge(charges, SPOOL_B, expectedTool2);

      await clearPlatform(printer);
    });
  }

  test('pause and resume charge nothing; completion afterwards charges in full', async () => {
    await sidecar.reset();
    await upload({ spoolAssignments: BOTH_SPOOLS });
    await driveToPrinting(printer);
    await emulatorSimulate(printer, { action: 'jump', percent: 25 });

    const { payload: pausePayload } = await postJson<{ error?: string }>(
      webui,
      token,
      `/api/printer/control/pause?contextId=${contextId}`,
      {}
    );
    expect(pausePayload.error).toBeUndefined();
    await expect.poll(async () => emulatorStatus(printer), { timeout: 20_000 }).toBe('paused');

    const { payload: resumePayload } = await postJson<{ error?: string }>(
      webui,
      token,
      `/api/printer/control/resume?contextId=${contextId}`,
      {}
    );
    expect(resumePayload.error).toBeUndefined();
    await expect.poll(async () => emulatorStatus(printer), { timeout: 20_000 }).toBe('printing');

    await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS));
    expect(await sidecar.requests()).toHaveLength(0);

    await emulatorSimulate(printer, { action: 'jump', percent: 100 });
    await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(2);
    const charges = await chargesBySpool(sidecar);
    expectCharge(charges, SPOOL_A, TOOL_0.usedG);
    expectCharge(charges, SPOOL_B, TOOL_2.usedG);

    await clearPlatform(printer);
  });

  test('"Do not track" leaves that tool uncharged', async () => {
    await sidecar.reset();
    await upload({
      spoolAssignments: [
        { toolId: 0, spoolId: SPOOL_A },
        { toolId: 2, spoolId: null },
      ],
    });
    await driveToPrinting(printer);
    await emulatorSimulate(printer, { action: 'jump', percent: 100 });

    await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(1);
    expectCharge(await chargesBySpool(sidecar), SPOOL_A, TOOL_0.usedG);

    await clearPlatform(printer);
  });

  test('an upload without spool choices is not tracked', async () => {
    await sidecar.reset();
    await upload({ spoolAssignments: undefined });
    await driveToPrinting(printer);
    await emulatorSimulate(printer, { action: 'jump', percent: 100 });

    await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS * 2));
    expect(await sidecar.requests()).toHaveLength(0);

    await clearPlatform(printer);
  });

  test('a file sent without Start Now and started on the printer is not tracked', async () => {
    await sidecar.reset();
    const fileName = await upload({ spoolAssignments: BOTH_SPOOLS, startNow: false });
    await startOnPrinter(printer, fileName);
    await driveToPrinting(printer);
    await emulatorSimulate(printer, { action: 'jump', percent: 100 });

    await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS * 2));
    expect(await sidecar.requests()).toHaveLength(0);

    await clearPlatform(printer);
  });

  test('a reprint of a tracked file started on the printer charges nothing', async () => {
    await sidecar.reset();
    const fileName = await upload({ spoolAssignments: BOTH_SPOOLS });
    await driveToPrinting(printer);
    await emulatorSimulate(printer, { action: 'jump', percent: 100 });
    await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(2);
    await clearPlatform(printer);

    await sidecar.reset();
    await startOnPrinter(printer, fileName);
    await driveToPrinting(printer);
    await emulatorSimulate(printer, { action: 'jump', percent: 100 });

    await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS * 2));
    expect(await sidecar.requests()).toHaveLength(0);

    await clearPlatform(printer);
  });
});

// ============================================================================
// Other station profiles
// ============================================================================

test.describe('Spoolman per-job tracking (Creator 5 Pro + AD5X)', () => {
  test.skip(!sidecarAvailable, SPOOLMAN_SIDECAR_SKIP_MESSAGE);
  test.describe.configure({ mode: 'serial' });

  const printers: StandalonePrinter[] = [
    PRINTER_BY_MACHINE_NAME['Matrix-Creator5Pro'],
    PRINTER_BY_MACHINE_NAME['Matrix-AD5X'],
  ];
  let sidecar: SpoolmanSidecar;
  let webui: StandaloneWebUI;
  let token = '';

  test.beforeAll(async () => {
    ({ sidecar, webui, token } = await startSuite(printers));
  });

  test.afterAll(async () => {
    await webui?.stop();
    await sidecar?.stop();
  });

  for (const printer of printers) {
    test(`two-tool completion charges both spools (${printer.label})`, async () => {
      await sidecar.reset();
      const contextId = await resolveContextId(webui, token, printer.machineName);
      await uploadThroughApp(webui, token, contextId, { spoolAssignments: BOTH_SPOOLS });

      await driveToPrinting(printer);
      await emulatorSimulate(printer, { action: 'jump', percent: 100 });

      await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(2);
      const charges = await chargesBySpool(sidecar);
      expectCharge(charges, SPOOL_A, TOOL_0.usedG);
      expectCharge(charges, SPOOL_B, TOOL_2.usedG);

      await clearPlatform(printer);
    });
  }
});

// ============================================================================
// AD5X stored files — started through the matching dialog
// ============================================================================

test.describe('Spoolman per-job tracking (AD5X stored files)', () => {
  test.skip(!sidecarAvailable, SPOOLMAN_SIDECAR_SKIP_MESSAGE);
  test.describe.configure({ mode: 'serial' });

  const printer: StandalonePrinter = PRINTER_BY_MACHINE_NAME['Matrix-AD5X'];
  let sidecar: SpoolmanSidecar;
  let webui: StandaloneWebUI;
  let token = '';
  let contextId = '';
  let storedFile = '';

  test.beforeAll(async () => {
    ({ sidecar, webui, token } = await startSuite([printer]));
    contextId = await resolveContextId(webui, token, printer.machineName);
    // Put the file on the printer without starting it. The emulator reports
    // the slicer's per-tool weights for it, as AD5X firmware does.
    storedFile = await uploadThroughApp(webui, token, contextId, { startNow: false });
  });

  test.afterAll(async () => {
    await webui?.stop();
    await sidecar?.stop();
  });

  const startStored = async (spoolAssignments?: ReadonlyArray<{ toolId: number; spoolId: number | null }>) => {
    const { payload } = await postJson<{ success?: boolean; error?: string }>(
      webui,
      token,
      `/api/jobs/start?contextId=${contextId}`,
      { filename: storedFile, startNow: true, leveling: false, materialMappings: MAPPINGS, spoolAssignments }
    );
    expect(payload.error).toBeUndefined();
    expect(payload.success).toBe(true);
  };

  test('completion charges the printer-reported weight of each tool', async () => {
    await sidecar.reset();
    await startStored(BOTH_SPOOLS);
    await driveToPrinting(printer);
    await emulatorSimulate(printer, { action: 'jump', percent: 100 });

    await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(2);
    const charges = await chargesBySpool(sidecar);
    expectCharge(charges, SPOOL_A, TOOL_0.usedG);
    expectCharge(charges, SPOOL_B, TOOL_2.usedG);

    await clearPlatform(printer);
  });

  test('cancel charges linearly by progress (no gcode on hand)', async () => {
    await sidecar.reset();
    await startStored(BOTH_SPOOLS);
    await driveToPrinting(printer);
    await emulatorSimulate(printer, { action: 'jump', percent: 40 });
    await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS));

    const { payload } = await postJson<{ error?: string }>(
      webui,
      token,
      `/api/printer/control/cancel?contextId=${contextId}`,
      {}
    );
    expect(payload.error).toBeUndefined();

    await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(2);
    const charges = await chargesBySpool(sidecar);
    expectCharge(charges, SPOOL_A, TOOL_0.usedG * 0.4);
    expectCharge(charges, SPOOL_B, TOOL_2.usedG * 0.4);

    await clearPlatform(printer);
  });

  test('a stored-file start without spool choices is not tracked', async () => {
    await sidecar.reset();
    await startStored(undefined);
    await driveToPrinting(printer);
    await emulatorSimulate(printer, { action: 'jump', percent: 100 });

    await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS * 2));
    expect(await sidecar.requests()).toHaveLength(0);

    await clearPlatform(printer);
  });
});

// ============================================================================
// 5M Pro — the single-spool flow is unchanged
// ============================================================================

test.describe('Spoolman single-tool regression (Adventurer 5M Pro)', () => {
  test.skip(!sidecarAvailable, SPOOLMAN_SIDECAR_SKIP_MESSAGE);
  test.describe.configure({ mode: 'serial' });

  const printer: StandalonePrinter = PRINTER_BY_MACHINE_NAME['Matrix-5MPro'];
  let sidecar: SpoolmanSidecar;
  let webui: StandaloneWebUI;
  let token = '';

  test.beforeAll(async () => {
    ({ sidecar, webui, token } = await startSuite([printer]));
  });

  test.afterAll(async () => {
    await webui?.stop();
    await sidecar?.stop();
  });

  test('single-tool completion deducts exactly once on the active spool', async () => {
    await sidecar.reset();
    const contextId = await resolveContextId(webui, token, printer.machineName);

    const { payload: select } = await postJson<{ success?: boolean; error?: string }>(
      webui,
      token,
      '/api/spoolman/select',
      { contextId, spoolId: 3 }
    );
    expect(select.error).toBeUndefined();

    const { payload: stage } = await postRaw<StagePayload>(
      webui,
      token,
      `/api/jobs/upload/stage?contextId=${contextId}&filename=${encodeURIComponent(SINGLE_TOOL_GCODE)}`,
      await fs.readFile(path.join(FIXTURES_DIR, SINGLE_TOOL_GCODE))
    );
    expect(stage.error).toBeUndefined();
    const { payload: start } = await postJson<StartPayload>(webui, token, `/api/jobs/upload/start?contextId=${contextId}`, {
      uploadId: stage.uploadId,
      startNow: true,
      autoLevel: false,
    });
    expect(start.error).toBeUndefined();

    await expect.poll(async () => emulatorStatus(printer), { timeout: 60_000 }).toBe('printing');
    await emulatorSimulate(printer, { action: 'pause' });
    // Pin a known progress so the dual-API backend's filament-usage cache
    // captures a deterministic value (96 g × progress while printing).
    await emulatorSimulate(printer, { action: 'jump', percent: 50 });
    await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS));
    await emulatorSimulate(printer, { action: 'jump', percent: 100 });

    await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(1);
    const requests = await sidecar.requests();
    expect(requests[0]?.spoolId).toBe(3);
    expect(Math.abs((requests[0]?.useWeight ?? 0) - EMULATOR_HALF_WEIGHT_G)).toBeLessThanOrEqual(G_TOLERANCE);
  });
});
