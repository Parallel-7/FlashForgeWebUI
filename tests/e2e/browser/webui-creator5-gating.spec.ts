/**
 * @fileoverview Browser coverage for the Creator 5 series capability gating.
 *
 * Creator 5 / Creator 5 Pro firmware neither sends nor accepts material mappings
 * over the local API, so starting a previously-uploaded local or recent job
 * dead-ends at material selection. The webui disables those entry points for the
 * series (commit 27c67ca) while every other model keeps them. This spec pins that
 * contract per model, driven end to end through the real server and emulated
 * printers, so a regression fails loudly instead of shipping a dead-end button.
 *
 * It also pins the HTTP-only side effect: Home Axes is raw G-code (~G28), and the
 * series exposes no TCP/G-code passthrough, so the button must stay disabled for
 * those models and enabled on a 5M-family printer.
 */

import { expect, type Page, test } from '@playwright/test';
import {
  type StandalonePrinter,
  type StandaloneWebUI,
  startStandaloneWebUI,
  WEBUI_TEST_PASSWORD,
} from './helpers/standalone-server';

const LOCAL_JOB_UNAVAILABLE_MESSAGE = 'Local job management is not available on this printer.';

const GATING_PRINTERS: readonly StandalonePrinter[] = [
  {
    label: 'Adventurer 5M Pro (emulated)',
    model: 'adventurer-5m-pro',
    serial: 'E2E-WEBUI-GATE-5MPRO',
    checkCode: '123',
    machineName: 'Gate-5MPro',
    tcpPort: 8899,
    httpPort: 8898,
  },
  {
    label: 'Creator 5 (emulated)',
    model: 'creator-5',
    serial: 'E2E-WEBUI-GATE-C5',
    checkCode: '123',
    machineName: 'Gate-Creator5',
    tcpPort: 8999,
    httpPort: 8998,
  },
  {
    label: 'Creator 5 Pro (emulated)',
    model: 'creator-5-pro',
    serial: 'E2E-WEBUI-GATE-C5PRO',
    checkCode: '123',
    machineName: 'Gate-Creator5Pro',
    tcpPort: 9099,
    httpPort: 9098,
  },
];

interface ContextsPayload {
  contexts: Array<{ id: string; name: string; isActive: boolean }>;
}

const CREATOR5_SERIALS = new Set(['E2E-WEBUI-GATE-C5', 'E2E-WEBUI-GATE-C5PRO']);

const apiToken = async (webui: StandaloneWebUI): Promise<string> => {
  const response = await fetch(`${webui.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: WEBUI_TEST_PASSWORD }),
  });
  const payload = (await response.json()) as { token?: string };
  if (!payload.token) {
    throw new Error('Could not obtain an API token for out-of-band assertions');
  }
  return payload.token;
};

const signIn = async (page: Page, webui: StandaloneWebUI): Promise<void> => {
  await page.goto(webui.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.fill('#password-input', WEBUI_TEST_PASSWORD);
  await page.click('#login-button');
  await expect(page.locator('#main-ui')).toBeVisible();
};

test.describe('WebUI Creator 5 capability gating', () => {
  let webui: StandaloneWebUI;
  /**
   * Shared API token, fetched once in beforeAll.
   *
   * The server's login rate limiter allows 5 attempts per 15 minutes per IP and
   * counts successful logins too, so the file budget is: harness login (1), this
   * token (2), and one UI login per test (3-5). Fetching a token per test would
   * trip the limiter - same constraint the FlashForgeUI-Electron browser suite
   * is budgeted around.
   */
  let token: string;

  test.beforeAll(async () => {
    webui = await startStandaloneWebUI({ printers: GATING_PRINTERS });
    token = await apiToken(webui);
  });

  test.afterAll(async () => {
    await webui?.stop();
  });

  for (const printer of GATING_PRINTERS) {
    test(`gates local job entry points per model on ${printer.machineName}`, async ({ page }) => {
      const isCreator5 = CREATOR5_SERIALS.has(printer.serial);

      await signIn(page, webui);
      await expect(page.locator('#connection-text')).toHaveText('Connected');

      // Resolve this printer's context id from the server (never assume which
      // context is active) and switch to it through the built UI.
      const contextsResponse = await fetch(`${webui.baseUrl}/api/contexts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { contexts } = (await contextsResponse.json()) as ContextsPayload;

      const target = contexts.find((context) => context.name === printer.machineName);
      expect(target, `expected a context for ${printer.machineName}`).toBeTruthy();

      const selector = page.locator('#printer-select');
      await expect(selector).toBeVisible();
      await selector.selectOption(target!.id);

      // The webui must settle on the switched printer's dashboard before the button
      // states mean anything.
      await expect(page.locator('#connection-text')).toHaveText('Connected');

      const recentButton = page.locator('#btn-start-recent');
      const localButton = page.locator('#btn-start-local');
      const homeAxesButton = page.locator('#btn-home-axes');

      if (isCreator5) {
        await expect(
          recentButton,
          'recent job start must be disabled on the Creator 5 series'
        ).toBeDisabled();
        await expect(
          localButton,
          'local job start must be disabled on the Creator 5 series'
        ).toBeDisabled();
        await expect(recentButton).toHaveAttribute('title', LOCAL_JOB_UNAVAILABLE_MESSAGE);
        await expect(localButton).toHaveAttribute('title', LOCAL_JOB_UNAVAILABLE_MESSAGE);

        // HTTP-only: no TCP/G-code passthrough, so Home Axes must stay disabled.
        await expect(
          homeAxesButton,
          'Home Axes must be disabled on HTTP-only models'
        ).toBeDisabled();
      } else {
        await expect(
          recentButton,
          'recent job start must stay available on other models'
        ).toBeEnabled();
        await expect(
          localButton,
          'local job start must stay available on other models'
        ).toBeEnabled();
        await expect(
          homeAxesButton,
          'Home Axes must be available on 5M-family printers'
        ).toBeEnabled();
      }
    });
  }
});
