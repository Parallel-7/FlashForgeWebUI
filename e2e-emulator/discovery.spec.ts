/**
 * @fileoverview Headless discovery-based emulator lifecycle coverage for the standalone WebUI.
 */

import { test } from '@playwright/test';
import {
  AD5X_MULTI_COLOR_MAPPINGS,
  AD5X_SCENARIO,
  ALL_LIFECYCLE_SCENARIOS,
} from './helpers/scenarios';
import { runSingleModelFlow } from './helpers/lifecycle-runner';

test.describe('standalone emulator discovery flows', () => {
  for (const scenario of ALL_LIFECYCLE_SCENARIOS) {
    test(`discovery ${scenario.label}: connect + lifecycle + controls`, async ({ page }) => {
      test.slow();
      await runSingleModelFlow({
        page,
        scenario,
        connectionMode: 'discovery',
      });
    });
  }

  test('discovery AD5X: multi-color start + lifecycle + controls', async ({ page }) => {
    test.slow();
    await runSingleModelFlow({
      page,
      scenario: AD5X_SCENARIO,
      connectionMode: 'discovery',
      fileName: 'e2e-ad5x-discovery-multicolor.3mf',
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
});
