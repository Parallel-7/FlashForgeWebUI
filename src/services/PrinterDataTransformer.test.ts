/**
 * @fileoverview Tests for PrinterDataTransformer Creator 5 multi-tool normalization.
 *
 * Regression guard for the tool/chamber temperature mapping: `Creator5Backend`
 * surfaces raw ff-api `Temperature` entries shaped `{ current, set }` (NOT
 * `{ current, target }`), so the transformer must read `set` for the per-tool
 * target. Reading `target` silently defaulted every nozzle target to 0.
 */

import { afterAll, describe, expect, it, jest } from '@jest/globals';

const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

import { printerDataTransformer } from './PrinterDataTransformer';

describe('PrinterDataTransformer — Creator 5 multi-tool', () => {
  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('maps per-tool target temperatures from the ff-api `set` key', () => {
    const status = printerDataTransformer.transformPrinterStatus({
      printerState: 'printing',
      bedTemperature: 60,
      bedTargetTemperature: 65,
      // Raw ff-api ToolTemps: current/`set` pairs, one per nozzle.
      toolTemps: [
        { current: 230, set: 235 },
        { current: 24, set: 0 },
        { current: 200, set: 200 },
        { current: 25, set: 0 },
      ],
      hasChamberControl: true,
      chamberTemp: 40,
      chamberTargetTemp: 50,
    });

    expect(status).not.toBeNull();
    // Targets must come from `set`, not a non-existent `target` key (which would be 0).
    expect(status?.toolTemps).toEqual([
      { current: 230, target: 235, isHeating: true },
      { current: 24, target: 0, isHeating: false },
      { current: 200, target: 200, isHeating: false },
      { current: 25, target: 0, isHeating: false },
    ]);
    // Chamber uses `set` semantics too (via chamberTargetTemp) and surfaces on temperatures.
    expect(status?.temperatures.chamber).toEqual({
      current: 40,
      target: 50,
      isHeating: true,
    });
  });

  it('omits toolTemps and chamber for single-nozzle printers', () => {
    const status = printerDataTransformer.transformPrinterStatus({
      printerState: 'ready',
      bedTemperature: 25,
      bedTargetTemperature: 0,
      nozzleTemperature: 26,
      nozzleTargetTemperature: 0,
    });

    expect(status).not.toBeNull();
    expect(status?.toolTemps).toBeUndefined();
    expect(status?.temperatures.chamber).toBeUndefined();
  });
});
