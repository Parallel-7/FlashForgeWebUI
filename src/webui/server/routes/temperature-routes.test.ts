/**
 * @fileoverview Jest coverage for WebUI bed/extruder temperature route handlers.
 *
 * Asserts the single-tool heater routes delegate to backend-manager temperature
 * commands (which route HTTP-only printers such as the Creator 5 series onto
 * the HTTP temperature-control API) instead of raw G-code, along with request
 * validation, multi-context routing, and error responses.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import type { CommandResult } from '../../../types/printer-backend';
import { startTestServer } from './test-server';
import { registerTemperatureRoutes } from './temperature-routes';

function okResult(): CommandResult {
  return { success: true, timestamp: new Date() };
}

function createDependencies() {
  return {
    backendManager: {
      isBackendReady: jest.fn<(contextId: string) => boolean>(() => true),
      setBedTemperature: jest.fn<
        (contextId: string, temperature: number) => Promise<CommandResult>
      >(async () => okResult()),
      cancelBedTemperature: jest.fn<(contextId: string) => Promise<CommandResult>>(async () =>
        okResult()
      ),
      setExtruderTemperature: jest.fn<
        (contextId: string, temperature: number) => Promise<CommandResult>
      >(async () => okResult()),
      cancelExtruderTemperature: jest.fn<(contextId: string) => Promise<CommandResult>>(async () =>
        okResult()
      ),
      executeGCodeCommand: jest.fn<(contextId: string, command: string) => Promise<unknown>>(),
    },
    contextManager: {
      getActiveContextId: jest.fn<() => string | null>(() => 'context-1'),
      getContext: jest.fn<(contextId: string) => unknown>((contextId) =>
        contextId === 'context-1' || contextId === 'context-2'
          ? { id: contextId, printerDetails: {} }
          : undefined
      ),
    },
    connectionManager: {},
    configManager: {},
    spoolmanService: {},
    // biome-ignore lint/suspicious/noExplicitAny: test double for RouteDependencies
  } as any;
}

interface TestDeps {
  // biome-ignore lint/suspicious/noExplicitAny: test double for RouteDependencies
  backendManager: any;
  // biome-ignore lint/suspicious/noExplicitAny: test double for RouteDependencies
  contextManager: any;
}

async function startTemperatureServer(deps: TestDeps) {
  return await startTestServer((app) => {
    const router = express.Router();
    registerTemperatureRoutes(router, deps as never);
    app.use('/api', router);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('temperature-routes (bed/extruder heaters)', () => {
  it('sets the bed temperature through the backend manager, never raw G-code', async () => {
    const deps = createDependencies();
    const server = await startTemperatureServer(deps);

    const response = await fetch(`${server.baseUrl}/api/printer/temperature/bed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temperature: 60 }),
    });
    const body = await response.json();
    await server.close();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: 'Setting bed temperature to 60°C',
      error: undefined,
    });
    expect(deps.backendManager.setBedTemperature).toHaveBeenCalledTimes(1);
    expect(deps.backendManager.setBedTemperature).toHaveBeenCalledWith('context-1', 60);
    expect(deps.backendManager.executeGCodeCommand).not.toHaveBeenCalled();
  });

  it('turns the bed heater off through the backend manager cancel command', async () => {
    const deps = createDependencies();
    const server = await startTemperatureServer(deps);

    const response = await fetch(`${server.baseUrl}/api/printer/temperature/bed/off`, {
      method: 'POST',
    });
    const body = await response.json();
    await server.close();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: 'Bed heating turned off',
      error: undefined,
    });
    expect(deps.backendManager.cancelBedTemperature).toHaveBeenCalledWith('context-1');
    expect(deps.backendManager.executeGCodeCommand).not.toHaveBeenCalled();
  });

  it('sets the extruder temperature (rounded) through the backend manager', async () => {
    const deps = createDependencies();
    const server = await startTemperatureServer(deps);

    const response = await fetch(`${server.baseUrl}/api/printer/temperature/extruder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temperature: 210.4 }),
    });
    const body = await response.json();
    await server.close();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: 'Setting extruder temperature to 210°C',
      error: undefined,
    });
    expect(deps.backendManager.setExtruderTemperature).toHaveBeenCalledWith('context-1', 210);
    expect(deps.backendManager.executeGCodeCommand).not.toHaveBeenCalled();
  });

  it('turns the extruder heater off through the backend manager cancel command', async () => {
    const deps = createDependencies();
    const server = await startTemperatureServer(deps);

    const response = await fetch(`${server.baseUrl}/api/printer/temperature/extruder/off`, {
      method: 'POST',
    });
    await server.close();

    expect(response.status).toBe(200);
    expect(deps.backendManager.cancelExtruderTemperature).toHaveBeenCalledWith('context-1');
    expect(deps.backendManager.executeGCodeCommand).not.toHaveBeenCalled();
  });

  it('routes heater commands to an explicit contextId override', async () => {
    const deps = createDependencies();
    const server = await startTemperatureServer(deps);

    const response = await fetch(
      `${server.baseUrl}/api/printer/temperature/bed?contextId=context-2`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ temperature: 55 }),
      }
    );
    await server.close();

    expect(response.status).toBe(200);
    expect(deps.backendManager.setBedTemperature).toHaveBeenCalledWith('context-2', 55);
  });

  it('rejects out-of-range temperatures with a 400 validation error', async () => {
    const deps = createDependencies();
    const server = await startTemperatureServer(deps);

    const response = await fetch(`${server.baseUrl}/api/printer/temperature/bed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temperature: 500 }),
    });
    const body = (await response.json()) as { success: boolean; error: string };
    await server.close();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(deps.backendManager.setBedTemperature).not.toHaveBeenCalled();
  });

  it('returns 500 when the backend manager reports a failed command', async () => {
    const deps = createDependencies();
    deps.backendManager.setBedTemperature.mockResolvedValueOnce({
      success: false,
      error: 'Temperature command failed',
      timestamp: new Date(),
    });
    const server = await startTemperatureServer(deps);

    const response = await fetch(`${server.baseUrl}/api/printer/temperature/bed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temperature: 60 }),
    });
    const body = await response.json();
    await server.close();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      message: undefined,
      error: 'Temperature command failed',
    });
  });

  it('returns 503 when no printer context is active', async () => {
    const deps = createDependencies();
    deps.contextManager.getActiveContextId.mockReturnValue(null);
    const server = await startTemperatureServer(deps);

    const response = await fetch(`${server.baseUrl}/api/printer/temperature/bed/off`, {
      method: 'POST',
    });
    const body = await response.json();
    await server.close();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: 'No active printer context',
    });
    expect(deps.backendManager.cancelBedTemperature).not.toHaveBeenCalled();
  });

  it('returns 503 when the printer backend is not ready', async () => {
    const deps = createDependencies();
    deps.backendManager.isBackendReady.mockReturnValue(false);
    const server = await startTemperatureServer(deps);

    const response = await fetch(`${server.baseUrl}/api/printer/temperature/extruder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temperature: 200 }),
    });
    await server.close();

    expect(response.status).toBe(503);
    expect(deps.backendManager.setExtruderTemperature).not.toHaveBeenCalled();
  });
});
