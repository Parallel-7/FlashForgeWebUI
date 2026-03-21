/**
 * @fileoverview Focused unit tests for DiscordNotificationService timer and payload behavior.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import type { ConfigManager } from '../../../managers/ConfigManager';
import type {
  PrinterContext,
  PrinterContextManager,
} from '../../../managers/PrinterContextManager';
import type { PrinterStatus } from '../../../types/polling';
import type { ContextRemovedEvent } from '../../../types/printer';
import { PrintStateMonitor } from '../../PrintStateMonitor';
import { TemperatureMonitoringService } from '../../TemperatureMonitoringService';
import { DiscordNotificationService } from '../DiscordNotificationService';

type MockDiscordConfig = {
  DiscordSync: boolean;
  DiscordIncludeCameraSnapshots: boolean;
  WebhookUrl: string;
  DiscordUpdateIntervalMinutes: number;
};

class MockConfigManager extends EventEmitter {
  private config: MockDiscordConfig;

  constructor(overrides: Partial<MockDiscordConfig> = {}) {
    super();
    this.config = {
      DiscordSync: true,
      DiscordIncludeCameraSnapshots: false,
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
  private readonly contexts = new Map<string, PrinterContext>();

  constructor(initialContexts: PrinterContext[] = []) {
    super();
    initialContexts.forEach((context) => {
      this.contexts.set(context.id, context);
    });
  }

  public getAllContexts(): PrinterContext[] {
    return Array.from(this.contexts.values());
  }

  public getContext(contextId: string): PrinterContext | undefined {
    return this.contexts.get(contextId);
  }

  public removeContext(contextId: string): void {
    if (!this.contexts.has(contextId)) {
      return;
    }

    this.contexts.delete(contextId);
    const event: ContextRemovedEvent = {
      contextId,
      wasActive: false,
    };
    this.emit('context-removed', event);
  }
}

function asConfigManager(manager: MockConfigManager): ConfigManager {
  return manager as unknown as ConfigManager;
}

function asContextManager(manager: MockContextManager): PrinterContextManager {
  return manager as unknown as PrinterContextManager;
}

function createContext(contextId: string): PrinterContext {
  return {
    id: contextId,
    name: `Printer ${contextId}`,
    printerDetails: {
      Name: `Printer ${contextId}`,
      IPAddress: '192.168.1.100',
      SerialNumber: contextId,
      CheckCode: '12345678',
      ClientType: 'new',
      printerModel: 'Flashforge AD5X',
      modelType: 'ad5x',
      customCameraEnabled: false,
      customCameraUrl: '',
      customLedsEnabled: false,
      forceLegacyMode: false,
    },
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
    global.fetch = jest.fn(
      async () =>
        ({
          ok: true,
          status: 204,
          statusText: 'No Content',
        }) as Response
    ) as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  it('creates only one periodic timer across multiple registered contexts', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    const service = new DiscordNotificationService(
      asConfigManager(new MockConfigManager()),
      asContextManager(new MockContextManager([createContext('ctx-1'), createContext('ctx-2')]))
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
    const service = new DiscordNotificationService(
      asConfigManager(new MockConfigManager()),
      asContextManager(contextManager)
    );

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
      asConfigManager(new MockConfigManager()),
      asContextManager(new MockContextManager([createContext('ctx-1')]))
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

  it('uploads multipart webhook bodies when snapshots are enabled for periodic updates', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const service = new DiscordNotificationService(
      asConfigManager(
        new MockConfigManager({
          DiscordIncludeCameraSnapshots: true,
        })
      ),
      asContextManager(new MockContextManager([createContext('ctx-1')]))
    );

    Object.defineProperty(service, 'go2rtcService', {
      configurable: true,
      value: {
        captureSnapshot: jest.fn(async () => ({
          bytes: new Uint8Array([1, 2, 3]),
          contentType: 'image/jpeg',
          filename: 'printer_ctx-1-snapshot.jpg',
        })),
      },
    });

    service.initialize();
    service.registerContext('ctx-1');
    service.updatePrinterStatus('ctx-1', createStatus('cube-1.gx'));

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit?.body).toBeInstanceOf(FormData);

    const body = requestInit?.body as FormData;
    const payload = JSON.parse(String(body.get('payload_json')));

    expect(payload.embeds[0].image?.url).toBe('attachment://printer_ctx-1-snapshot.jpg');
    expect(body.get('files[0]')).not.toBeNull();

    service.dispose();
  });

  it('falls back to JSON webhook bodies when snapshots are unavailable', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const service = new DiscordNotificationService(
      asConfigManager(
        new MockConfigManager({
          DiscordIncludeCameraSnapshots: true,
        })
      ),
      asContextManager(new MockContextManager([createContext('ctx-1')]))
    );

    Object.defineProperty(service, 'go2rtcService', {
      configurable: true,
      value: {
        captureSnapshot: jest.fn(async () => null),
      },
    });

    service.initialize();
    await service.notifyPrintComplete('ctx-1', 'cube-1.gx', 3600);

    const [, requestInit] = fetchMock.mock.calls[0];
    expect(requestInit?.body).not.toBeInstanceOf(FormData);
    expect(requestInit?.headers).toEqual({
      'Content-Type': 'application/json',
    });

    const payload = JSON.parse(String(requestInit?.body));
    expect(payload.embeds[0].image).toBeUndefined();

    service.dispose();
  });

  it('stops the periodic timer when the last context is removed', async () => {
    const contextManager = new MockContextManager([createContext('ctx-1')]);
    const service = new DiscordNotificationService(
      asConfigManager(new MockConfigManager()),
      asContextManager(contextManager)
    );

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
      asConfigManager(
        new MockConfigManager({
          DiscordSync: false,
          WebhookUrl: '',
        })
      ),
      asContextManager(new MockContextManager([createContext('ctx-1')]))
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

  it('refreshes config during initialize when webhook settings changed before startup', async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    const configManager = new MockConfigManager({
      DiscordSync: false,
      WebhookUrl: '',
    });
    const service = new DiscordNotificationService(
      asConfigManager(configManager),
      asContextManager(new MockContextManager([createContext('ctx-1')]))
    );

    configManager.updateConfig({
      DiscordSync: true,
      WebhookUrl: 'https://discord.example/webhook',
    });

    service.initialize();
    service.registerContext('ctx-1');
    service.updatePrinterStatus('ctx-1', createStatus('cube-1.gx'));

    await jest.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    service.dispose();
  });

  it('removes attached monitor listeners when a context is unregistered', () => {
    const service = new DiscordNotificationService(
      asConfigManager(new MockConfigManager()),
      asContextManager(new MockContextManager([createContext('ctx-1')]))
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
