/**
 * @fileoverview E2E coverage for estimate-based Spoolman consumption tracking
 * on material-station printers (GitHub issue #21).
 *
 * Runs against the local flashforge-emulator-v2 checkout plus its Spoolman
 * mock sidecar (`npm run headless:spoolman`). CI clones the emulator at a
 * pinned version that predates the sidecar, so the whole suite skips with an
 * explanatory message when `scripts/headless/run-spoolman.ts` is absent.
 *
 * Scenarios:
 * - Creator 5 two-tool job: upload with mappings + per-filament 3mf fixture →
 *   complete → exactly two use_weight PUTs on the right spool ids with the
 *   hand-computed grams from the fixture.
 * - Cancel at a pinned 40% progress → PUTs equal 0.4 × estimates.
 * - Pause/resume mid-print → ledger stays empty; completion deducts in full.
 * - Untracked job (file staged directly on the printer, never uploaded
 *   through the app) → zero PUTs.
 * - Same two-tool completion on Creator 5 Pro and AD5X station profiles.
 * - 5M Pro regression: single-tool completion deducts exactly once on the
 *   active spool via the unchanged single-spool path.
 *
 * Expected amounts are hand-computed from the fixture constants below and
 * never derived from the sidecar's own math (tolerance ±0.05 g).
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  fetchApiToken,
  postJson,
  postRaw,
  readEmulatorDetail,
  resolveContextId,
} from './helpers/api';
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

/** Fixture per-filament estimates (grams) — mirrors slice_info.config. */
const TOOL_0_G = 11.28;
const TOOL_1_G = 8.64;

/** Gram tolerance for hand-computed expectations. */
const G_TOLERANCE = 0.05;

/** WebUI polling cadence plus headroom; waits account for at least one cycle. */
const POLL_CYCLE_MS = 4500;

const FIXTURES_DIR = path.resolve('tests/fixtures/print-files');
const TWO_TOOL_FIXTURE = 'creator5-two-tool.3mf';
const SINGLE_TOOL_GCODE = 'adventurer5m-single-color.gcode';

/** Slot assignments used across the station scenarios. */
const SLOT_1_SPOOL = 1;
const SLOT_2_SPOOL = 2;

/** Emulator-reported filament weight at 100% (see PrinterStateStore default). */
const EMULATOR_FULL_WEIGHT_G = 96;

/** Printer-reported weight for the seeded stored single-material file (distinct from every default). */
const STORED_SINGLE_G = 130;

/** The 5M regression pins 50% progress, so the cached weight is half. */
const EMULATOR_HALF_WEIGHT_G = EMULATOR_FULL_WEIGHT_G * 0.5;

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

