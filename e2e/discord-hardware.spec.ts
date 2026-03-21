/**
 * @fileoverview Live standalone WebUI hardware coverage for Discord webhook payloads with camera snapshots.
 */

import { expect, test } from '@playwright/test';
import { startStandaloneServer } from '../e2e-emulator/helpers/standalone-server-harness';
import { StandaloneWebUiPage } from '../e2e-emulator/helpers/webui-page';
import {
  type CapturedDiscordWebhookRequest,
  startDiscordWebhookRelay,
} from './helpers/discord-webhook-relay';

const HARDWARE_FLAG = 'FFUI_E2E_HARDWARE';
const DEFAULT_TIMEOUT_MS = 180_000;
const FORWARD_URL = process.env.FFUI_E2E_DISCORD_FORWARD_URL?.trim();
const PRINTER_NAME = process.env.FFUI_E2E_AD5X_NAME?.trim() || 'AD5X';

type ContextSummary = {
  id: string;
  name: string;
};

type PrinterStatusPayload = {
  status: {
    printerState: string;
    bedTemperature: number;
    bedTargetTemperature: number;
    nozzleTemperature: number;
    nozzleTargetTemperature: number;
  };
};

type TemperatureField = {
  current: number;
  target: number;
};

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

async function getActiveContext(baseUrl: string): Promise<ContextSummary> {
  const response = await fetch(`${baseUrl}/api/contexts`);
  const payload = (await response.json()) as {
    success: boolean;
    activeContextId?: string | null;
    contexts?: Array<{ id: string; name: string; isActive: boolean }>;
  };

  const activeContext =
    payload.contexts?.find((context) => context.id === payload.activeContextId) ??
    payload.contexts?.find((context) => context.isActive);

  if (!payload.success || !activeContext) {
    throw new Error('Unable to determine active standalone context');
  }

  return {
    id: activeContext.id,
    name: activeContext.name,
  };
}

async function waitForCameraReady(baseUrl: string, contextId: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${baseUrl}/api/camera/proxy-config?contextId=${encodeURIComponent(contextId)}`
        );
        if (!response.ok) {
          return false;
        }

        const payload = (await response.json()) as {
          success?: boolean;
          streamName?: string;
        };

        return payload.success === true && typeof payload.streamName === 'string';
      },
      {
        timeout: 45_000,
      }
    )
    .toBe(true);

  await sleep(1_000);
}

async function getPrinterStatus(
  baseUrl: string,
  contextId: string
): Promise<PrinterStatusPayload['status']> {
  const response = await fetch(
    `${baseUrl}/api/printer/status?contextId=${encodeURIComponent(contextId)}`
  );
  const payload = (await response.json()) as PrinterStatusPayload & { success: boolean };

  if (!response.ok || !payload.success) {
    throw new Error('Unable to retrieve standalone printer status');
  }

  return payload.status;
}

async function triggerDiscordRoute(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  timeoutMs: number = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastFailure = 'No response received';

  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    if (response.ok) {
      return;
    }

    lastFailure = `${response.status} ${response.statusText}: ${responseText}`;
    await sleep(500);
  }

  throw new Error(`Discord E2E route ${path} did not become ready: ${lastFailure}`);
}

function getFirstEmbed(request: CapturedDiscordWebhookRequest): Record<string, unknown> {
  const embeds = request.payload.embeds;
  if (!Array.isArray(embeds) || embeds.length === 0) {
    throw new Error('Webhook payload does not include embeds');
  }

  const embed = embeds[0];
  if (!embed || typeof embed !== 'object') {
    throw new Error('First embed is not an object');
  }

  return embed as Record<string, unknown>;
}

function getEmbedFieldMap(embed: Record<string, unknown>): Map<string, string> {
  const fields = embed.fields;
  if (!Array.isArray(fields)) {
    throw new Error('Embed fields are missing');
  }

  const map = new Map<string, string>();
  for (const field of fields) {
    if (!field || typeof field !== 'object') {
      continue;
    }

    const name = typeof field.name === 'string' ? field.name : null;
    const value = typeof field.value === 'string' ? field.value : null;
    if (name && value) {
      map.set(name, value);
    }
  }

  return map;
}

function assertMultipartSnapshotRequest(request: CapturedDiscordWebhookRequest): void {
  expect(request.contentType.toLowerCase()).toContain('multipart/form-data');
  expect(request.attachment).not.toBeNull();
  expect(request.attachment?.contentType.toLowerCase()).toContain('image/');
  expect(request.attachment?.bytes.byteLength ?? 0).toBeGreaterThan(0);

  const embed = getFirstEmbed(request);
  const image = embed.image;
  expect(image).toEqual(
    expect.objectContaining({
      url: `attachment://${request.attachment?.filename}`,
    })
  );
}

