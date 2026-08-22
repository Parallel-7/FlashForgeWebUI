/**
 * @fileoverview Printer connection flow coverage, mirroring FlashForgeUI-Electron's
 * connect spec against the standalone server's API.
 *
 * One suite boot starts the full model matrix of emulators but seeds only the
 * Adventurer 5M Pro as a saved printer, so the remaining models must be reached
 * through the real connect paths the webui offers:
 *
 * - auto-connect of saved printers on boot (--all-saved-printers)
 * - manual connect per model via POST /printers/connect, including the HTTP-only
 *   Creator 5 series where a serial number is mandatory
 * - rejection of a wrong check code without leaving a half-created context
 * - network discovery (UDP broadcast) seeing every emulated instance and marking
 *   the saved one as known
 */

import { expect, test } from '@playwright/test';
import { fetchApiToken, postJson } from './helpers/api';
import { type StandaloneWebUI, startStandaloneWebUI } from './helpers/standalone-server';
import { MATRIX_PRINTERS, MODEL_TARGETS } from './helpers/targets';

interface ContextsPayload {
  contexts: Array<{
    id: string;
    name: string;
    model?: string;
    serialNumber?: string;
    isActive: boolean;
  }>;
}

interface ConnectPayload {
  success?: boolean;
  contextId?: string;
  error?: string;
  printer?: { SerialNumber?: string };
}

interface DiscoveryPayload {
  success?: boolean;
  error?: string;
  printers?: Array<{ serialNumber?: string }>;
  savedMatches?: Array<{ isKnown?: boolean; ipAddressChanged?: boolean }>;
}

/** The matrix's first entry: a plain dual-API printer, seeded as the saved profile. */
const SAVED_TARGET = MODEL_TARGETS[0];
if (!SAVED_TARGET) {
  throw new Error('MODEL_TARGETS must not be empty');
}

const fetchContexts = async (
  webui: StandaloneWebUI,
  token: string
): Promise<ContextsPayload['contexts']> => {
  const response = await fetch(`${webui.baseUrl}/api/contexts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = (await response.json()) as ContextsPayload;
  return payload.contexts ?? [];
};

test.describe('WebUI printer connect flow', () => {
  let webui: StandaloneWebUI;
  let token: string;

  test.beforeAll(async () => {
    webui = await startStandaloneWebUI({
      printers: MATRIX_PRINTERS,
      seedPrinters: [SAVED_TARGET.printer],
    });
    token = await fetchApiToken(webui);
  });

  test.afterAll(async () => {
    await webui?.stop();
  });

  test('auto-connects the saved printer on boot', async () => {
    const contexts = await fetchContexts(webui, token);
    expect(contexts, 'only the seeded printer may be auto-connected').toHaveLength(1);
    expect(contexts[0]?.name).toBe(SAVED_TARGET.printer.machineName);
    expect(contexts[0]?.isActive).toBe(true);
  });

  for (const target of MODEL_TARGETS.slice(1)) {
    const printer = target.printer;

    test(`connects to ${printer.machineName} through the manual connect API`, async () => {
      const { status, payload } = await postJson<ConnectPayload>(
        webui,
        token,
        '/api/printers/connect',
        {
          ipAddress: '127.0.0.1',
          type: 'new',
          checkCode: printer.checkCode,
          serialNumber: printer.serial,
          name: printer.machineName,
          productId: target.productId,
          commandPort: printer.tcpPort,
          httpPort: printer.httpPort,
        }
      );

      expect(status, `connect failed: ${payload.error}`).toBe(200);
      expect(payload.success).toBe(true);
      expect(payload.contextId, 'a context must exist for the new printer').toBeTruthy();
      expect(payload.printer?.SerialNumber).toBe(printer.serial);

      const contexts = await fetchContexts(webui, token);
      const match = contexts.find((context) => context.serialNumber === printer.serial);
      expect(
        match,
        `expected a context for serial ${printer.serial} (${printer.machineName})`
      ).toBeTruthy();
      expect(match?.model, `model detection must identify ${printer.machineName}`).toBe(
        target.printerModel
      );
    });
  }

  test('rejects a wrong check code without creating a context', async () => {
    const printer = MODEL_TARGETS[1]?.printer;
    if (!printer) {
      throw new Error('MODEL_TARGETS must contain a second model');
    }

    const contextsBefore = await fetchContexts(webui, token);

    const { status, payload } = await postJson<ConnectPayload>(
      webui,
      token,
      '/api/printers/connect',
      {
        ipAddress: '127.0.0.1',
        type: 'new',
        checkCode: '000',
        serialNumber: `${printer.serial}-BADCODE`,
        name: 'Bad-CheckCode',
        commandPort: printer.tcpPort,
        httpPort: printer.httpPort,
      }
    );

    expect(status, 'a wrong check code must not succeed').toBeGreaterThanOrEqual(400);
    expect(payload.success).not.toBe(true);

    const contextsAfter = await fetchContexts(webui, token);
    expect(contextsAfter).toHaveLength(contextsBefore.length);
  });

  test('finds every emulated printer through network discovery', async () => {
    const { status, payload } = await postJson<DiscoveryPayload>(
      webui,
      token,
      '/api/discovery/scan',
      { timeout: 8000, interval: 1000, retries: 3 }
    );

    expect(status, `discovery scan failed: ${payload.error}`).toBe(200);
    expect(payload.success).toBe(true);

    const found = new Set((payload.printers ?? []).map((found) => found.serialNumber));
    for (const target of MODEL_TARGETS) {
      expect(
        found.has(target.printer.serial),
        `discovery must report ${target.printer.machineName}`
      ).toBe(true);
    }

    const savedMatch = payload.savedMatches?.find((match) => match.isKnown === true);
    expect(savedMatch, 'the seeded saved printer must be flagged as known').toBeTruthy();
  });
});
