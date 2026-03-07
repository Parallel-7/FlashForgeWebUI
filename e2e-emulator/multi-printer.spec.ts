/**
 * @fileoverview Headless multi-printer discovery coverage for the standalone WebUI.
 */

import { test } from '@playwright/test';
import {
  seedEmulatorRecentFile,
  startEmulatorSupervisor,
  waitForEmulatorDetail,
} from './helpers/emulator-harness';
import {
  getDistinctFreePorts,
  startStandaloneServer,
} from './helpers/standalone-server-harness';
import { StandaloneWebUiPage } from './helpers/webui-page';

const MODERN_CHECK_CODE = '12345678';
const LEGACY_CHECK_CODE = '123';

test.describe('standalone multi-printer discovery flows', () => {
  test('modern discovery flow connects AD5X, 5M, and 5M Pro and tracks the active context in the UI', async ({
    page,
  }) => {
    test.slow();

    const [alphaTcpPort, alphaHttpPort, betaTcpPort, betaHttpPort, gammaTcpPort, gammaHttpPort] =
      await getDistinctFreePorts(6);

    let emulator: Awaited<ReturnType<typeof startEmulatorSupervisor>> | null = null;
    let server: Awaited<ReturnType<typeof startStandaloneServer>> | null = null;
    try {
      emulator = await startEmulatorSupervisor({
        instances: [
          {
            instanceId: 'alpha',
            model: 'adventurer-5x',
            serial: 'E2E-SN-ALPHA',
            checkCode: MODERN_CHECK_CODE,
            machineName: 'E2E-Alpha',
            tcpPort: alphaTcpPort,
            httpPort: alphaHttpPort,
            discoveryEnabled: true,
            simulationMode: 'auto',
            simulationSpeed: 1,
          },
          {
            instanceId: 'beta',
            model: 'adventurer-5m',
            serial: 'E2E-SN-BETA',
            checkCode: MODERN_CHECK_CODE,
            machineName: 'E2E-Beta',
            tcpPort: betaTcpPort,
            httpPort: betaHttpPort,
            discoveryEnabled: true,
            simulationMode: 'auto',
            simulationSpeed: 1,
          },
          {
            instanceId: 'gamma',
            model: 'adventurer-5m-pro',
            serial: 'E2E-SN-GAMMA',
            checkCode: MODERN_CHECK_CODE,
            machineName: 'E2E-Gamma',
            tcpPort: gammaTcpPort,
            httpPort: gammaHttpPort,
            discoveryEnabled: true,
            simulationMode: 'auto',
            simulationSpeed: 1,
          },
        ],
      });

      server = await startStandaloneServer();
      const webUi = new StandaloneWebUiPage(page);

      const alpha = emulator.readyPayloads.find((payload) => payload.instanceId === 'alpha');
      const beta = emulator.readyPayloads.find((payload) => payload.instanceId === 'beta');
      const gamma = emulator.readyPayloads.find((payload) => payload.instanceId === 'gamma');
      if (!alpha || !beta || !gamma) {
        throw new Error('Missing readiness payloads for modern multi-printer test');
      }

      await Promise.all([
        seedEmulatorRecentFile({
          httpPort: alpha.httpPort,
          serial: alpha.serial,
          checkCode: MODERN_CHECK_CODE,
          fileName: 'e2e-alpha.gcode',
        }),
        seedEmulatorRecentFile({
          httpPort: beta.httpPort,
          serial: beta.serial,
          checkCode: MODERN_CHECK_CODE,
          fileName: 'e2e-beta.gcode',
        }),
        seedEmulatorRecentFile({
          httpPort: gamma.httpPort,
          serial: gamma.serial,
          checkCode: MODERN_CHECK_CODE,
          fileName: 'e2e-gamma.gcode',
        }),
      ]);

      await webUi.goto(server.baseUrl);
      webUi.clearUnexpectedErrors();

      await webUi.connectDiscovery({
        printerName: 'E2E-Alpha',
        expectedPrinterName: 'E2E-Alpha',
        checkCode: MODERN_CHECK_CODE,
        expectsCheckCodePrompt: true,
        expectedContextCount: 1,
        preferredIpAddress: '127.0.0.1',
        preferredCommandPort: alpha.tcpPort,
      });
      await webUi.connectDiscovery({
        printerName: 'E2E-Beta',
        expectedPrinterName: 'E2E-Beta',
        checkCode: MODERN_CHECK_CODE,
        expectsCheckCodePrompt: true,
        expectedContextCount: 2,
        preferredIpAddress: '127.0.0.1',
        preferredCommandPort: beta.tcpPort,
      });
      await webUi.connectDiscovery({
        printerName: 'E2E-Gamma',
        expectedPrinterName: 'E2E-Gamma',
        checkCode: MODERN_CHECK_CODE,
        expectsCheckCodePrompt: true,
        expectedContextCount: 3,
        preferredIpAddress: '127.0.0.1',
        preferredCommandPort: gamma.tcpPort,
      });

      webUi.clearUnexpectedErrors();

      await webUi.switchContextByName('E2E-Alpha');
      await webUi.startRecentJob({ preferredFileName: 'e2e-alpha.gcode' });
      await waitForEmulatorDetail({
        httpPort: alpha.httpPort,
        serial: alpha.serial,
        checkCode: MODERN_CHECK_CODE,
        description: 'alpha print to start',
        predicate: (detail) =>
          detail.status === 'printing' && detail.printFileName === 'e2e-alpha.gcode',
      });
      await webUi.waitForCurrentJob('e2e-alpha.gcode');

      await webUi.switchContextByName('E2E-Beta');
      await webUi.waitForPrinterState('Ready');
      await webUi.startRecentJob({ preferredFileName: 'e2e-beta.gcode' });
      await waitForEmulatorDetail({
        httpPort: beta.httpPort,
        serial: beta.serial,
        checkCode: MODERN_CHECK_CODE,
        description: 'beta print to start',
        predicate: (detail) =>
          detail.status === 'printing' && detail.printFileName === 'e2e-beta.gcode',
      });
      await webUi.waitForCurrentJob('e2e-beta.gcode');

      await webUi.switchContextByName('E2E-Gamma');
      await webUi.waitForPrinterState('Ready');

      await webUi.switchContextByName('E2E-Alpha');
      await webUi.waitForCurrentJob('e2e-alpha.gcode');

      await webUi.switchContextByName('E2E-Beta');
      await webUi.waitForCurrentJob('e2e-beta.gcode');

      webUi.assertNoUnexpectedErrors();
    } finally {
      if (server) {
        await server.stop();
      }

      if (emulator) {
        await emulator.stop();
      }
    }
  });

  test('legacy discovery flow connects Adventurer 3 and Adventurer 4 and keeps the selected context in sync', async ({
    page,
  }) => {
    test.slow();

    const [a3TcpPort, a3HttpPort, a4TcpPort, a4HttpPort] = await getDistinctFreePorts(4);

    let emulator: Awaited<ReturnType<typeof startEmulatorSupervisor>> | null = null;
    let server: Awaited<ReturnType<typeof startStandaloneServer>> | null = null;
    try {
      emulator = await startEmulatorSupervisor({
        instances: [
          {
            instanceId: 'legacy-a3',
            model: 'adventurer-3',
            serial: 'E2E-SN-LEGACY-A3',
            checkCode: LEGACY_CHECK_CODE,
            machineName: 'E2E-Legacy-A3',
            tcpPort: a3TcpPort,
            httpPort: a3HttpPort,
            discoveryEnabled: true,
            simulationMode: 'auto',
            simulationSpeed: 1,
          },
          {
            instanceId: 'legacy-a4',
            model: 'adventurer-4',
            serial: 'E2E-SN-LEGACY-A4',
            checkCode: LEGACY_CHECK_CODE,
            machineName: 'E2E-Legacy-A4',
            tcpPort: a4TcpPort,
            httpPort: a4HttpPort,
            discoveryEnabled: true,
            simulationMode: 'auto',
            simulationSpeed: 1,
          },
        ],
      });

      server = await startStandaloneServer();
      const webUi = new StandaloneWebUiPage(page);

      const a3 = emulator.readyPayloads.find((payload) => payload.instanceId === 'legacy-a3');
      const a4 = emulator.readyPayloads.find((payload) => payload.instanceId === 'legacy-a4');
      if (!a3 || !a4) {
        throw new Error('Missing readiness payloads for legacy multi-printer test');
      }

      await Promise.all([
        seedEmulatorRecentFile({
          httpPort: a3.httpPort,
          serial: a3.serial,
          checkCode: LEGACY_CHECK_CODE,
          fileName: 'e2e-legacy-a3.gcode',
        }),
        seedEmulatorRecentFile({
          httpPort: a4.httpPort,
          serial: a4.serial,
          checkCode: LEGACY_CHECK_CODE,
          fileName: 'e2e-legacy-a4.gcode',
        }),
      ]);

      await webUi.goto(server.baseUrl);
      webUi.clearUnexpectedErrors();

      await webUi.connectDiscovery({
        printerName: 'E2E-Legacy-A3',
        expectedPrinterName: 'E2E-Legacy-A3',
        expectsCheckCodePrompt: false,
        expectedContextCount: 1,
        preferredIpAddress: '127.0.0.1',
        preferredCommandPort: a3.tcpPort,
      });
      await webUi.connectDiscovery({
        printerName: 'E2E-Legacy-A4',
        expectedPrinterName: 'E2E-Legacy-A4',
        expectsCheckCodePrompt: false,
        expectedContextCount: 2,
        preferredIpAddress: '127.0.0.1',
        preferredCommandPort: a4.tcpPort,
      });

      webUi.clearUnexpectedErrors();

      await webUi.switchContextByName('E2E-Legacy-A3');
      await webUi.startRecentJob({ preferredFileName: 'e2e-legacy-a3.gcode' });
      await waitForEmulatorDetail({
        httpPort: a3.httpPort,
        serial: a3.serial,
        checkCode: LEGACY_CHECK_CODE,
        description: 'legacy A3 print to start',
        predicate: (detail) =>
          detail.status === 'printing' &&
          detail.printFileName === 'e2e-legacy-a3.gcode',
      });
      await webUi.waitForCurrentJob('e2e-legacy-a3.gcode');

      await webUi.switchContextByName('E2E-Legacy-A4');
      await webUi.waitForPrinterState('Ready');
      await webUi.startRecentJob({ preferredFileName: 'e2e-legacy-a4.gcode' });
      await waitForEmulatorDetail({
        httpPort: a4.httpPort,
        serial: a4.serial,
        checkCode: LEGACY_CHECK_CODE,
        description: 'legacy A4 print to start',
        predicate: (detail) =>
          detail.status === 'printing' &&
          detail.printFileName === 'e2e-legacy-a4.gcode',
      });
      await webUi.waitForCurrentJob('e2e-legacy-a4.gcode');

      await webUi.switchContextByName('E2E-Legacy-A3');
      await webUi.waitForCurrentJob('e2e-legacy-a3.gcode');

      webUi.assertNoUnexpectedErrors();
    } finally {
      if (server) {
        await server.stop();
      }

      if (emulator) {
        await emulator.stop();
      }
    }
  });
});
