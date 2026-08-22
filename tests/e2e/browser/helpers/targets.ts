/**
 * @fileoverview Per-model emulator matrix for browser E2E suites.
 *
 * Ported from FlashForgeUI-Electron's `support/track.ts` pattern: one source of
 * truth listing every emulated model the suite must exercise, each carrying the
 * capability flags assertions derive from. Specs loop this list so a new model is
 * covered everywhere by construction instead of by whichever models a spec author
 * remembered to hand-pick.
 *
 * The matrix matches FlashForgeUI-Electron's emulator track (four models). All
 * four sit on distinct ports so a single server instance can hold them at once;
 * suites run sequentially (playwright workers: 1), so reusing the same ports
 * across suites is fine.
 */

import type { EmulatorModel } from './emulator-harness';
import type { StandalonePrinter } from './standalone-server';

export type ModelToken = Exclude<EmulatorModel, 'adventurer-3' | 'adventurer-4'>;

/**
 * USB product ID every real unit of this model carries; the discovery packet and
 * the manual-connect model selector both use it, and HTTP-only models cannot be
 * connected without it (it is what skips the legacy TCP probe).
 */
export const MODEL_PRODUCT_IDS: Readonly<Record<ModelToken, number>> = {
  'adventurer-5m': 35,
  'adventurer-5m-pro': 36,
  'adventurer-5x': 38,
  'creator-5': 40,
  'creator-5-pro': 41,
};

export interface ModelTarget {
  readonly printer: StandalonePrinter;
  /** USB product ID the manual connect API needs (see MODEL_PRODUCT_IDS). */
  readonly productId: number;
  /** printerModel display string the app's detection reports for this model. */
  readonly printerModel: string;
  /**
   * Creator 5 series: HTTP-only firmware with no TCP/G-code passthrough. Local and
   * recent job entry points are gated off and raw G-code controls (Home Axes) stay
   * disabled.
   */
  readonly isCreator5Series: boolean;
  /** Models carrying an inventory/material feed station (IFS). */
  readonly hasMaterialStation: boolean;
}

export const MODEL_TARGETS: readonly ModelTarget[] = [
  {
    printer: {
      label: 'Adventurer 5M Pro (emulated)',
      model: 'adventurer-5m-pro',
      serial: 'E2E-WEBUI-M-5MPRO',
      checkCode: '123',
      machineName: 'Matrix-5MPro',
      tcpPort: 8899,
      httpPort: 8898,
    },
    isCreator5Series: false,
    hasMaterialStation: false,
    productId: MODEL_PRODUCT_IDS['adventurer-5m-pro'],
    printerModel: 'Adventurer 5M Pro',
  },
  {
    printer: {
      label: 'AD5X (emulated)',
      model: 'adventurer-5x',
      serial: 'E2E-WEBUI-M-AD5X',
      checkCode: '123',
      machineName: 'Matrix-AD5X',
      tcpPort: 8999,
      httpPort: 8998,
    },
    isCreator5Series: false,
    hasMaterialStation: true,
    productId: MODEL_PRODUCT_IDS['adventurer-5x'],
    printerModel: 'AD5X',
  },
  {
    printer: {
      label: 'Creator 5 (emulated)',
      model: 'creator-5',
      serial: 'E2E-WEBUI-M-C5',
      checkCode: '123',
      machineName: 'Matrix-Creator5',
      tcpPort: 9099,
      httpPort: 9098,
    },
    isCreator5Series: true,
    hasMaterialStation: true,
    productId: MODEL_PRODUCT_IDS['creator-5'],
    printerModel: 'Creator 5',
  },
  {
    printer: {
      label: 'Creator 5 Pro (emulated)',
      model: 'creator-5-pro',
      serial: 'E2E-WEBUI-M-C5PRO',
      checkCode: '123',
      machineName: 'Matrix-Creator5Pro',
      tcpPort: 9199,
      httpPort: 9198,
    },
    isCreator5Series: true,
    hasMaterialStation: true,
    productId: MODEL_PRODUCT_IDS['creator-5-pro'],
    printerModel: 'Creator 5 Pro',
  },
];

/** The matrix as a plain printer list, for startStandaloneWebUI({ printers }). */
export const MATRIX_PRINTERS: readonly StandalonePrinter[] = MODEL_TARGETS.map(
  (target) => target.printer
);
