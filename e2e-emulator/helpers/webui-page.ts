/**
 * @fileoverview Browser-side helpers for driving the standalone WebUI in headless Playwright tests.
 */

import { expect, type Page } from '@playwright/test';

const CONNECT_TIMEOUT_MS = 60_000;
const DISCOVERY_TIMEOUT_MS = 45_000;
const JOB_ACTION_TIMEOUT_MS = 30_000;
const RELOAD_TIMEOUT_MS = 20_000;
const CONSOLE_ERROR_ALLOWLIST: readonly RegExp[] = [/Autofill\.enable/i, /Autofill\.setAddresses/i];

export interface MaterialSlotAssignment {
  readonly toolId: number;
  readonly slotId: number;
}

type DiscoveryTab = 'scan' | 'manual' | 'saved';
type FiltrationMode = 'external' | 'internal' | 'off';

function normalizeWhitespace(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function shouldIgnoreConsoleError(message: string): boolean {
  return CONSOLE_ERROR_ALLOWLIST.some((pattern) => pattern.test(message));
}

export class StandaloneWebUiPage {
  private readonly unexpectedErrors: string[] = [];
  private readonly seenErrors = new Set<string>();

  public constructor(private readonly page: Page) {
    this.page.on('pageerror', (error) => {
      this.pushUnexpectedError(`[pageerror] ${error.message}`);
    });

    this.page.on('console', (message) => {
      if (message.type() !== 'error') {
        return;
      }

      const text = normalizeWhitespace(message.text());
      if (shouldIgnoreConsoleError(text)) {
        return;
      }

      this.pushUnexpectedError(`[console.error] ${text}`);
    });
  }

  public async goto(baseUrl: string): Promise<void> {
    await this.page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await expect(this.page.locator('#main-ui')).toBeVisible({ timeout: CONNECT_TIMEOUT_MS });
  }

  public clearUnexpectedErrors(): void {
    this.unexpectedErrors.length = 0;
    this.seenErrors.clear();
  }

  public assertNoUnexpectedErrors(): void {
    if (this.unexpectedErrors.length === 0) {
      return;
    }

    throw new Error(`Unexpected renderer errors detected:\n${this.unexpectedErrors.join('\n')}`);
  }

  public async login(password: string, rememberMe = false): Promise<void> {
    await expect(this.page.locator('#login-screen')).toBeVisible();
    await this.page.fill('#password-input', password);

    if (rememberMe) {
      await this.page.check('#remember-me-checkbox');
    }

    await this.page.click('#login-button');
    await expect(this.page.locator('#main-ui')).toBeVisible({ timeout: CONNECT_TIMEOUT_MS });
  }

  public async waitForContextCount(expectedCount: number): Promise<void> {
    await expect
      .poll(
        async () =>
          await this.page.evaluate(async () => {
            const response = await fetch('/api/contexts');
            const payload = (await response.json()) as { contexts?: unknown[] };
            return Array.isArray(payload.contexts) ? payload.contexts.length : 0;
          }),
        { timeout: CONNECT_TIMEOUT_MS }
      )
      .toBeGreaterThanOrEqual(expectedCount);
  }

  public async waitForActiveContext(printerName: string): Promise<void> {
    await expect
      .poll(
        async () =>
          await this.page.evaluate(async () => {
            const response = await fetch('/api/contexts');
            const payload = (await response.json()) as {
              activeContextId?: string | null;
              contexts?: Array<{ id: string; name: string }>;
            };
            const activeContext =
              payload.contexts?.find((context) => context.id === payload.activeContextId) ?? null;
            return activeContext?.name ?? '';
          }),
        { timeout: CONNECT_TIMEOUT_MS }
      )
      .toBe(printerName);
  }

  public async waitForPrinterStatusPopulated(): Promise<void> {
    await expect
      .poll(async () => normalizeWhitespace(await this.page.locator('#printer-status').textContent()), {
        timeout: CONNECT_TIMEOUT_MS,
      })
      .not.toBe('Unknown');
  }

  public async waitForPrinterState(
    expectedState: string,
    timeoutMs = JOB_ACTION_TIMEOUT_MS
  ): Promise<void> {
    await expect
      .poll(async () => normalizeWhitespace(await this.page.locator('#printer-status').textContent()), {
        timeout: timeoutMs,
      })
      .toBe(expectedState);
  }

  public async waitForCurrentJob(
    expectedFileName: string,
    timeoutMs = JOB_ACTION_TIMEOUT_MS
  ): Promise<void> {
    await expect
      .poll(async () => normalizeWhitespace(await this.page.locator('#current-job').textContent()), {
        timeout: timeoutMs,
      })
      .toBe(expectedFileName);
  }

  public async connectDirect(params: {
    ipAddress: string;
    printerType: 'new' | 'legacy';
    checkCode?: string;
    expectedPrinterName: string;
  }): Promise<void> {
    await this.openDiscoveryModal();
    await this.selectDiscoveryTab('manual');
    await this.page.fill('#discovery-manual-ip', params.ipAddress);
    await this.page.selectOption('#discovery-printer-type', params.printerType);

    if (params.printerType === 'new' && params.checkCode) {
      await this.page.fill('#discovery-check-code', params.checkCode);
    }

    await this.runAndWaitForReload(async () => {
      await this.page.click('#discovery-manual-connect');
    });

    await this.waitForConnectedPrinter(1, params.expectedPrinterName);
  }

  public async connectDiscovery(params: {
    printerName: string;
    expectedPrinterName: string;
    checkCode?: string;
    expectsCheckCodePrompt: boolean;
    expectedContextCount: number;
    preferredIpAddress?: string;
    preferredCommandPort?: number;
  }): Promise<void> {
    await this.openDiscoveryModal();
    await this.selectDiscoveryTab('scan');
    await this.page.click('#discovery-scan-btn');

    const selectorParts = [
      '#discovery-printer-list .connect-printer-btn',
      `[data-name="${params.printerName}"]`,
    ];

    if (params.preferredIpAddress) {
      selectorParts.push(`[data-ip="${params.preferredIpAddress}"]`);
    }

    if (params.preferredCommandPort !== undefined) {
      selectorParts.push(`[data-command-port="${params.preferredCommandPort}"]`);
    }

    let connectButton = this.page.locator(selectorParts.join(''));
    if ((await connectButton.count()) === 0) {
      connectButton = this.page.locator(
        `#discovery-printer-list .connect-printer-btn[data-name="${params.printerName}"]`
      );
    }

    await expect(connectButton.first()).toBeVisible({ timeout: DISCOVERY_TIMEOUT_MS });
    connectButton = connectButton.first();

    if (params.expectsCheckCodePrompt) {
      const dialogPromise = this.page
        .waitForEvent('dialog', {
          timeout: RELOAD_TIMEOUT_MS,
        })
        .catch(() => null);
      await connectButton.click();
      const dialog = await dialogPromise;

      if (dialog) {
        await dialog.accept(params.checkCode ?? '');
      }

      await this.waitForOptionalReload();
    } else {
      await connectButton.click();
      await this.waitForOptionalReload();
    }

    await this.waitForConnectedPrinter(
      params.expectedContextCount,
      params.expectedPrinterName
    );
  }

  public async reconnectSavedPrinter(params: {
    serialNumber: string;
    expectedPrinterName: string;
    expectedContextCount: number;
  }): Promise<void> {
    await this.openDiscoveryModal();
    await this.selectDiscoveryTab('saved');

    const reconnectButton = this.page.locator(
      `#discovery-saved-printers-list .reconnect-btn[data-serial="${params.serialNumber}"]`
    );
    await expect(reconnectButton).toBeVisible({ timeout: CONNECT_TIMEOUT_MS });

    await this.runAndWaitForReload(async () => {
      await reconnectButton.click();
    });

    await this.waitForConnectedPrinter(
      params.expectedContextCount,
      params.expectedPrinterName
    );
  }

  public async switchContextByName(printerName: string): Promise<void> {
    const selector = this.page.locator('#printer-select');
    await expect(selector).toBeVisible({ timeout: CONNECT_TIMEOUT_MS });

    const optionValue = await this.page.locator('#printer-select option').evaluateAll(
      (options, targetName) => {
        const matched = options.find((option) =>
          option.textContent?.includes(targetName as string)
        );
        return matched?.getAttribute('value') ?? null;
      },
      printerName
    );

    if (!optionValue) {
      throw new Error(`Unable to find printer selector option for "${printerName}"`);
    }

    await selector.selectOption(optionValue);
    await this.waitForActiveContext(printerName);
    await this.waitForPrinterStatusPopulated();
  }

  public async expectLedControlsAvailability(available: boolean): Promise<void> {
    const ledOn = this.page.locator('#btn-led-on');
    const ledOff = this.page.locator('#btn-led-off');

    await expect(ledOn).toBeVisible();
    await expect(ledOff).toBeVisible();

    if (available) {
      await expect(ledOn).toBeEnabled();
      await expect(ledOff).toBeEnabled();
      return;
    }

    await expect(ledOn).toBeDisabled();
    await expect(ledOff).toBeDisabled();
  }

  public async expectFiltrationAvailability(available: boolean): Promise<void> {
    const filtrationPanel = this.page.locator('#filtration-panel');

    if (available) {
      await expect(filtrationPanel).toBeVisible();
      return;
    }

    await expect(filtrationPanel).toBeHidden();
  }

  public async setLed(enabled: boolean): Promise<void> {
    const buttonId = enabled ? '#btn-led-on' : '#btn-led-off';
    const button = this.page.locator(buttonId);
    await expect(button).toBeEnabled({ timeout: JOB_ACTION_TIMEOUT_MS });
    await button.click();
  }

  public async setFiltration(mode: FiltrationMode): Promise<void> {
    const buttonId =
      mode === 'external'
        ? '#btn-external-filtration'
        : mode === 'internal'
          ? '#btn-internal-filtration'
          : '#btn-no-filtration';
    const button = this.page.locator(buttonId);
    await expect(button).toBeVisible({ timeout: JOB_ACTION_TIMEOUT_MS });
    await button.click();
  }

  public async clickPause(): Promise<void> {
    const button = this.page.locator('#btn-pause');
    await expect(button).toBeEnabled({ timeout: JOB_ACTION_TIMEOUT_MS });
    await button.click();
  }

  public async clickResume(): Promise<void> {
    const button = this.page.locator('#btn-resume');
    await expect(button).toBeEnabled({ timeout: JOB_ACTION_TIMEOUT_MS });
    await button.click();
  }

  public async clickCancel(): Promise<void> {
    const button = this.page.locator('#btn-cancel');
    await expect(button).toBeEnabled({ timeout: JOB_ACTION_TIMEOUT_MS });
    await button.click();
  }

  public async startRecentJob(params: {
    preferredFileName: string;
    expectMaterialMatching?: boolean;
    materialSlotAssignments?: readonly MaterialSlotAssignment[];
  }): Promise<string> {
    const startButton = this.page.locator('#btn-start-recent');
    await expect(startButton).toBeEnabled({ timeout: JOB_ACTION_TIMEOUT_MS });
    await startButton.click();

    const fileModal = this.page.locator('#file-modal');
    await expect(fileModal).toBeVisible({ timeout: JOB_ACTION_TIMEOUT_MS });

    let selectedFileName = await this.trySelectFileFromOpenModal(params.preferredFileName, 10_000);

    if (!selectedFileName) {
      const closeButton = this.page.locator('#close-modal');
      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
      }

      await expect(fileModal).toBeHidden({ timeout: JOB_ACTION_TIMEOUT_MS });

      const localButton = this.page.locator('#btn-start-local');
      await expect(localButton).toBeEnabled({ timeout: JOB_ACTION_TIMEOUT_MS });
      await localButton.click();
      await expect(fileModal).toBeVisible({ timeout: JOB_ACTION_TIMEOUT_MS });

      selectedFileName = await this.trySelectFileFromOpenModal(params.preferredFileName);
    }

    if (!selectedFileName) {
      throw new Error('No files available in recent or local file picker');
    }

    const printButton = this.page.locator('#print-file-btn');
    await expect(printButton).toBeEnabled({ timeout: JOB_ACTION_TIMEOUT_MS });
    await printButton.click();

    const materialMatchingModal = this.page.locator('#material-matching-modal');
    const materialMatchingVisible = await materialMatchingModal
      .waitFor({
        state: 'visible',
        timeout: 5_000,
      })
      .then(() => true)
      .catch(() => false);

    if (materialMatchingVisible) {
      await this.completeMaterialMatching(params.materialSlotAssignments);
      await expect(materialMatchingModal).toBeHidden({
        timeout: JOB_ACTION_TIMEOUT_MS,
      });
    } else if (params.expectMaterialMatching) {
      throw new Error('Expected material matching modal, but it did not appear');
    }

    await expect(fileModal).toBeHidden({ timeout: JOB_ACTION_TIMEOUT_MS });
    return selectedFileName;
  }

  private async waitForConnectedPrinter(
    expectedContextCount: number,
    expectedPrinterName: string
  ): Promise<void> {
    await this.waitForContextCount(expectedContextCount);
    await this.waitForActiveContext(expectedPrinterName);
    await this.waitForPrinterStatusPopulated();
  }

  private async openDiscoveryModal(): Promise<void> {
    const button = this.page.locator('#add-printer-btn');
    await expect(button).toBeVisible({ timeout: CONNECT_TIMEOUT_MS });
    await button.click();
    await expect(this.page.locator('#discovery-modal')).toBeVisible({
      timeout: CONNECT_TIMEOUT_MS,
    });
  }

  private async selectDiscoveryTab(tab: DiscoveryTab): Promise<void> {
    const tabButton = this.page.locator(`.discovery-tab-btn[data-tab="${tab}"]`);
    await expect(tabButton).toBeVisible({ timeout: CONNECT_TIMEOUT_MS });
    await tabButton.click();

    const tabPane = this.page.locator(`#discovery-tab-${tab}`);
    await expect(tabPane).toBeVisible({ timeout: CONNECT_TIMEOUT_MS });
  }

  private async completeMaterialMatching(
    assignments?: readonly MaterialSlotAssignment[]
  ): Promise<void> {
    const toolItems = this.page.locator('.material-tool-item');
    const toolCount = await toolItems.count();
    const confirmButton = this.page.locator('#material-matching-confirm');

    if (toolCount === 0) {
      await this.clickMaterialMatchingConfirm(confirmButton);
      return;
    }

    const resolvedAssignments =
      assignments ??
      Array.from({ length: toolCount }, (_, index) => ({
        toolId: index,
        slotId: index + 1,
      }));

    for (const assignment of resolvedAssignments) {
      const toolItem = this.page.locator(
        `.material-tool-item[data-tool-id="${assignment.toolId}"]`
      );
      await expect(toolItem).toBeVisible({ timeout: JOB_ACTION_TIMEOUT_MS });
      await toolItem.click();

      const slotItem = this.page.locator(
        `.material-slot-item[data-slot-id="${assignment.slotId}"]:not(.disabled)`
      );
      await expect(slotItem.first()).toBeVisible({ timeout: JOB_ACTION_TIMEOUT_MS });
      await slotItem.first().click();
    }

    await this.clickMaterialMatchingConfirm(confirmButton);
  }

  private async trySelectFileFromOpenModal(
    preferredFileName: string,
    timeoutMs = JOB_ACTION_TIMEOUT_MS
  ): Promise<string | null> {
    const allFileItems = this.page.locator('.file-item[data-filename]');

    try {
      await expect(allFileItems.first()).toBeVisible({ timeout: timeoutMs });
    } catch {
      return null;
    }

    let fileItem = this.page.locator(`.file-item[data-filename="${preferredFileName}"]`).first();
    if ((await fileItem.count()) === 0) {
      fileItem = allFileItems.first();
    }

    await expect(fileItem).toBeVisible({ timeout: JOB_ACTION_TIMEOUT_MS });
    const selectedFileName = (await fileItem.getAttribute('data-filename')) ?? preferredFileName;
    await fileItem.click();
    return selectedFileName;
  }

  private async clickMaterialMatchingConfirm(
    confirmButton: ReturnType<Page['locator']>
  ): Promise<void> {
    await expect(confirmButton).toBeEnabled({ timeout: JOB_ACTION_TIMEOUT_MS });

    const startResponsePromise = this.page.waitForResponse(
      async (response) => {
        if (!response.url().endsWith('/api/jobs/start')) {
          return false;
        }

        return response.request().method() === 'POST';
      },
      { timeout: JOB_ACTION_TIMEOUT_MS }
    );

    const [startResponse] = await Promise.all([
      startResponsePromise,
      confirmButton.click({ force: true }),
    ]);

    const payload = (await startResponse.json()) as {
      success?: boolean;
      error?: string;
    };

    if (!payload.success) {
      throw new Error(payload.error || 'Material matching start request failed');
    }
  }

  private async runAndWaitForReload(action: () => Promise<void>): Promise<void> {
    const reloadPromise = this.waitForReload();
    await action();
    await reloadPromise;
  }

  private async waitForOptionalReload(): Promise<void> {
    await this.waitForReload().catch(() => {
      // Some flows update in place instead of forcing a hard reload.
    });
  }

  private async waitForReload(): Promise<void> {
    const navigationPromise = this.page.waitForEvent('framenavigated', {
      timeout: RELOAD_TIMEOUT_MS,
    });
    await navigationPromise;
    await this.page.waitForLoadState('domcontentloaded');
  }

  private pushUnexpectedError(message: string): void {
    if (this.seenErrors.has(message)) {
      return;
    }

    this.seenErrors.add(message);
    this.unexpectedErrors.push(message);
  }
}
