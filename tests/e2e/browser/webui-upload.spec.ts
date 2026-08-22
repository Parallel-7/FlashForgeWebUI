/**
 * @fileoverview Job upload coverage across every model, mirroring FlashForgeUI-Electron's
 * upload spec: an API-level three-call upload per model plus the browser-driven
 * dialog behaviour (material matching raised only where the printer has a station).
 *
 * This is the regression net for the alpha.10 hotfix class of bug: a confirm
 * handler that throws or silently skips the upload still leaves the dialog looking
 * successful - so every upload test confirms the file actually landed on the
 * printer (recent-jobs list = the printer's /gcodeList underneath) and that no
 * print started despite Start Now being unchecked.
 *
 * Material matching rules under test, identical to FlashForgeUI-Electron's:
 * - any 3MF + material-station printer (AD5X, Creator 5, Creator 5 Pro) -> dialog
 *   appears, mapping required, single tool included
 * - multi-filament file + 5M-series printer -> dialog must NOT appear
 *
 * Note the material-station capability comes from the test matrix, never from the
 * printer: stock Creator 5 firmware no longer reports the station in /detail, but
 * it still has one and still requires mappings on a fresh upload.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  fetchApiToken,
  openWithRememberedToken,
  postJson,
  postRaw,
  readEmulatorDetail,
  resolveContextId,
  switchPrinterInUi,
} from './helpers/api';
import {
  type StandalonePrinter,
  type StandaloneWebUI,
  startStandaloneWebUI,
} from './helpers/standalone-server';
import { MATRIX_PRINTERS, MODEL_TARGETS } from './helpers/targets';

interface StagePayload {
  success?: boolean;
  uploadId?: string;
  error?: string;
  requiresMaterialMatching?: boolean;
}

interface StartPayload {
  success?: boolean;
  started?: boolean;
  fileName?: string;
  error?: string;
}

interface FilesPayload {
  success?: boolean;
  files?: Array<{ fileName?: string; name?: string }>;
  error?: string;
}

const FIXTURES_DIR = path.resolve('tests/fixtures/print-files');
const GCODE_FIXTURE = 'adventurer5m-single-color.gcode';
const THREE_MF_FIXTURE = 'ad5x-single-tool.3mf';

/** Machine statuses that mean material is actively being laid down or prepared. */
const ACTIVE_PRINT_STATUSES: readonly string[] = [
  'printing',
  'heating',
  'calibrating',
  'pausing',
  'paused',
];

/**
 * Post-upload safety gate, mirroring FlashForgeUI-Electron's assertNotPrinting:
 * give the printer a moment to react (an auto-start would have begun by now),
 * then read the emulator's own /detail and fail loudly if a print ever started.
 * The emulator instance is torn down by the suite, so no recovery path is needed.
 */
const assertNotPrinting = async (printer: StandalonePrinter): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 5_000));

  const detail = await readEmulatorDetail(printer);
  const status = (detail.status ?? '').toLowerCase();
  const active = ACTIVE_PRINT_STATUSES.find((candidate) => status.includes(candidate));
  expect(
    active,
    `printer entered "${detail.status}" after an upload with Start Now unchecked`
  ).toBeUndefined();
};

