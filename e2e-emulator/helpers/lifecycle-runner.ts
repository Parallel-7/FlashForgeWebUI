/**
 * @fileoverview Shared lifecycle runner for standalone WebUI emulator-backed Playwright scenarios.
 */

import type { Page } from '@playwright/test';
import type { EmulatorMaterialMapping } from './emulator-harness';
import {
  type EmulatorAuthConfig,
  fetchEmulatorDetail,
  seedEmulatorRecentFile,
  startEmulatorInstance,
  waitForEmulatorDetail,
} from './emulator-harness';
import type { LifecycleScenario, MaterialSlotAssignment } from './scenarios';
import {
  getDistinctFreePorts,
  startStandaloneServer,
  type SeededPrinterDetailsEntry,
} from './standalone-server-harness';
import { StandaloneWebUiPage } from './webui-page';

const LOCALHOST_IP = '127.0.0.1';
const DETAIL_TIMEOUT_MS = 30_000;

export type LifecycleConnectionMode = 'direct' | 'discovery' | 'saved';

export interface SeedRecentFileOptions {
  gcodeContent?: string;
  gcodeToolCnt?: number;
  useMatlStation?: boolean;
  materialMappings?: readonly EmulatorMaterialMapping[];
}

export interface RunSingleModelFlowOptions {
  readonly page: Page;
  readonly scenario: LifecycleScenario;
  readonly connectionMode: LifecycleConnectionMode;
  readonly fileName?: string;
  readonly seedFile?: SeedRecentFileOptions;
  readonly expectMaterialMatching?: boolean;
  readonly materialSlotAssignments?: readonly MaterialSlotAssignment[];
  readonly seededPrinters?: readonly SeededPrinterDetailsEntry[];
}

export async function runSingleModelFlow(options: RunSingleModelFlowOptions): Promise<void> {
  const discoveryEnabled = options.connectionMode === 'discovery';
  const [tcpPort, httpPort] = discoveryEnabled
    ? await getDistinctFreePorts(2)
    : [8899, 8898];
  let emulator: Awaited<ReturnType<typeof startEmulatorInstance>> | null = null;
  let server: Awaited<ReturnType<typeof startStandaloneServer>> | null = null;
  try {
    emulator = await startEmulatorInstance({
      instance: {
        instanceId: `single-${options.scenario.model}-${options.connectionMode}`,
        model: options.scenario.model,
        serial: options.scenario.serial,
        checkCode: options.scenario.checkCode,
        machineName: options.scenario.machineName,
        tcpPort,
        httpPort,
        discoveryEnabled,
        simulationMode: 'auto',
        simulationSpeed: 1,
      },
    });

    const readyPayload = emulator.readyPayloads[0];
    if (!readyPayload) {
      throw new Error(
        `Missing readiness payload for ${options.scenario.label} (${options.connectionMode})`
      );
    }

    const emulatorAuth: EmulatorAuthConfig = {
      httpPort: readyPayload.httpPort,
      serial: readyPayload.serial,
      checkCode: options.scenario.checkCode,
    };
    const fileName =
      options.fileName ??
      `e2e-${options.scenario.machineName.toLowerCase()}-${options.connectionMode}.gcode`;

    server = await startStandaloneServer({
      seededPrinters: options.seededPrinters,
    });
    const webUi = new StandaloneWebUiPage(options.page);

    await seedEmulatorRecentFile({
      ...emulatorAuth,
      fileName,
      ...(options.seedFile ?? {}),
    });

    await webUi.goto(server.baseUrl);
    webUi.clearUnexpectedErrors();

    if (options.connectionMode === 'direct') {
      await webUi.connectDirect({
        ipAddress: LOCALHOST_IP,
        printerType: options.scenario.clientType,
        checkCode:
          options.scenario.clientType === 'new' ? options.scenario.checkCode : undefined,
        expectedPrinterName: options.scenario.machineName,
      });
    } else if (options.connectionMode === 'discovery') {
      await webUi.connectDiscovery({
        printerName: options.scenario.machineName,
        expectedPrinterName: options.scenario.machineName,
        checkCode: options.scenario.checkCode,
        expectsCheckCodePrompt: options.scenario.clientType === 'new',
        expectedContextCount: 1,
        preferredIpAddress: LOCALHOST_IP,
        preferredCommandPort: readyPayload.tcpPort,
      });
    } else if (options.connectionMode === 'saved') {
      await webUi.reconnectSavedPrinter({
        serialNumber: options.scenario.serial,
        expectedPrinterName: options.scenario.machineName,
        expectedContextCount: 1,
      });
    } else {
      throw new Error(`Unsupported connection mode: ${options.connectionMode}`);
    }

    webUi.clearUnexpectedErrors();

    await verifyControlAvailability(webUi, emulatorAuth, options.scenario);

    const selectedFile = await webUi.startRecentJob({
      preferredFileName: fileName,
      expectMaterialMatching: options.expectMaterialMatching,
      materialSlotAssignments: options.materialSlotAssignments,
    });

    await waitForEmulatorDetail({
      ...emulatorAuth,
      description: 'print to start',
      timeoutMs: DETAIL_TIMEOUT_MS,
      predicate: (detail) =>
        detail.status === 'printing' && detail.printFileName === selectedFile,
    });
    await webUi.waitForCurrentJob(selectedFile);

    await webUi.clickPause();
    await waitForEmulatorDetail({
      ...emulatorAuth,
      description: 'print to pause',
      timeoutMs: DETAIL_TIMEOUT_MS,
      predicate: (detail) => detail.status === 'paused',
    });
    await webUi.waitForPrinterState('Paused');

    await webUi.clickResume();
    await waitForEmulatorDetail({
      ...emulatorAuth,
      description: 'print to resume',
      timeoutMs: DETAIL_TIMEOUT_MS,
      predicate: (detail) => detail.status === 'printing',
    });

    await webUi.clickCancel();
    await waitForEmulatorDetail({
      ...emulatorAuth,
      description: 'print to cancel',
      timeoutMs: DETAIL_TIMEOUT_MS,
      predicate: (detail) =>
        detail.status === options.scenario.expectedDetailStatusAfterCancel,
    });
    await webUi.waitForPrinterState(options.scenario.expectedUiStateAfterCancel);

    const finalDetail = await fetchEmulatorDetail(emulatorAuth);
    if (finalDetail.status !== options.scenario.expectedDetailStatusAfterCancel) {
      throw new Error(
        `Unexpected final emulator status for ${options.scenario.label}: ${finalDetail.status}`
      );
    }

    webUi.assertNoUnexpectedErrors();
  } finally {
    if (server) {
      await server.stop();
    }

    if (emulator) {
      await emulator.stop();
    }
  }
}

