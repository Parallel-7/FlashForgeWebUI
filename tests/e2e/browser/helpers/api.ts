/**
 * @fileoverview Shared API/browser helpers for browser E2E specs.
 *
 * Extracted from the per-spec duplicates (gating and heaters both carried private
 * copies of the token fetch and context resolution): every helper here talks to
 * the REAL server or the REAL emulator and asserts nothing itself.
 *
 * Login budget discipline: the server rate-limits /api/auth/login to 5 attempts
 * per 15 minutes per IP and counts successful logins. A suite that uses these
 * helpers spends exactly two (harness readiness login + one fetchApiToken) if
 * every UI test opens pages through openWithRememberedToken instead of the login
 * form — the token restore path is the app's own "remember me" behaviour.
 */

import { expect, type Page } from '@playwright/test';
import type { StandalonePrinter, StandaloneWebUI } from './standalone-server';
import { WEBUI_TEST_PASSWORD } from './standalone-server';

interface ContextsPayload {
  contexts: Array<{ id: string; name: string; isActive: boolean }>;
}

export interface EmulatorDetail {
  /** Machine status string (e.g. "Idle"); the not-printing safety gate reads it. */
  status?: string;
  printFileName?: string;
  platTargetTemp?: number;
  rightTargetTemp?: number;
  nozzleTargetTemps?: number[];
  lightStatus?: string;
}

/** Logs in through the real auth route to obtain a bearer token for API-driven assertions. */
export const fetchApiToken = async (webui: StandaloneWebUI): Promise<string> => {
  const response = await fetch(`${webui.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: webui.password ?? WEBUI_TEST_PASSWORD }),
  });

  const payload = (await response.json()) as { token?: string; message?: string };
  if (!payload.token) {
    throw new Error(`Could not obtain an API token: ${payload.message ?? response.status}`);
  }

  return payload.token;
};

/** Resolves a printer's context id from the server by machine name; never assumes which context is active. */
export const resolveContextId = async (
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

/** Reads the emulator printer's own /detail state - the ground truth assertions poll. */
export const readEmulatorDetail = async (printer: StandalonePrinter): Promise<EmulatorDetail> => {
  const response = await fetch(`http://127.0.0.1:${printer.httpPort}/detail`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serialNumber: printer.serial, checkCode: printer.checkCode }),
  });
  const payload = (await response.json()) as { detail?: EmulatorDetail };
  return payload.detail ?? {};
};

/** Authenticated JSON POST against the server, returning status plus parsed body. */
export const postJson = async <T>(
  webui: StandaloneWebUI,
  token: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; payload: T }> => {
  const response = await fetch(`${webui.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, payload: (await response.json()) as T };
};

/** Authenticated raw-bytes POST (e.g. job file staging), returning status plus parsed body. */
export const postRaw = async <T>(
  webui: StandaloneWebUI,
  token: string,
  path: string,
  body: Buffer
): Promise<{ status: number; payload: T }> => {
  const response = await fetch(`${webui.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: new Uint8Array(body),
  });
  return { status: response.status, payload: (await response.json()) as T };
};

/**
 * Opens the WebUI already authenticated via the remembered token.
 *
 * Seeds localStorage through addInitScript, which runs before any app script on
 * every navigation - the same code path a returning "remember me" user takes, so
 * it costs zero logins against the rate limiter. Asserts the dashboard came up
 * and the websocket passed the real auth gate ("Connected").
 */
export const openWithRememberedToken = async (
  page: Page,
  webui: StandaloneWebUI,
  token: string
): Promise<void> => {
  await page.addInitScript((value) => localStorage.setItem('webui-token', value), token);
  await page.goto(webui.baseUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#main-ui')).toBeVisible();
  await expect(page.locator('#login-screen')).toBeHidden();
  await expect(page.locator('#connection-text')).toHaveText('Connected');
};

/** Switches the active printer context through the built WebUI's printer selector. */
export const switchPrinterInUi = async (
  page: Page,
  webui: StandaloneWebUI,
  token: string,
  machineName: string
): Promise<void> => {
  const contextId = await resolveContextId(webui, token, machineName);
  const selector = page.locator('#printer-select');
  await expect(selector).toBeVisible();
  await selector.selectOption(contextId);
  await expect(page.locator('#connection-text')).toHaveText('Connected');
};
