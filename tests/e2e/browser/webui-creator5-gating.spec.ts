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
 *
 * Every model in the matrix is exercised (see helpers/targets.ts); the expected
 * state derives from each target's isCreator5Series flag.
 */

import { expect, test } from '@playwright/test';
import { fetchApiToken, openWithRememberedToken, switchPrinterInUi } from './helpers/api';
import { type StandaloneWebUI, startStandaloneWebUI } from './helpers/standalone-server';
import { MATRIX_PRINTERS, MODEL_TARGETS } from './helpers/targets';

const LOCAL_JOB_UNAVAILABLE_MESSAGE = 'Local job management is not available on this printer.';

test.describe('WebUI Creator 5 capability gating', () => {
  let webui: StandaloneWebUI;
  /**
   * Shared API token, fetched once in beforeAll.
   *
   * The server's login rate limiter allows 5 attempts per 15 minutes per IP and
   * counts successful logins too. This suite spends two (harness readiness +
   * this token); every test then opens its page through the remembered-token
   * restore path, which is not a login. Same constraint the
   * FlashForgeUI-Electron browser suite is budgeted around.
   */
  let token: string;

  test.beforeAll(async () => {
    webui = await startStandaloneWebUI({ printers: MATRIX_PRINTERS });
    token = await fetchApiToken(webui);
  });

  test.afterAll(async () => {
    await webui?.stop();
  });

  for (const target of MODEL_TARGETS) {
    test(`gates local job entry points per model on ${target.printer.machineName}`, async ({
      page,
    }) => {
      await openWithRememberedToken(page, webui, token);
      await switchPrinterInUi(page, webui, token, target.printer.machineName);

      const recentButton = page.locator('#btn-start-recent');
      const localButton = page.locator('#btn-start-local');
      const homeAxesButton = page.locator('#btn-home-axes');

      if (target.isCreator5Series) {
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
          'Home Axes must be available on printers with a G-code channel'
        ).toBeEnabled();
      }
    });
  }
});