function normalizeStatusValue(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function parseTemperatureField(value: string | undefined, fieldName: string): TemperatureField {
  const match = value?.match(/^(-?\d+(?:\.\d+)?)C \/ (-?\d+(?:\.\d+)?)C$/);
  if (!match) {
    throw new Error(`Unexpected ${fieldName} field value: ${String(value)}`);
  }

  return {
    current: Number(match[1]),
    target: Number(match[2]),
  };
}

function expectTemperatureFieldNear(
  value: string | undefined,
  expectedCurrent: number,
  expectedTarget: number,
  fieldName: string
): void {
  const actual = parseTemperatureField(value, fieldName);
  expect(Math.abs(actual.current - expectedCurrent)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(actual.target - expectedTarget)).toBeLessThanOrEqual(0.01);
}

test.describe('standalone hardware discord relay', () => {
  test.skip(
    !process.env[HARDWARE_FLAG],
    `Set ${HARDWARE_FLAG}=1 to run live standalone hardware Discord tests`
  );

  test('connects to the real AD5X and sends Discord status + print-complete payloads with snapshots', async ({
    page,
  }) => {
    test.setTimeout(DEFAULT_TIMEOUT_MS);
    const printerIp = requireEnv('FFUI_E2E_AD5X_IP');
    const printerCheckCode = requireEnv('FFUI_E2E_AD5X_CHECK_CODE');

    const relay = await startDiscordWebhookRelay({
      forwardUrl: FORWARD_URL,
    });
    const server = await startStandaloneServer({
      configOverrides: {
        DiscordSync: true,
        DiscordIncludeCameraSnapshots: true,
        DiscordUpdateIntervalMinutes: 60,
        WebhookUrl: relay.webhookUrl,
      },
    });

    try {
      const webUi = new StandaloneWebUiPage(page);
      await webUi.goto(server.baseUrl);
      await webUi.connectDirect({
        ipAddress: printerIp,
        printerType: 'new',
        checkCode: printerCheckCode,
        expectedPrinterName: PRINTER_NAME,
      });

      const context = await getActiveContext(server.baseUrl);
      await waitForCameraReady(server.baseUrl, context.id);
      webUi.clearUnexpectedErrors();
      const printerStatus = await getPrinterStatus(server.baseUrl, context.id);

      relay.reset();
      await triggerDiscordRoute(server.baseUrl, '/api/e2e/discord/send-current-status', {
        contextId: context.id,
      });

      const statusRequest = await relay.waitForRequest({
        timeoutMs: 30_000,
      });

      assertMultipartSnapshotRequest(statusRequest);
      const statusEmbed = getFirstEmbed(statusRequest);
      const statusFields = getEmbedFieldMap(statusEmbed);
      expect(String(statusEmbed.title ?? '')).toContain(PRINTER_NAME);
      expect(String(statusEmbed.title ?? '')).toContain(context.name);
      expect(normalizeStatusValue(statusFields.get('Status'))).toContain(
        normalizeStatusValue(printerStatus.printerState)
      );
      expectTemperatureFieldNear(
        statusFields.get('Bed Temp'),
        printerStatus.bedTemperature,
        printerStatus.bedTargetTemperature,
        'Bed Temp'
      );
      expectTemperatureFieldNear(
        statusFields.get('Extruder Temp'),
        printerStatus.nozzleTemperature,
        printerStatus.nozzleTargetTemperature,
        'Extruder Temp'
      );

      relay.reset();
      await triggerDiscordRoute(server.baseUrl, '/api/e2e/discord/send-print-complete', {
        contextId: context.id,
        fileName: 'e2e-ad5x-validation.3mf',
        durationSeconds: 3661,
      });

      const printCompleteRequest = await relay.waitForRequest({
        timeoutMs: 30_000,
      });

      assertMultipartSnapshotRequest(printCompleteRequest);
      const printCompleteFields = getEmbedFieldMap(getFirstEmbed(printCompleteRequest));
      expect(printCompleteFields.get('File')).toBe('e2e-ad5x-validation.3mf');
      expect(printCompleteFields.get('Total Time')).toBe('1h 1m');

      webUi.assertNoUnexpectedErrors();
    } finally {
      await server.stop().catch(() => undefined);
      await relay.close().catch(() => undefined);
    }
  });
});
