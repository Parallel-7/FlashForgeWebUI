/**
 * @fileoverview End-to-end coverage for the single-tool bed/extruder heater routes.
 *
 * The four `/api/printer/temperature/{bed,extruder}[/off]` routes used to send
 * raw G-code (`~M140` / `~M104`) over TCP, which hard-fails on the HTTP-only
 * Creator 5 series (no TCP channel). They now route through backend-manager
 * temperature commands that branch on client presence: dual-API printers keep
 * the legacy TCP G-code channel, HTTP-only printers use the HTTP
 * temperature-control API.
 *
 * This spec pins both halves of that contract against real emulated printers
 * driven through the real server: a Creator 5 (HTTP-only path) and an
 * Adventurer 5M Pro (legacy TCP path), asserting the heater targets actually
 * change in each emulator's own /detail state.
 */

import { expect, test } from '@playwright/test';
import {
  type StandalonePrinter,
  type StandaloneWebUI,
  startStandaloneWebUI,
  WEBUI_TEST_PASSWORD,
} from './helpers/standalone-server';

const FIVE_M_PRO_PRINTER: StandalonePrinter = {
  label: 'Adventurer 5M Pro (emulated)',
  model: 'adventurer-5m-pro',
  serial: 'E2E-WEBUI-HEAT-5MPRO',
  checkCode: '123',
  machineName: 'Heat-5MPro',
  tcpPort: 8899,
  httpPort: 8898,
};

const CREATOR5_PRINTER: StandalonePrinter = {
  label: 'Creator 5 (emulated)',
  model: 'creator-5',
  serial: 'E2E-WEBUI-HEAT-C5',
  checkCode: '123',
  machineName: 'Heat-Creator5',
  tcpPort: 8999,
  httpPort: 8998,
};

const HEATER_PRINTERS: readonly StandalonePrinter[] = [FIVE_M_PRO_PRINTER, CREATOR5_PRINTER];

interface ContextsPayload {
  contexts: Array<{ id: string; name: string; isActive: boolean }>;
}

interface EmulatorDetail {
  platTargetTemp?: number;
  rightTargetTemp?: number;
  nozzleTargetTemps?: number[];
}

const apiToken = async (webui: StandaloneWebUI): Promise<string> => {
  const response = await fetch(`${webui.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: WEBUI_TEST_PASSWORD }),
  });
  const payload = (await response.json()) as { token?: string };
  if (!payload.token) {
    throw new Error('Could not obtain an API token for heater assertions');
  }
  return payload.token;
};

const resolveContextId = async (
  webui: StandaloneWebUI,
  token: string,
  machineName: string
): Promise<string> => {
  const response = await fetch(`${webui.baseUrl}/api/contexts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { contexts } = (await response.json()) as ContextsPayload;
  const target = contexts.find((context) => context.name === machineName);
  if (!target) {
    throw new Error(`expected a context for ${machineName}`);
  }
  return target.id;
};

const postHeaterCommand = async (
  webui: StandaloneWebUI,
  token: string,
  contextId: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<{ status: number; payload: { success?: boolean; error?: string } }> => {
  const response = await fetch(
    `${webui.baseUrl}/api/printer/temperature/${endpoint}?contextId=${contextId}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  );
  return {
    status: response.status,
    payload: (await response.json()) as { success?: boolean; error?: string },
  };
};

const readEmulatorDetail = async (printer: StandalonePrinter): Promise<EmulatorDetail> => {
  const response = await fetch(`http://127.0.0.1:${printer.httpPort}/detail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serialNumber: printer.serial, checkCode: printer.checkCode }),
  });
  const payload = (await response.json()) as { detail?: EmulatorDetail };
  return payload.detail ?? {};
};

test.describe('WebUI bed/extruder heater routes', () => {
  let webui: StandaloneWebUI;
  /** Fetched once per suite; the login rate limiter budgets 5 attempts / 15 min. */
  let token: string;

  test.beforeAll(async () => {
    webui = await startStandaloneWebUI({ printers: HEATER_PRINTERS });
    token = await apiToken(webui);
  });

  test.afterAll(async () => {
    await webui?.stop();
  });

  for (const printer of HEATER_PRINTERS) {
    test(`sets and cancels bed and extruder targets on ${printer.machineName}`, async () => {
      const contextId = await resolveContextId(webui, token, printer.machineName);

      // Bed on: the emulator's own /detail must report the new target.
      const bedResult = await postHeaterCommand(webui, token, contextId, 'bed', {
        temperature: 60,
      });
      expect(bedResult.status, `bed set failed: ${bedResult.payload.error}`).toBe(200);
      expect(bedResult.payload.success).toBe(true);
      await expect
        .poll(async () => (await readEmulatorDetail(printer)).platTargetTemp)
        .toBe(60);

      // Bed off: target returns to 0.
      const bedOffResult = await postHeaterCommand(webui, token, contextId, 'bed/off');
      expect(bedOffResult.status, `bed off failed: ${bedOffResult.payload.error}`).toBe(200);
      await expect
        .poll(async () => (await readEmulatorDetail(printer)).platTargetTemp)
        .toBe(0);

      // Extruder on: /detail's rightTemp alias mirrors tool 0 on every model.
      const extruderResult = await postHeaterCommand(webui, token, contextId, 'extruder', {
        temperature: 215,
      });
      expect(extruderResult.status, `extruder set failed: ${extruderResult.payload.error}`).toBe(
        200
      );
      expect(extruderResult.payload.success).toBe(true);
      await expect
        .poll(async () => (await readEmulatorDetail(printer)).rightTargetTemp)
        .toBe(215);

      // Extruder off: target returns to 0.
      const extruderOffResult = await postHeaterCommand(webui, token, contextId, 'extruder/off');
      expect(
        extruderOffResult.status,
        `extruder off failed: ${extruderOffResult.payload.error}`
      ).toBe(200);
      await expect
        .poll(async () => (await readEmulatorDetail(printer)).rightTargetTemp)
        .toBe(0);
    });
  }

  test('drives the Creator 5 primary tool through the nozzles array', async () => {
    const printer = CREATOR5_PRINTER;
    const contextId = await resolveContextId(webui, token, printer.machineName);

    const result = await postHeaterCommand(webui, token, contextId, 'extruder', {
      temperature: 205,
    });
    expect(result.status).toBe(200);

    const detail = await readEmulatorDetail(printer);
    // The Creator 5 firmware only honors the 4-entry nozzles array for tool
    // control; the HTTP path must land there, not in a legacy scalar field.
    expect(detail.nozzleTargetTemps?.[0]).toBe(205);
    expect(detail.nozzleTargetTemps?.slice(1)).toEqual([0, 0, 0]);
  });
});
