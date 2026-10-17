/**
 * @fileoverview INTERACTIVE multi-tool material matching regression net.
 *
 * The earlier matching specs only ever drove the dialog with single-color
 * fixtures (one tool row) or posted mappings through the API, so the
 * click-through path for the SECOND and later tool rows had no coverage.
 *
 * This spec clicks like a user: select a tool row, click a loaded slot, watch
 * the mapping preview grow, and requires Confirm to enable only once every
 * tool is mapped. It runs on every material-station model in the matrix.
 *
 * The fixture uses slicer filaments 1 and 3 (PLA and PETG), which print with
 * T0 and T2. The dialog must show them as Tool 1 and Tool 3 and send tool ids
 * 0 and 2. A second suite checks the Spoolman spool picker in the same dialog.
 */

import path from 'node:path';
import { expect, test } from '@playwright/test';
import { fetchApiToken, openWithRememberedToken, switchPrinterInUi } from './helpers/api';
import { type StandaloneWebUI, startStandaloneWebUI } from './helpers/standalone-server';
import {
  isSpoolmanSidecarAvailable,
  type SpoolmanSidecar,
  SPOOLMAN_SIDECAR_SKIP_MESSAGE,
  startSpoolmanSidecar,
} from './helpers/spoolman-sidecar';
import { MATRIX_PRINTERS, MODEL_TARGETS, PRINTER_BY_MACHINE_NAME } from './helpers/targets';

const FIXTURES_DIR = path.resolve('tests/fixtures/print-files');
const TWO_TOOL_FIXTURE = 'two-tool-toolchange.3mf';

test.describe('WebUI interactive multi-tool material matching', () => {
  let webui: StandaloneWebUI;
  let token: string;

  test.beforeAll(async () => {
    webui = await startStandaloneWebUI({ printers: MATRIX_PRINTERS });
    token = await fetchApiToken(webui);
  });

  test.afterAll(async () => {
    await webui?.stop();
  });

  for (const target of MODEL_TARGETS.filter((candidate) => candidate.hasMaterialStation)) {
    const printer = target.printer;

    test(`maps every tool interactively on ${printer.machineName}`, async ({ page }) => {
      await openWithRememberedToken(page, webui, token);
      await switchPrinterInUi(page, webui, token, printer.machineName);

      await page.click('#btn-upload-job');
      await expect(page.locator('#job-upload-modal')).toBeVisible();
      await page.locator('#job-upload-file-input').setInputFiles(path.join(FIXTURES_DIR, TWO_TOOL_FIXTURE));

      const matching = page.locator('#material-matching-modal');
      await expect(matching, 'a two-filament file on a station printer must raise the matching dialog').toBeVisible();
      const tools = matching.locator('.material-tool-item');
      await expect(tools).toHaveCount(2);
      // Tool rows carry the gcode tool index, not the list position.
      await expect(tools.nth(0)).toHaveAttribute('data-tool-id', '0');
      await expect(tools.nth(1)).toHaveAttribute('data-tool-id', '2');
      await expect(tools.nth(1)).toContainText('Tool 3');

      const firstTool = tools.first();
      await firstTool.click();
      await expect(firstTool).toHaveClass(/selected/);
      await matching.locator('.material-slot-item[data-material-type="PLA"]:not(.disabled)').click();
      await expect(matching.locator('.material-mapping-item')).toHaveCount(1);

      const secondTool = tools.nth(1);
      await secondTool.click();
      await expect(secondTool, 'clicking the second tool row must select it').toHaveClass(/selected/);
      await expect(firstTool).not.toHaveClass(/selected/);

      await matching.locator('.material-slot-item[data-material-type="PETG"]:not(.disabled)').click();
      await expect(matching.locator('.material-mapping-item')).toHaveCount(2);
      await expect(
        matching.locator('#material-matching-confirm'),
        'Confirm must enable once every tool has a mapping'
      ).toBeEnabled();

      await matching.locator('#material-matching-confirm').click();
      await expect(page.locator('.job-upload-mapping-chip')).toHaveCount(2);
      await page.locator('#job-upload-cancel').click();
    });

    test(`rejects a slot with a different material on ${printer.machineName}`, async ({ page }) => {
      await openWithRememberedToken(page, webui, token);
      await switchPrinterInUi(page, webui, token, printer.machineName);

      await page.click('#btn-upload-job');
      await page.locator('#job-upload-file-input').setInputFiles(path.join(FIXTURES_DIR, TWO_TOOL_FIXTURE));
      const matching = page.locator('#material-matching-modal');
      await expect(matching.locator('.material-tool-item')).toHaveCount(2);

      await matching.locator('.material-tool-item').nth(1).click();
      await matching.locator('.material-slot-item[data-material-type="PLA"]:not(.disabled)').click();
      await expect(matching.locator('#material-matching-error')).toContainText('Material mismatch');
      await expect(matching.locator('.material-mapping-item')).toHaveCount(0);

      await matching.locator('#material-matching-cancel').click();
      await page.locator('#job-upload-cancel').click();
    });
  }
});