test.describe('WebUI job upload', () => {
  let webui: StandaloneWebUI;
  let token: string;

  test.beforeAll(async () => {
    webui = await startStandaloneWebUI({ printers: MATRIX_PRINTERS });
    token = await fetchApiToken(webui);
  });

  test.afterAll(async () => {
    await webui?.stop();
  });

  const stageFile = async (contextId: string, fileName: string) => {
    const bytes = await readFile(path.join(FIXTURES_DIR, fileName));
    return await postRaw<StagePayload>(
      webui,
      token,
      `/api/jobs/upload/stage?contextId=${contextId}&filename=${encodeURIComponent(fileName)}`,
      bytes
    );
  };

  const fetchRecentJobs = async (contextId: string): Promise<FilesPayload> => {
    const response = await fetch(`${webui.baseUrl}/api/jobs/recent?contextId=${contextId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (await response.json()) as FilesPayload;
  };

  const expectFileOnPrinter = async (
    contextId: string,
    printer: StandalonePrinter,
    fixture: string
  ) => {
    await expect
      .poll(
        async () => {
          const recent = await fetchRecentJobs(contextId);
          return recent.files?.some((file) => (file.fileName ?? file.name) === fixture) ?? false;
        },
        { timeout: 15_000 }
      )
      .toBe(true);
    await assertNotPrinting(printer);
  };

  for (const target of MODEL_TARGETS) {
    const printer = target.printer;
    const fixture = target.hasMaterialStation ? THREE_MF_FIXTURE : GCODE_FIXTURE;

    test(`uploads a job file through the dialog on ${printer.machineName} without starting a print`, async ({
      page,
    }) => {
      await openWithRememberedToken(page, webui, token);
      await switchPrinterInUi(page, webui, token, printer.machineName);

      await page.click('#btn-upload-job');
      const modal = page.locator('#job-upload-modal');
      await expect(modal).toBeVisible();

      await page.locator('#job-upload-file-input').setInputFiles(path.join(FIXTURES_DIR, fixture));

      if (target.hasMaterialStation) {
        const matching = page.locator('#material-matching-modal');
        await expect(
          matching,
          'material-station printers must raise the matching dialog'
        ).toBeVisible();

        // One requirement row per filament the slicer recorded.
        await expect(matching.locator('.material-tool-item')).toHaveCount(1);

        // Assign the single tool to the first available loaded slot and confirm.
        await matching.locator('.material-tool-item[data-tool-id="0"]').click();
        await matching.locator('.material-slot-item:not(.empty):not(.disabled)').first().click();
        await expect(matching.locator('#material-matching-confirm')).toBeEnabled();
        await matching.locator('#material-matching-confirm').click();
      }

      await page.locator('#job-upload-start-now').uncheck();
      const okButton = page.locator('#job-upload-ok');
      await expect(okButton, 'OK should be enabled once the job is ready').toBeEnabled();
      await okButton.click();

      await expect(modal, 'the uploader must close once the upload finishes').toBeHidden({
        timeout: 30_000,
      });

      const contextId = await resolveContextId(webui, token, printer.machineName);
      await expectFileOnPrinter(contextId, printer, fixture);
    });

    test(`raises the material matching dialog on ${printer.machineName} only for a station printer`, async ({
      page,
    }) => {
      await openWithRememberedToken(page, webui, token);
      await switchPrinterInUi(page, webui, token, printer.machineName);

      await page.click('#btn-upload-job');
      const modal = page.locator('#job-upload-modal');
      await expect(modal).toBeVisible();

      // Same 3MF on every model: only station printers may raise matching.
      await page
        .locator('#job-upload-file-input')
        .setInputFiles(path.join(FIXTURES_DIR, THREE_MF_FIXTURE));

      const matching = page.locator('#material-matching-modal');
      if (target.hasMaterialStation) {
        await expect(
          matching,
          'AD5X / Creator 5 should raise the material matching dialog'
        ).toBeVisible();
        await expect(matching.locator('.material-tool-item')).toHaveCount(1);
        await matching.locator('#material-matching-cancel').click();
      } else {
        // 5M-series printers have no material station, so mapping tools to slots
        // is meaningless and the dialog must never appear. Bounded wait mirrors
        // FlashForgeUI-Electron's findOptional(10s).
        await page.waitForTimeout(10_000);
        await expect(
          matching,
          '5M-series printers should not raise the material matching dialog'
        ).toBeHidden();
      }

      await modal.locator('#job-upload-cancel').click();
      await expect(modal).toBeHidden();
    });
  }

  test('uploads through the API without starting a print (all models)', async () => {
    for (const target of MODEL_TARGETS) {
      const printer = target.printer;
      const fixture = target.hasMaterialStation ? THREE_MF_FIXTURE : GCODE_FIXTURE;
      const contextId = await resolveContextId(webui, token, printer.machineName);

      // Material-station firmware only accepts 3MF; the gate must refuse gcode.
      if (target.hasMaterialStation) {
        const gcodeStage = await stageFile(contextId, GCODE_FIXTURE);
        expect(gcodeStage.status, 'gcode must be refused on material-station models').toBe(400);
      }

      const stage = await stageFile(contextId, fixture);
      expect(stage.status, `staging failed: ${stage.payload.error}`).toBe(200);
      expect(stage.payload.success).toBe(true);
      expect(stage.payload.uploadId, 'staging must return an upload handle').toBeTruthy();
      expect(stage.payload.requiresMaterialMatching).toBe(target.hasMaterialStation);

      // Material-station uploads carry a mapping for the single tool, exactly as
      // the matching dialog would (the AD5X ff-api path hard-rejects empty lists).
      const materialMappings = target.hasMaterialStation
        ? [
            {
              toolId: 0,
              slotId: 1,
              materialName: 'PLA',
              toolMaterialColor: '#FFFFFF',
              slotMaterialColor: '#FFFFFF',
            },
          ]
        : undefined;

      const start = await postJson<StartPayload>(
        webui,
        token,
        `/api/jobs/upload/start?contextId=${contextId}`,
        { uploadId: stage.payload.uploadId, startNow: false, materialMappings }
      );
      expect(start.status, `upload failed: ${start.payload.error}`).toBe(200);
      expect(start.payload.success).toBe(true);
      expect(start.payload.started, 'startNow: false must not start the print').toBe(false);

      await expectFileOnPrinter(contextId, printer, fixture);
    }
  });

  test('refuses a staged file name that is not a bare job file name', async () => {
    const target = MODEL_TARGETS[0];
    if (!target) {
      throw new Error('MODEL_TARGETS must not be empty');
    }
    const contextId = await resolveContextId(webui, token, target.printer.machineName);

    // Deliberately no fixture read: the filename must be rejected before anything
    // touches the filesystem, so any bytes prove the point.
    const stage = await postRaw<StagePayload>(
      webui,
      token,
      `/api/jobs/upload/stage?contextId=${contextId}&filename=${encodeURIComponent('../escape.gcode')}`,
      Buffer.from('placeholder bytes')
    );
    expect(stage.status).toBe(400);
  });
});
