/**
 * @fileoverview Headless direct-connection emulator lifecycle coverage for the standalone WebUI.
 */

import { test } from '@playwright/test';
import {
  AD5X_MULTI_COLOR_MAPPINGS,
  AD5X_SCENARIO,
  ALL_LIFECYCLE_SCENARIOS,
  createForceLegacySeededPrinter,
  FORCE_LEGACY_DIRECT_SCENARIOS,
} from './helpers/scenarios';
import { runSingleModelFlow } from './helpers/lifecycle-runner';

test.describe('standalone emulator direct flows', () => {
  for (const scenario of ALL_LIFECYCLE_SCENARIOS) {
    test(`direct ${scenario.label}: connect + lifecycle + controls`, async ({ page }) => {
      test.slow();
      await runSingleModelFlow({
        page,
        scenario,
        connectionMode: 'direct',
      });
    });
  }

  test('direct AD5X: multi-color start + lifecycle + controls', async ({ page }) => {
    test.slow();
    await runSingleModelFlow({
      page,
      scenario: AD5X_SCENARIO,
      connectionMode: 'direct',
      fileName: 'e2e-ad5x-direct-multicolor.3mf',
      seedFile: {
        gcodeToolCnt: AD5X_MULTI_COLOR_MAPPINGS.length,
        useMatlStation: true,
        materialMappings: AD5X_MULTI_COLOR_MAPPINGS,
      },
      expectMaterialMatching: true,
      materialSlotAssignments: AD5X_MULTI_COLOR_MAPPINGS.map((mapping) => ({
        toolId: mapping.toolId,
        slotId: mapping.slotId,
      })),
    });
  });

  for (const scenario of FORCE_LEGACY_DIRECT_SCENARIOS) {
    test(`direct ${scenario.label}: reconnect saved + lifecycle + controls`, async ({ page }) => {
      test.slow();
      await runSingleModelFlow({
        page,
        scenario,
        connectionMode: 'saved',
        seededPrinters: [
          createForceLegacySeededPrinter({
            scenario,
            ipAddress: '127.0.0.1',
            commandPort: 8899,
            httpPort: 8898,
          }),
        ],
      });
    });
  }
});
