/**
 * @fileoverview End-to-end coverage for the bed/extruder heater routes across every model.
 *
 * The four `/api/printer/temperature/{bed,extruder}[/off]` routes used to send
 * raw G-code (`~M140` / `~M104`) over TCP, which hard-fails on the HTTP-only
 * Creator 5 series (no TCP channel). They now route through backend-manager
 * temperature commands that branch on client presence: dual-API printers keep
 * the legacy TCP G-code channel, HTTP-only printers use the HTTP
 * temperature-control API.
 *
 * This spec pins both halves of that contract against real emulated printers
 * driven through the real server, looping the full model matrix so every
 * printer's heater path is exercised: a set/cancel cycle per model asserting the
 * targets actually change in each emulator's own /detail state, plus the
 * Creator 5 series nozzles-array contract.
 */

import { expect, test } from '@playwright/test';
import { fetchApiToken, postJson, readEmulatorDetail, resolveContextId } from './helpers/api';
import { type StandaloneWebUI, startStandaloneWebUI } from './helpers/standalone-server';
import { MATRIX_PRINTERS, MODEL_TARGETS } from './helpers/targets';

interface CommandPayload {
  success?: boolean;
  error?: string;
}

const postHeaterCommand = async (
  webui: StandaloneWebUI,
  token: string,
  contextId: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<{ status: number; payload: CommandPayload }> =>
  await postJson<CommandPayload>(
    webui,
    token,
    `/api/printer/temperature/${endpoint}?contextId=${contextId}`,
    body
  );

test.describe('WebUI bed/extruder heater routes', () => {
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

    test(`sets and cancels bed and extruder targets on ${printer.machineName}`, async () => {
      const contextId = await resolveContextId(webui, token, printer.machineName);

      // Bed on: the emulator's own /detail must report the new target.
      const bedResult = await postHeaterCommand(webui, token, contextId, 'bed', {
        temperature: 60,
      });
      expect(bedResult.status, `bed set failed: ${bedResult.payload.error}`).toBe(200);
      expect(bedResult.payload.success).toBe(true);
      await expect.poll(async () => (await readEmulatorDetail(printer)).platTargetTemp).toBe(60);

      // Bed off: target returns to 0.
      const bedOffResult = await postHeaterCommand(webui, token, contextId, 'bed/off');
      expect(bedOffResult.status, `bed off failed: ${bedOffResult.payload.error}`).toBe(200);
      await expect.poll(async () => (await readEmulatorDetail(printer)).platTargetTemp).toBe(0);

      // Extruder on: /detail's rightTemp alias mirrors tool 0 on every model.
      const extruderResult = await postHeaterCommand(webui, token, contextId, 'extruder', {
        temperature: 215,
      });
      expect(extruderResult.status, `extruder set failed: ${extruderResult.payload.error}`).toBe(
        200
      );
      expect(extruderResult.payload.success).toBe(true);
      await expect.poll(async () => (await readEmulatorDetail(printer)).rightTargetTemp).toBe(215);

      // Extruder off: target returns to 0.
      const extruderOffResult = await postHeaterCommand(webui, token, contextId, 'extruder/off');
      expect(
        extruderOffResult.status,
        `extruder off failed: ${extruderOffResult.payload.error}`
      ).toBe(200);
      await expect.poll(async () => (await readEmulatorDetail(printer)).rightTargetTemp).toBe(0);
    });
  }

  for (const target of MODEL_TARGETS.filter((candidate) => candidate.isCreator5Series)) {
    const printer = target.printer;

    test(`drives the ${printer.machineName} primary tool through the nozzles array`, async () => {
      const contextId = await resolveContextId(webui, token, printer.machineName);

      const result = await postHeaterCommand(webui, token, contextId, 'extruder', {
        temperature: 205,
      });
      expect(result.status).toBe(200);

      const detail = await readEmulatorDetail(printer);
      // The Creator 5 series firmware only honors the 4-entry nozzles array for
      // tool control; the HTTP path must land there, not in a legacy scalar field.
      expect(detail.nozzleTargetTemps?.[0]).toBe(205);
      expect(detail.nozzleTargetTemps?.slice(1)).toEqual([0, 0, 0]);
    });
  }
});
