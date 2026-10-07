/**
 * @fileoverview Lifecycle tests for the real WebUIManager start()/stop() paths:
 * concurrent start() callers share one bind attempt, a failed attempt can be
 * retried, and stop() waits for an in-flight start instead of being undone by it.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const configManager = Object.assign(new EventEmitter(), {
  getConfig: jest.fn<() => Record<string, unknown>>(),
  get: jest.fn(() => true),
});

const environmentService = {
  getWebUIStaticPath: jest.fn<() => string>(),
  getEnvironmentInfo: jest.fn(() => ({ isPackaged: false })),
};

const webSocketManager = {
  initialize: jest.fn(),
  shutdown: jest.fn(),
  handleUpgrade: jest.fn(),
};

jest.mock('../../managers/ConfigManager', () => ({
  getConfigManager: () => configManager,
}));

jest.mock('../../services/EnvironmentService', () => ({
  getEnvironmentService: () => environmentService,
}));

jest.mock('./AuthManager', () => ({
  getAuthManager: () => ({ isAuthenticationRequired: () => false }),
}));

jest.mock('./WebSocketManager', () => ({
  getWebSocketManager: () => webSocketManager,
}));

jest.mock('./api-routes', () => {
  const express = jest.requireActual<typeof import('express')>('express');
  return {
    buildRouteDependencies: () => ({}),
    createAPIRoutes: () => express.Router(),
  };
});

jest.mock('./auth-middleware', () => {
  const passThrough = () => (_req: unknown, _res: unknown, next: () => void) => next();
  return {
    createRequestLogger: passThrough,
    createLoginRateLimiter: passThrough,
    createErrorMiddleware: () => (_err: unknown, _req: unknown, _res: unknown, next: () => void) => next(),
  };
});

jest.mock('./routes/theme-routes', () => ({
  registerPublicThemeRoutes: jest.fn(),
}));

jest.mock('./upload-staging', () => ({
  disposeUploadStaging: jest.fn(async () => {}),
}));

import { getWebUIManager, WebUIManager } from './WebUIManager';

describe('WebUIManager lifecycle', () => {
  let staticDir: string;

  beforeAll(() => {
    staticDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffwebui-lifecycle-'));
    fs.writeFileSync(path.join(staticDir, 'index.html'), '<!DOCTYPE html><html></html>', 'utf8');
  });

  afterAll(() => {
    fs.rmSync(staticDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (WebUIManager as unknown as { instance: unknown }).instance = null;
    environmentService.getWebUIStaticPath.mockReturnValue(staticDir);
    configManager.getConfig.mockReturnValue({
      WebUIEnabled: true,
      WebUIPort: 0,
      WebUIPassword: '',
      WebUIPasswordRequired: false,
    });
  });

  afterEach(async () => {
    await getWebUIManager().stop();
    (WebUIManager as unknown as { instance: unknown }).instance = null;
  });

  it('shares one start attempt between concurrent start() callers', async () => {
    const manager = getWebUIManager();
    const results = await Promise.all([manager.start(), manager.start()]);

    expect(results).toEqual([true, true]);
    // One attempt means one server build; a second would have rebound the port.
    expect(webSocketManager.initialize).toHaveBeenCalledTimes(1);
    expect(manager.getStatus().isRunning).toBe(true);
  });

  it('retries after an attempt that failed before its first await', async () => {
    configManager.getConfig.mockImplementationOnce(() => {
      throw new Error('config unavailable');
    });

    const manager = getWebUIManager();

    expect(await manager.start()).toBe(false);
    expect(await manager.start()).toBe(true);
    expect(manager.getStatus().isRunning).toBe(true);
  });

  it('waits for an in-flight start before stopping', async () => {
    const manager = getWebUIManager();
    const starting = manager.start();
    const stopped = await manager.stop();

    expect(await starting).toBe(true);
    expect(stopped).toBe(true);
    expect(manager.getStatus().isRunning).toBe(false);
    expect(manager.getHttpServer()).toBeNull();
  });
});