async function verifyControlAvailability(
  webUi: StandaloneWebUiPage,
  emulatorAuth: EmulatorAuthConfig,
  scenario: LifecycleScenario
): Promise<void> {
  if (scenario.supportsLedControls) {
    await webUi.expectLedControlsAvailability(true);
    await webUi.setLed(true);
    await waitForEmulatorDetail({
      ...emulatorAuth,
      description: 'LED to turn on',
      timeoutMs: DETAIL_TIMEOUT_MS,
      predicate: (detail) => detail.lightStatus === 'open',
    });

    await webUi.setLed(false);
    await waitForEmulatorDetail({
      ...emulatorAuth,
      description: 'LED to turn off',
      timeoutMs: DETAIL_TIMEOUT_MS,
      predicate: (detail) => detail.lightStatus === 'close',
    });
  }

  if (scenario.supportsFiltration) {
    await webUi.expectFiltrationAvailability(true);
    await webUi.setFiltration('external');
    await waitForEmulatorDetail({
      ...emulatorAuth,
      description: 'external filtration to activate',
      timeoutMs: DETAIL_TIMEOUT_MS,
      predicate: (detail) =>
        detail.externalFanStatus === 'open' && detail.internalFanStatus === 'close',
    });

    await webUi.setFiltration('internal');
    await waitForEmulatorDetail({
      ...emulatorAuth,
      description: 'internal filtration to activate',
      timeoutMs: DETAIL_TIMEOUT_MS,
      predicate: (detail) =>
        detail.externalFanStatus === 'close' && detail.internalFanStatus === 'open',
    });

    await webUi.setFiltration('off');
    await waitForEmulatorDetail({
      ...emulatorAuth,
      description: 'filtration to turn off',
      timeoutMs: DETAIL_TIMEOUT_MS,
      predicate: (detail) =>
        detail.externalFanStatus === 'close' && detail.internalFanStatus === 'close',
    });
  }
}
