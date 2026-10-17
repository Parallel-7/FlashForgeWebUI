/**
 * @fileoverview LED control coverage across every model, mirroring FlashForgeUI-Electron's
 * emulator-track LED spec.
 *
 * Drives the real server's led-on/led-off routes for each model in the matrix and
 * asserts the change in the emulator printer's own /detail state (lightStatus
 * open/close), never in rendered UI: a button that toggles its own styling while
 * the command never reaches the printer is precisely the failure this catches.
 *
 * The cycle ends with the LED back on, which is the state a user leaves a printer in.
 */

import { expect, test } from '@playwright/test';
import { fetchApiToken, postJson, readEmulatorDetail, resolveContextId } from './helpers/api';
import { type StandaloneWebUI, startStandaloneWebUI } from './helpers/standalone-server';
import { MATRIX_PRINTERS, MODEL_TARGETS } from './helpers/targets';

interface CommandPayload {
  success?: boolean;
  error?: string;
}

const postLedCommand = async (
  webui: StandaloneWebUI,
  token: string,
  contextId: string,
  enabled: boolean
): Promise<{ status: number; payload: CommandPayload }> =>
  await postJson<CommandPayload>(
    webui,
    token,
    `/api/printer/control/led-${enabled ? 'on' : 'off'}?contextId=${contextId}`
  );

test.describe('WebUI LED control', () => {
  let webui: StandaloneWebUI;
  /** Fetched once per suite; the login rate limiter budgets 5 attempts / 15 min. */
  let token: string;

  test.beforeAll(async () => {
    webui = await startStandaloneWebUI({ printers: MATRIX_PRINTERS });
    token = await fetchApiToken(webui);
  });

  test.afterAll(async () => {
    await webui?.stop();
  });

  for (const target of MODEL_TARGETS) {
    const printer = target.printer;

    test(`cycles the LED on, off, and back on on ${printer.machineName}`, async () => {
      const contextId = await resolveContextId(webui, token, printer.machineName);

      // Start from a known state so the first assertion cannot pass by accident.
      const initialOff = await postLedCommand(webui, token, contextId, false);
      expect(initialOff.status, `initial LED off failed: ${initialOff.payload.error}`).toBe(200);
      await expect.poll(async () => (await readEmulatorDetail(printer)).lightStatus).toBe('close');

      const onResult = await postLedCommand(webui, token, contextId, true);
      expect(onResult.status, `LED on failed: ${onResult.payload.error}`).toBe(200);
      expect(onResult.payload.success).toBe(true);
      await expect.poll(async () => (await readEmulatorDetail(printer)).lightStatus).toBe('open');

      const offResult = await postLedCommand(webui, token, contextId, false);
      expect(offResult.status, `LED off failed: ${offResult.payload.error}`).toBe(200);
      await expect.poll(async () => (await readEmulatorDetail(printer)).lightStatus).toBe('close');

      const onAgain = await postLedCommand(webui, token, contextId, true);
      expect(onAgain.status, `LED on again failed: ${onAgain.payload.error}`).toBe(200);
      await expect.poll(async () => (await readEmulatorDetail(printer)).lightStatus).toBe('open');
    });
  }
});