const emulatorControl = async (
  printer: StandalonePrinter,
  body: Record<string, unknown>
): Promise<void> => {
  const response = await fetch(`http://127.0.0.1:${printer.httpPort}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.ok).toBe(true);
  await response.body?.cancel();
};

const emulatorSimulate = async (
  printer: StandalonePrinter,
  body: Record<string, unknown>
): Promise<void> => {
  const response = await fetch(`http://127.0.0.1:${printer.httpPort}/__simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.ok).toBe(true);
  await response.body?.cancel();
};

const clearPlatform = async (printer: StandalonePrinter): Promise<void> => {
  await emulatorControl(printer, {
    serialNumber: printer.serial,
    checkCode: printer.checkCode,
    payload: { cmd: 'stateCtrl_cmd', args: { action: 'setClearPlatform' } },
  });
  await expect.poll(async () => emulatorStatus(printer), { timeout: 20_000 }).toBe('ready');
};

/** Two-tool mapping payload the Material Station UI would send. */
const TWO_TOOL_MAPPINGS = [
  {
    toolId: 0,
    slotId: 1,
    materialName: 'PLA',
    toolMaterialColor: '#808000',
    slotMaterialColor: '#808000',
  },
  {
    toolId: 1,
    slotId: 2,
    materialName: 'PLA',
    toolMaterialColor: '#FF0000',
    slotMaterialColor: '#FF0000',
  },
] as const;

// ============================================================================
// Creator 5 — core scenarios
// ============================================================================

test.describe('Spoolman station tracking (Creator 5)', () => {
  test.skip(!sidecarAvailable, SPOOLMAN_SIDECAR_SKIP_MESSAGE);
  test.describe.configure({ mode: 'serial' });

  const printer: StandalonePrinter = PRINTER_BY_MACHINE_NAME['Matrix-Creator5'];
  let sidecar: SpoolmanSidecar;
  let webui: StandaloneWebUI;
  let token = '';
  let contextId = '';

  test.beforeAll(async () => {
    sidecar = await startSpoolmanSidecar();
    webui = await startStandaloneWebUI({
      printers: [printer],
      configOverrides: {
        SpoolmanEnabled: true,
        SpoolmanServerUrl: sidecar.baseUrl,
        SpoolmanUpdateMode: 'weight',
      },
      // Auto simulation so the emulator can heat up and reach 'printing';
      // each scenario freezes progress with /__simulate pause + jump.
      emulatorSimulationMode: 'auto',
    });
    token = await fetchApiToken(webui);
    contextId = await resolveContextId(webui, token, printer.machineName);
  });

  test.afterAll(async () => {
    await webui?.stop();
    await sidecar?.stop();
  });

  const assignSlotSpool = async (slotId: number, spoolId: number): Promise<void> => {
    const { payload } = await postJson<{ success?: boolean; error?: string }>(
      webui,
      token,
      '/api/spoolman/slot-spool',
      { contextId, slotId, spoolId }
    );
    expect(payload.error).toBeUndefined();
  };

  const uploadAndStart = async (fixture: string): Promise<string> => {
    const { payload: stage } = await postRaw<StagePayload>(
      webui,
      token,
      `/api/jobs/upload/stage?contextId=${contextId}&filename=${encodeURIComponent(fixture)}`,
      await fs.readFile(path.join(FIXTURES_DIR, fixture))
    );
    expect(stage.error).toBeUndefined();
    expect(stage.uploadId).toBeDefined();

    const { payload: start } = await postJson<StartPayload>(
      webui,
      token,
      `/api/jobs/upload/start?contextId=${contextId}`,
      {
        uploadId: stage.uploadId,
        startNow: true,
        autoLevel: false,
        materialMappings: TWO_TOOL_MAPPINGS,
      }
    );
    expect(start.error).toBeUndefined();
    return start.fileName ?? fixture;
  };

  /** Wait until the job is actually printing, then freeze auto simulation. */
  const driveToPrinting = async (): Promise<void> => {
    // Re-arm auto simulation (a previous scenario may have frozen it) so the
    // emulator can finish heating and transition to printing.
    await emulatorSimulate(printer, { action: 'resume' });
    await expect.poll(async () => emulatorStatus(printer), { timeout: 60_000 }).toBe('printing');
    await emulatorSimulate(printer, { action: 'pause' });
  };

  const ledgerBySpool = async (): Promise<Map<number, number>> => {
    const requests = await sidecar.requests();
    const map = new Map<number, number>();
    for (const entry of requests) {
      map.set(entry.spoolId, entry.useWeight ?? 0);
    }
    return map;
  };

  test('two-tool job completion deducts full per-tool estimates on the right spools', async () => {
    await sidecar.reset();
    await assignSlotSpool(1, SLOT_1_SPOOL);
    await assignSlotSpool(2, SLOT_2_SPOOL);

    await uploadAndStart(TWO_TOOL_FIXTURE);
    await driveToPrinting();
    await emulatorSimulate(printer, { action: 'jump', percent: 100 });

    await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(2);

    const bySpool = await ledgerBySpool();
    expect(Math.abs((bySpool.get(SLOT_1_SPOOL) ?? 0) - TOOL_0_G)).toBeLessThanOrEqual(G_TOLERANCE);
    expect(Math.abs((bySpool.get(SLOT_2_SPOOL) ?? 0) - TOOL_1_G)).toBeLessThanOrEqual(G_TOLERANCE);
    // Weight mode never sends lengths.
    expect((await sidecar.requests()).every((entry) => entry.useLength === null)).toBe(true);

    await clearPlatform(printer);
  });

  test('cancel at 40% deducts 0.4 × estimates', async () => {
    await sidecar.reset();
    await assignSlotSpool(1, SLOT_1_SPOOL);
    await assignSlotSpool(2, SLOT_2_SPOOL);

    await uploadAndStart(TWO_TOOL_FIXTURE);
    await driveToPrinting();
    await emulatorSimulate(printer, { action: 'jump', percent: 40 });
    // Let the WebUI's polling cycle observe the 40% before cancelling so the
    // tracker's last-known progress is the value the UI shows.
    await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS));

    const { payload } = await postJson<{ success?: boolean; error?: string }>(
      webui,
      token,
      `/api/printer/control/cancel?contextId=${contextId}`,
      {}
    );
    expect(payload.error).toBeUndefined();

    await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(2);

    const bySpool = await ledgerBySpool();
    expect(Math.abs((bySpool.get(SLOT_1_SPOOL) ?? 0) - TOOL_0_G * 0.4)).toBeLessThanOrEqual(
      G_TOLERANCE
    );
    expect(Math.abs((bySpool.get(SLOT_2_SPOOL) ?? 0) - TOOL_1_G * 0.4)).toBeLessThanOrEqual(
      G_TOLERANCE
    );

    await clearPlatform(printer);
  });

  test('pause/resume deducts nothing; completion afterwards deducts in full', async () => {
    await sidecar.reset();
    await assignSlotSpool(1, SLOT_1_SPOOL);
    await assignSlotSpool(2, SLOT_2_SPOOL);

    await uploadAndStart(TWO_TOOL_FIXTURE);
    await driveToPrinting();
    await emulatorSimulate(printer, { action: 'jump', percent: 25 });

    const { payload: pausePayload } = await postJson<{ success?: boolean; error?: string }>(
      webui,
      token,
      `/api/printer/control/pause?contextId=${contextId}`,
      {}
    );
    expect(pausePayload.error).toBeUndefined();
    await expect.poll(async () => emulatorStatus(printer), { timeout: 20_000 }).toBe('paused');

    const { payload: resumePayload } = await postJson<{ success?: boolean; error?: string }>(
      webui,
      token,
      `/api/printer/control/resume?contextId=${contextId}`,
      {}
    );
    expect(resumePayload.error).toBeUndefined();
    await expect.poll(async () => emulatorStatus(printer), { timeout: 20_000 }).toBe('printing');

    // The full pause/resume cycle must leave the ledger untouched.
    await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS));
    expect(await sidecar.requests()).toHaveLength(0);

    await emulatorSimulate(printer, { action: 'jump', percent: 100 });
    await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(2);

    const bySpool = await ledgerBySpool();
    expect(Math.abs((bySpool.get(SLOT_1_SPOOL) ?? 0) - TOOL_0_G)).toBeLessThanOrEqual(G_TOLERANCE);
    expect(Math.abs((bySpool.get(SLOT_2_SPOOL) ?? 0) - TOOL_1_G)).toBeLessThanOrEqual(G_TOLERANCE);

    await clearPlatform(printer);
  });

  test('job staged directly on the printer (untracked) deducts nothing', async () => {
    await sidecar.reset();
    expect(await sidecar.requests()).toHaveLength(0);

    // Upload straight to the emulator, bypassing the WebUI entirely.
    const bytes = await fs.readFile(path.join(FIXTURES_DIR, TWO_TOOL_FIXTURE));
    const form = new FormData();
    form.append('gcodeFile', new Blob([new Uint8Array(bytes)]), 'untracked-job.3mf');
    const upload = await fetch(`http://127.0.0.1:${printer.httpPort}/uploadGcode`, {
      method: 'POST',
      headers: {
        SerialNumber: printer.serial,
        CheckCode: printer.checkCode,
      },
      body: form,
    });
    expect(upload.ok).toBe(true);
    await upload.body?.cancel();

    const start = await fetch(`http://127.0.0.1:${printer.httpPort}/printGcode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serialNumber: printer.serial,
        checkCode: printer.checkCode,
        fileName: 'untracked-job.3mf',
        levelingBeforePrint: false,
      }),
    });
    expect(start.ok).toBe(true);
    const startBody = (await start.json()) as { code?: number; message?: string };
    expect(startBody.code).toBe(0);

    await driveToPrinting();
    await emulatorSimulate(printer, { action: 'jump', percent: 100 });

    // Give the terminal event + polling cycle ample time, then assert empty.
    await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS * 2));
    expect(await sidecar.requests()).toHaveLength(0);

    await clearPlatform(printer);
  });
});

// ============================================================================
// Other station profiles — gating parity for the estimate-based path
// ============================================================================

test.describe('Spoolman station tracking (Creator 5 Pro + AD5X)', () => {
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
    sidecar = await startSpoolmanSidecar();
    webui = await startStandaloneWebUI({
      printers,
      configOverrides: {
        SpoolmanEnabled: true,
        SpoolmanServerUrl: sidecar.baseUrl,
        SpoolmanUpdateMode: 'weight',
      },
      emulatorSimulationMode: 'auto',
    });
    token = await fetchApiToken(webui);
  });

  test.afterAll(async () => {
    await webui?.stop();
    await sidecar?.stop();
  });

  for (const printer of printers) {
    test(`two-tool completion deducts both spools (${printer.label})`, async () => {
      await sidecar.reset();
      const contextId = await resolveContextId(webui, token, printer.machineName);

      for (const [slotId, spoolId] of [
        [1, SLOT_1_SPOOL],
        [2, SLOT_2_SPOOL],
      ] as const) {
        const { payload } = await postJson<{ success?: boolean; error?: string }>(
          webui,
          token,
          '/api/spoolman/slot-spool',
          { contextId, slotId, spoolId }
        );
        expect(payload.error).toBeUndefined();
      }

      const { payload: stage } = await postRaw<StagePayload>(
        webui,
        token,
        `/api/jobs/upload/stage?contextId=${contextId}&filename=${encodeURIComponent(TWO_TOOL_FIXTURE)}`,
        await fs.readFile(path.join(FIXTURES_DIR, TWO_TOOL_FIXTURE))
      );
      expect(stage.error).toBeUndefined();
      const { payload: start } = await postJson<StartPayload>(
        webui,
        token,
        `/api/jobs/upload/start?contextId=${contextId}`,
        {
          uploadId: stage.uploadId,
          startNow: true,
          autoLevel: false,
          materialMappings: TWO_TOOL_MAPPINGS,
        }
      );
      expect(start.error).toBeUndefined();

      await expect.poll(async () => emulatorStatus(printer), { timeout: 60_000 }).toBe('printing');
      await emulatorSimulate(printer, { action: 'pause' });
      await emulatorSimulate(printer, { action: 'jump', percent: 100 });

      await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(2);
      const requests = await sidecar.requests();
      const bySpool = new Map<number, number>();
      for (const entry of requests) {
        bySpool.set(entry.spoolId, entry.useWeight ?? 0);
      }
      expect(Math.abs((bySpool.get(SLOT_1_SPOOL) ?? 0) - TOOL_0_G)).toBeLessThanOrEqual(
        G_TOLERANCE
      );
      expect(Math.abs((bySpool.get(SLOT_2_SPOOL) ?? 0) - TOOL_1_G)).toBeLessThanOrEqual(
        G_TOLERANCE
      );

      await clearPlatform(printer);
    });
  }
});

// ============================================================================
// AD5X stored files — printer-metadata estimate capture (no app upload)
// ============================================================================

test.describe('Spoolman printer-metadata tracking (AD5X stored files)', () => {
  test.skip(!sidecarAvailable, SPOOLMAN_SIDECAR_SKIP_MESSAGE);
  test.describe.configure({ mode: 'serial' });

  const printer: StandalonePrinter = PRINTER_BY_MACHINE_NAME['Matrix-AD5X'];
  let sidecar: SpoolmanSidecar;
  let webui: StandaloneWebUI;
  let token = '';
  let contextId = '';

  test.beforeAll(async () => {
    sidecar = await startSpoolmanSidecar();
    webui = await startStandaloneWebUI({
      printers: [printer],
      configOverrides: {
        SpoolmanEnabled: true,
        SpoolmanServerUrl: sidecar.baseUrl,
        SpoolmanUpdateMode: 'weight',
      },
      emulatorSimulationMode: 'auto',
    });
    token = await fetchApiToken(webui);
    contextId = await resolveContextId(webui, token, printer.machineName);
  });

  test.afterAll(async () => {
    await webui?.stop();
    await sidecar?.stop();
  });

  const assignSlotSpool = async (slotId: number, spoolId: number | null): Promise<void> => {
    const { payload } = await postJson<{ success?: boolean; error?: string }>(
      webui,
      token,
      '/api/spoolman/slot-spool',
      { contextId, slotId, spoolId }
    );
    expect(payload.error).toBeUndefined();
  };

  /** Start a stored (printer-resident) file through the app's job-start route. */
  const startStoredJobViaApp = async (fileName: string): Promise<void> => {
    const { payload } = await postJson<{ success?: boolean; error?: string }>(
      webui,
      token,
      `/api/jobs/start?contextId=${contextId}`,
      { filename: fileName, startNow: true, leveling: false }
    );
    expect(payload.error).toBeUndefined();
    expect(payload.success).toBe(true);
  };

  /**
   * Seed a printer-resident file exactly like the emulator would report it in
   * gcodeListDetail (GcodeFileEntry metadata), without any app upload.
   */
  const seedStoredFile = async (
    fileName: string,
    metadata: { gcodeToolCnt: number; totalFilamentWeight: number; useMatlStation: boolean }
  ): Promise<void> => {
    const response = await fetch(`http://127.0.0.1:${printer.httpPort}/__scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario: {
          machineStatus: 'idle',
          fileName,
          currentFileMetadata: metadata,
        },
      }),
    });
    expect(response.ok).toBe(true);
  };

  /** Drive a running print to completion and let the WebUI observe it. */
  const driveToPrinting = async (): Promise<void> => {
    // Re-arm auto simulation so the emulator can finish heating and reach
    // 'printing', then freeze progress for deterministic jumps.
    await emulatorSimulate(printer, { action: 'resume' });
    await expect.poll(async () => emulatorStatus(printer), { timeout: 60_000 }).toBe('printing');
    await emulatorSimulate(printer, { action: 'pause' });
  };

  const completePrint = async (): Promise<void> => {
    await emulatorSimulate(printer, { action: 'jump', percent: 100 });
    await expect
      .poll(async () => emulatorStatus(printer), { timeout: 30_000 })
      .toBe('completed');
    // One polling cycle of headroom so the tracker reacts to the terminal state.
    await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS));
  };

  test('single-material stored file started through the app deducts the printer-reported weight exactly once', async () => {
    await sidecar.reset();
    await clearPlatform(printer);
    await seedStoredFile('stored-single.3mf', {
      gcodeToolCnt: 1,
      totalFilamentWeight: STORED_SINGLE_G,
      useMatlStation: false,
    });
    await assignSlotSpool(1, SLOT_1_SPOOL);

    await startStoredJobViaApp('stored-single.3mf');
    await driveToPrinting();

    await completePrint();

    await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(1);
    const [put] = await sidecar.requests();
    expect(put?.spoolId).toBe(SLOT_1_SPOOL);
    expect(Math.abs((put?.useWeight ?? 0) - STORED_SINGLE_G)).toBeLessThanOrEqual(G_TOLERANCE);

    await clearPlatform(printer);
  });

  test('multi-material stored file is never tracked (no deduction)', async () => {
    await sidecar.reset();
    await clearPlatform(printer);
    await seedStoredFile('stored-multi.3mf', {
      gcodeToolCnt: 2,
      totalFilamentWeight: 110,
      useMatlStation: true,
    });
    await assignSlotSpool(1, SLOT_1_SPOOL);

    await startStoredJobViaApp('stored-multi.3mf');
    await driveToPrinting();

    await completePrint();

    expect(await sidecar.requests()).toHaveLength(0);
    await clearPlatform(printer);
  });

  test('no spool assigned skips the deduction', async () => {
    await sidecar.reset();
    await clearPlatform(printer);
    await seedStoredFile('stored-nospool.3mf', {
      gcodeToolCnt: 1,
      totalFilamentWeight: 140,
      useMatlStation: false,
    });
    await assignSlotSpool(1, null);
    await assignSlotSpool(2, null);

    await startStoredJobViaApp('stored-nospool.3mf');
    await driveToPrinting();

    await completePrint();

    expect(await sidecar.requests()).toHaveLength(0);
    await clearPlatform(printer);
  });

  test('two spools assigned skips the deduction (never guess)', async () => {
    await sidecar.reset();
    await clearPlatform(printer);
    await seedStoredFile('stored-twospools.3mf', {
      gcodeToolCnt: 1,
      totalFilamentWeight: 150,
      useMatlStation: false,
    });
    await assignSlotSpool(1, SLOT_1_SPOOL);
    await assignSlotSpool(2, SLOT_2_SPOOL);

    await startStoredJobViaApp('stored-twospools.3mf');
    await driveToPrinting();

    await completePrint();

    expect(await sidecar.requests()).toHaveLength(0);
    await clearPlatform(printer);
    // Leave the store clean for any later scenario.
    await assignSlotSpool(2, null);
  });
});