test.describe('WebUI matching dialog spool picker (Spoolman)', () => {
  test.skip(!isSpoolmanSidecarAvailable(), SPOOLMAN_SIDECAR_SKIP_MESSAGE);

  const printer = PRINTER_BY_MACHINE_NAME['Matrix-Creator5'];
  let sidecar: SpoolmanSidecar;
  let webui: StandaloneWebUI;
  let token: string;

  test.beforeAll(async () => {
    sidecar = await startSpoolmanSidecar();
    webui = await startStandaloneWebUI({
      printers: [printer],
      configOverrides: {
        SpoolmanEnabled: true,
        SpoolmanServerUrl: sidecar.baseUrl,
        SpoolmanUpdateMode: 'weight',
      },
    });
    token = await fetchApiToken(webui);
  });

  test.afterAll(async () => {
    await webui?.stop();
    await sidecar?.stop();
  });

  test('asks for a spool per tool and sends the choices with the upload', async ({ page }) => {
    // One printer only, so there is no printer picker to switch with.
    await openWithRememberedToken(page, webui, token);

    await page.click('#btn-upload-job');
    await page.locator('#job-upload-file-input').setInputFiles(path.join(FIXTURES_DIR, TWO_TOOL_FIXTURE));
    const matching = page.locator('#material-matching-modal');
    await expect(matching.locator('.material-tool-item')).toHaveCount(2);
    await expect(matching.locator('#material-spool-hint')).toBeVisible();

    await matching.locator('.material-tool-item').nth(0).click();
    await matching.locator('.material-slot-item[data-material-type="PLA"]:not(.disabled)').click();
    await matching.locator('.material-tool-item').nth(1).click();
    await matching.locator('.material-slot-item[data-material-type="PETG"]:not(.disabled)').click();

    const spoolSelects = matching.locator('select.material-mapping-spool');
    await expect(spoolSelects).toHaveCount(2);
    const confirm = matching.locator('#material-matching-confirm');
    await expect(confirm, 'Confirm waits for a spool choice per tool').toBeDisabled();

    await spoolSelects.nth(0).selectOption('1');
    await expect(confirm).toBeDisabled();
    await spoolSelects.nth(1).selectOption('none');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    const chips = page.locator('.job-upload-mapping-chip');
    await expect(chips.nth(0)).toContainText('Spool #1');
    await expect(chips.nth(1)).toContainText('Not tracked');

    const startRequest = page.waitForRequest((request) => request.url().includes('/api/jobs/upload/start'));
    await page.locator('#job-upload-ok').click();
    const body = (await startRequest).postDataJSON() as {
      materialMappings: Array<{ toolId: number; slotId: number }>;
      spoolAssignments: Array<{ toolId: number; spoolId: number | null }>;
    };
    expect(body.materialMappings.map((mapping) => mapping.toolId)).toEqual([0, 2]);
    expect(body.spoolAssignments).toEqual([
      { toolId: 0, spoolId: 1 },
      { toolId: 2, spoolId: null },
    ]);
  });
});
