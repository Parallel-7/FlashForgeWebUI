/**
 * @fileoverview Jest coverage for backend bed/extruder heater routing.
 *
 * Covers the client-presence routing introduced for the Creator 5 series:
 * - HTTP-only backends (Creator 5 / 5 Pro, no legacy TCP client) must use the
 *   FiveMClient temperature-control API and never touch raw G-code.
 * - Legacy TCP-only backends (GenericLegacyBackend) must keep using the legacy
 *   G-code channel (`~M140` / `~M104` via the FlashForgeClient temp methods).
 * - Dual-API backends with both clients must prefer the legacy channel.
 *
 * The `@ghosttypes/ff-api` classes are replaced with in-memory doubles so the
 * `instanceof` routing inside the backends is exercised without sockets.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { BackendInitOptions, CommandResult } from '../types/printer-backend';

jest.mock('@ghosttypes/ff-api', () => {
  const actual = jest.requireActual<Record<string, unknown>>('@ghosttypes/ff-api');
  return {
    ...actual,
    FiveMClient: class {
      public readonly tempControl = {
        setBedTemp: jest.fn<(temp: number) => Promise<boolean>>(async () => true),
        cancelBedTemp: jest.fn<() => Promise<boolean>>(async () => true),
        setExtruderTemp: jest.fn<(temp: number) => Promise<boolean>>(async () => true),
        cancelExtruderTemp: jest.fn<() => Promise<boolean>>(async () => true),
      };
    },
    FlashForgeClient: class {
      public readonly setBedTemp = jest.fn<(temp: number) => Promise<boolean>>(async () => true);
      public readonly cancelBedTemp = jest.fn<() => Promise<boolean>>(async () => true);
      public readonly setExtruderTemp = jest.fn<(temp: number) => Promise<boolean>>(
        async () => true
      );
      public readonly cancelExtruderTemp = jest.fn<() => Promise<boolean>>(async () => true);
    },
  };
});

import { FiveMClient, FlashForgeClient } from '@ghosttypes/ff-api';
import { Adventurer5MBackend } from './Adventurer5MBackend';
import { Creator5Backend } from './Creator5Backend';
import { GenericLegacyBackend } from './GenericLegacyBackend';

interface TempControlDouble {
  readonly setBedTemp: jest.Mock<(temp: number) => Promise<boolean>>;
  readonly cancelBedTemp: jest.Mock<() => Promise<boolean>>;
  readonly setExtruderTemp: jest.Mock<(temp: number) => Promise<boolean>>;
  readonly cancelExtruderTemp: jest.Mock<() => Promise<boolean>>;
}

interface LegacyClientDouble {
  readonly setBedTemp: jest.Mock<(temp: number) => Promise<boolean>>;
  readonly cancelBedTemp: jest.Mock<() => Promise<boolean>>;
  readonly setExtruderTemp: jest.Mock<(temp: number) => Promise<boolean>>;
  readonly cancelExtruderTemp: jest.Mock<() => Promise<boolean>>;
}

function createFiveMClient(): FiveMClient {
  return new FiveMClient('127.0.0.1', 'FFSN01', 'CODE01');
}

function httpTempControl(client: FiveMClient): TempControlDouble {
  return (client as unknown as { tempControl: TempControlDouble }).tempControl;
}

function createLegacyClient(): FlashForgeClient {
  return new FlashForgeClient('127.0.0.1');
}

function legacyDouble(client: FlashForgeClient): LegacyClientDouble {
  return client as unknown as LegacyClientDouble;
}

function backendOptions(
  printerModel: BackendInitOptions['printerModel'],
  primaryClient: FiveMClient | FlashForgeClient,
  secondaryClient?: FlashForgeClient
): BackendInitOptions {
  return {
    printerModel,
    primaryClient,
    secondaryClient,
    printerDetails: {
      name: 'Test Printer',
      ipAddress: '127.0.0.1',
      serialNumber: 'FFSN01',
      typeName: 'FlashForge Test',
    },
  };
}

function createCreator5Backend(): { backend: Creator5Backend; tempControl: TempControlDouble } {
  const fiveMClient = createFiveMClient();
  const backend = new Creator5Backend(backendOptions('creator-5', fiveMClient));
  return { backend, tempControl: httpTempControl(fiveMClient) };
}

function createDualBackend(): {
  backend: Adventurer5MBackend;
  tempControl: TempControlDouble;
  legacy: LegacyClientDouble;
} {
  const fiveMClient = createFiveMClient();
  const legacyClient = createLegacyClient();
  const backend = new Adventurer5MBackend(
    backendOptions('adventurer-5m', fiveMClient, legacyClient)
  );
  return {
    backend,
    tempControl: httpTempControl(fiveMClient),
    legacy: legacyDouble(legacyClient),
  };
}

function createLegacyBackend(): { backend: GenericLegacyBackend; legacy: LegacyClientDouble } {
  const legacyClient = createLegacyClient();
  const backend = new GenericLegacyBackend(backendOptions('generic-legacy', legacyClient));
  return { backend, legacy: legacyDouble(legacyClient) };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Creator5Backend heater routing (HTTP-only, no legacy client)', () => {
  it('sets the bed temperature through the HTTP temperature-control API', async () => {
    const { backend, tempControl } = createCreator5Backend();
    const gcodeSpy = jest.spyOn(backend, 'executeGCodeCommand');

    const result = await backend.setBedTemperature(60);

    expect(result.success).toBe(true);
    expect(tempControl.setBedTemp).toHaveBeenCalledTimes(1);
    expect(tempControl.setBedTemp).toHaveBeenCalledWith(60);
    expect(gcodeSpy).not.toHaveBeenCalled();
  });

  it('cancels bed heating through the HTTP temperature-control API', async () => {
    const { backend, tempControl } = createCreator5Backend();

    const result = await backend.cancelBedTemperature();

    expect(result.success).toBe(true);
    expect(tempControl.cancelBedTemp).toHaveBeenCalledTimes(1);
    expect(tempControl.setBedTemp).not.toHaveBeenCalled();
  });

  it('sets and cancels the extruder temperature through the HTTP temperature-control API', async () => {
    const { backend, tempControl } = createCreator5Backend();

    const setResult = await backend.setExtruderTemperature(210);
    expect(setResult.success).toBe(true);
    expect(tempControl.setExtruderTemp).toHaveBeenCalledWith(210);

    const cancelResult = await backend.cancelExtruderTemperature();
    expect(cancelResult.success).toBe(true);
    expect(tempControl.cancelExtruderTemp).toHaveBeenCalledTimes(1);
  });

  it('maps HTTP temperature-control failures to an unsuccessful CommandResult', async () => {
    const { backend, tempControl } = createCreator5Backend();
    tempControl.setBedTemp.mockRejectedValueOnce(new Error('HTTP request failed'));

    const result = await backend.setBedTemperature(60);

    expect(result.success).toBe(false);
    expect(result.error).toBe('HTTP request failed');
  });

  it('maps a rejected HTTP temperature-control command to an unsuccessful CommandResult', async () => {
    const { backend, tempControl } = createCreator5Backend();
    tempControl.cancelExtruderTemp.mockResolvedValueOnce(false);

    const result = await backend.cancelExtruderTemperature();

    expect(result.success).toBe(false);
    expect(result.error).toBe('Temperature command failed');
  });
});

describe('DualAPIBackend heater routing (legacy TCP preferred)', () => {
  it('prefers the legacy TCP client for the bed heater', async () => {
    const { backend, tempControl, legacy } = createDualBackend();

    const result = await backend.setBedTemperature(60);

    expect(result.success).toBe(true);
    expect(legacy.setBedTemp).toHaveBeenCalledTimes(1);
    expect(legacy.setBedTemp).toHaveBeenCalledWith(60);
    expect(tempControl.setBedTemp).not.toHaveBeenCalled();
  });

  it('prefers the legacy TCP client for canceling the bed heater', async () => {
    const { backend, tempControl, legacy } = createDualBackend();

    const result = await backend.cancelBedTemperature();

    expect(result.success).toBe(true);
    expect(legacy.cancelBedTemp).toHaveBeenCalledTimes(1);
    expect(tempControl.cancelBedTemp).not.toHaveBeenCalled();
  });

  it('prefers the legacy TCP client for the extruder heater', async () => {
    const { backend, tempControl, legacy } = createDualBackend();

    const result = await backend.setExtruderTemperature(210);

    expect(result.success).toBe(true);
    expect(legacy.setExtruderTemp).toHaveBeenCalledTimes(1);
    expect(legacy.setExtruderTemp).toHaveBeenCalledWith(210);
    expect(tempControl.setExtruderTemp).not.toHaveBeenCalled();
  });

  it('prefers the legacy TCP client for canceling the extruder heater', async () => {
    const { backend, tempControl, legacy } = createDualBackend();

    const result = await backend.cancelExtruderTemperature();

    expect(result.success).toBe(true);
    expect(legacy.cancelExtruderTemp).toHaveBeenCalledTimes(1);
    expect(tempControl.cancelExtruderTemp).not.toHaveBeenCalled();
  });

  it('maps legacy client failures to an unsuccessful CommandResult', async () => {
    const { backend, legacy } = createDualBackend();
    legacy.setExtruderTemp.mockRejectedValueOnce(new Error('socket hang up'));

    const result = await backend.setExtruderTemperature(210);

    expect(result.success).toBe(false);
    expect(result.error).toBe('socket hang up');
  });
});

describe('GenericLegacyBackend heater routing (TCP G-code only)', () => {
  it('sets the bed temperature through the legacy G-code channel', async () => {
    const { backend, legacy } = createLegacyBackend();

    const result = await backend.setBedTemperature(60);

    expect(result.success).toBe(true);
    expect(legacy.setBedTemp).toHaveBeenCalledTimes(1);
    expect(legacy.setBedTemp).toHaveBeenCalledWith(60);
  });

  it('cancels bed heating through the legacy G-code channel', async () => {
    const { backend, legacy } = createLegacyBackend();

    const result = await backend.cancelBedTemperature();

    expect(result.success).toBe(true);
    expect(legacy.cancelBedTemp).toHaveBeenCalledTimes(1);
  });

  it('sets and cancels the extruder temperature through the legacy G-code channel', async () => {
    const { backend, legacy } = createLegacyBackend();

    const setResult = await backend.setExtruderTemperature(210);
    expect(setResult.success).toBe(true);
    expect(legacy.setExtruderTemp).toHaveBeenCalledWith(210);

    const cancelResult = await backend.cancelExtruderTemperature();
    expect(cancelResult.success).toBe(true);
    expect(legacy.cancelExtruderTemp).toHaveBeenCalledTimes(1);
  });

  it('maps legacy G-code failures to an unsuccessful CommandResult', async () => {
    const { backend, legacy } = createLegacyBackend();
    legacy.setBedTemp.mockRejectedValueOnce(new Error('write EPIPE'));

    const result: CommandResult = await backend.setBedTemperature(60);

    expect(result.success).toBe(false);
    expect(result.error).toBe('write EPIPE');
  });
});