// ============================================================================
// 5M regression — single-spool path must stay behaviorally identical
// ============================================================================

test.describe('Spoolman single-tool regression (Adventurer 5M Pro)', () => {
  test.skip(!sidecarAvailable, SPOOLMAN_SIDECAR_SKIP_MESSAGE);
  test.describe.configure({ mode: 'serial' });

  const printer: StandalonePrinter = PRINTER_BY_MACHINE_NAME['Matrix-5MPro'];
  let sidecar: SpoolmanSidecar;
  let webui: StandaloneWebUI;
  let token = '';

  test.beforeAll(async () => {
    sidecar = await startSpoolmanSidecar();
    webui = await startStandaloneWebUI({
      printers: [printer],
      configOverrides: {
        SpoolmanEnabled: true,
        SpoolmanServerUrl: sidecar.baseUrl,
        SpoolmanUpdateMode: 'weight',
      },
      emulatorSimulationMode: 'auto',
    });
    token = await fetchApiToken(webui);
  });

  test.afterAll(async () => {
    await webui?.stop();
    await sidecar?.stop();
  });

  test('single-tool completion deducts exactly once on the active spool', async () => {
    await sidecar.reset();
    const contextId = await resolveContextId(webui, token, printer.machineName);

    // The legacy flow: one active spool for the whole context.
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
    const { payload: start } = await postJson<StartPayload>(
      webui,
      token,
      `/api/jobs/upload/start?contextId=${contextId}`,
      {
        uploadId: stage.uploadId,
        startNow: true,
        autoLevel: false,
      }
    );
    expect(start.error).toBeUndefined();

    await expect.poll(async () => emulatorStatus(printer), { timeout: 60_000 }).toBe('printing');
    await emulatorSimulate(printer, { action: 'pause' });
    // Pin a known progress so the dual-API backend's filament-usage cache
    // captures a deterministic value (it snapshots EstWeight = 96 g × progress
    // while printing and reuses the cache at completion).
    await emulatorSimulate(printer, { action: 'jump', percent: 50 });
    await new Promise((resolve) => setTimeout(resolve, POLL_CYCLE_MS));
    await emulatorSimulate(printer, { action: 'jump', percent: 100 });

    // The single-spool tracker PUTs the cached printer-reported weight
    // (96 g × 50%) exactly once on the selected spool.
    await expect.poll(async () => (await sidecar.requests()).length, { timeout: 30_000 }).toBe(1);
    const requests = await sidecar.requests();
    expect(requests[0]?.spoolId).toBe(3);
    const useWeight = requests[0]?.useWeight ?? 0;
    if (Math.abs(useWeight - EMULATOR_HALF_WEIGHT_G) > G_TOLERANCE) {
      throw new Error(
        `unexpected use_weight ${String(useWeight)}; server log:\n${webui.logTail()}`
      );
    }
    expect(Math.abs(useWeight - EMULATOR_HALF_WEIGHT_G)).toBeLessThanOrEqual(G_TOLERANCE);
  });
});
