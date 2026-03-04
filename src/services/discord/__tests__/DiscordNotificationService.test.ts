/**
 * @fileoverview Focused unit tests for DiscordNotificationService timer and payload behavior.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import type { PrinterStatus } from '../../../types/polling';
import { PrintStateMonitor } from '../../PrintStateMonitor';
import { TemperatureMonitoringService } from '../../TemperatureMonitoringService';
import { DiscordNotificationService } from '../DiscordNotificationService';

type MockDiscordConfig = {
  DiscordSync: boolean;
  WebhookUrl: string;
  DiscordUpdateIntervalMinutes: number;
};

class MockConfigManager extends EventEmitter {
  private config: MockDiscordConfig;

  constructor(overrides: Partial<MockDiscordConfig> = {}) {
    super();
    this.config = {
      DiscordSync: true,
      WebhookUrl: 'https://discord.example/webhook',
      DiscordUpdateIntervalMinutes: 5,
      ...overrides,
    };
  }

  public getConfig(): MockDiscordConfig {
    return this.config;
  }

  public updateConfig(next: Partial<MockDiscordConfig>): void {
    this.config = {
      ...this.config,
      ...next,
    };

    this.emit('configUpdated', {
      changedKeys: Object.keys(next),
    });
  }
}

class MockContextManager extends EventEmitter {
  private readonly contexts = new Map<string, any>();

  constructor(initialContexts: any[] = []) {
    super();
    initialContexts.forEach((context) => {
      this.contexts.set(context.id, context);
    });
  }

  public getAllContexts(): any[] {
    return Array.from(this.contexts.values());
  }

  public getContext(contextId: string): any | undefined {
    return this.contexts.get(contextId);
  }

  public removeContext(contextId: string): void {
    if (!this.contexts.has(contextId)) {
      return;
    }

    this.contexts.delete(contextId);
    this.emit('context-removed', {
      contextId,
      wasActive: false,
    });
  }
}

function createContext(contextId: string): any {
  return {
    id: contextId,
    name: `Printer ${contextId}`,
    printerDetails: {},
    backend: null,
    connectionState: 'connected',
    pollingService: null,
    notificationCoordinator: null,
    isActive: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    lastActivity: new Date('2026-01-01T00:00:00.000Z'),
    activeSpoolId: null,
    activeSpoolData: null,
  };
}

function createStatus(fileName: string): PrinterStatus {
  return {
    state: 'Printing',
    temperatures: {
      bed: {
        current: 55,
        target: 60,
        isHeating: false,
      },
      extruder: {
        current: 210,
        target: 215,
        isHeating: false,
      },
    },
    fans: {
      coolingFan: 100,
      chamberFan: 0,
    },
    filtration: {
      mode: 'none',
      tvocLevel: 0,
      available: false,
    },
    settings: {},
    currentJob: {
      fileName,
      displayName: fileName,
      startTime: new Date('2026-01-01T00:00:00.000Z'),
      progress: {
        percentage: 50,
        currentLayer: 10,
        totalLayers: 20,
        timeRemaining: 30,
        elapsedTime: 60,
        elapsedTimeSeconds: 3600,
        weightUsed: 10,
        lengthUsed: 2,
        formattedEta: '01:30',
      },
      isActive: true,
    },
    connectionStatus: 'connected',
    lastUpdate: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('DiscordNotificationService', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 204,
      statusText: 'No Content',
    } as Response)) as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('creates only one periodic timer across multiple registered contexts', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const service = new DiscordNotificationService(
      new MockConfigManager() as any,
      new MockContextManager([createContext('ctx-1'), createContext('ctx-2')]) as any
    );

    service.initialize();
    service.registerContext('ctx-1');
    service.registerContext('ctx-2');

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    service.dispose();
  });

  it('sends one periodic update per connected context on each interval', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const contextManager = new MockContextManager([createContext('ctx-1'), createContext('ctx-2')]);
    const service = new DiscordNotificationService(new MockConfigManager() as any, contextManager as any);

    service.initialize();
    service.registerContext('ctx-1');
    service.registerContext('ctx-2');
    service.updatePrinterStatus('ctx-1', createStatus('cube-1.gx'));
    service.updatePrinterStatus('ctx-2', createStatus('cube-2.gx'));

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000 + 1_500);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    service.dispose();
  });

  it('uses elapsed seconds and formatted firmware ETA in webhook payloads', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const service = new DiscordNotificationService(
      new MockConfigManager() as any,
      new MockContextManager([createContext('ctx-1')]) as any
    );

    service.initialize();
    service.registerContext('ctx-1');
    service.updatePrinterStatus('ctx-1', createStatus('cube-1.gx'));

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);

    const [, requestInit] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(requestInit?.body));
    const fields = payload.embeds[0].fields as Array<{ name: string; value: string }>;
    const printTimeField = fields.find((field) => field.name === 'Print Time');
    const etaField = fields.find((field) => field.name === 'ETA');

    expect(printTimeField?.value).toBe('1h 0m');
    expect(etaField?.value).toBeDefined();

    service.dispose();
  });

  it('stops the periodic timer when the last context is removed', async () => {
    const contextManager = new MockContextManager([createContext('ctx-1')]);
    const service = new DiscordNotificationService(new MockConfigManager() as any, contextManager as any);

    service.initialize();
    service.registerContext('ctx-1');

    expect(jest.getTimerCount()).toBe(1);

    contextManager.removeContext('ctx-1');

    expect(jest.getTimerCount()).toBe(0);

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000 + 1_500);
    expect(global.fetch).not.toHaveBeenCalled();

    service.dispose();
  });

  it('does not send idle-transition notifications when Discord is disabled', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const service = new DiscordNotificationService(
      new MockConfigManager({
        DiscordSync: false,
        WebhookUrl: '',
      }) as any,
      new MockContextManager([createContext('ctx-1')]) as any
    );

    service.initialize();
    service.registerContext('ctx-1');
    service.updatePrinterStatus('ctx-1', createStatus('cube-1.gx'));
    service.updatePrinterStatus('ctx-1', {
      ...createStatus('cube-1.gx'),
      state: 'Ready',
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalled();

    service.dispose();
  });

  it('removes attached monitor listeners when a context is unregistered', () => {
    const service = new DiscordNotificationService(
      new MockConfigManager() as any,
      new MockContextManager([createContext('ctx-1')]) as any
    );
    const stateMonitor = new PrintStateMonitor('ctx-1');
    const temperatureMonitor = new TemperatureMonitoringService('ctx-1');

    service.initialize();
    service.registerContext('ctx-1');
    service.attachContextMonitors('ctx-1', stateMonitor, temperatureMonitor);

    expect(stateMonitor.listenerCount('print-completed')).toBe(1);
    expect(temperatureMonitor.listenerCount('printer-cooled')).toBe(1);

    service.unregisterContext('ctx-1');

    expect(stateMonitor.listenerCount('print-completed')).toBe(0);
    expect(temperatureMonitor.listenerCount('printer-cooled')).toBe(0);

    service.dispose();
  });
});
