/**
 * @fileoverview Jest coverage for WebUI camera route handlers.
 *
 * Tests route-level camera proxy-config responses, validation, and error
 * handling around the shared camera services exposed to the WebUI. Asserts
 * the proxied WebSocket URL shape served to browsers (relative path on the
 * WebUI server, no go2rtc port leakage).
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';

const mockGetContext = jest.fn<(contextId: string) => unknown>();
const go2rtcService = {
  hasStream: jest.fn<() => boolean>(),
  hasMatchingStream: jest.fn<() => boolean>(),
  isRunning: jest.fn<() => boolean>(),
  initialize: jest.fn<() => Promise<void>>(),
  addStream:
    jest.fn<
      (contextId: string, url: string, sourceType: string, streamType: string) => Promise<void>
    >(),
  removeStream: jest.fn<(contextId: string) => Promise<void>>(),
  getStreamConfig: jest.fn<() => unknown>(),
};

jest.mock('../../../managers/PrinterContextManager', () => ({
  getPrinterContextManager: () => ({
    getContext: (contextId: string) => mockGetContext(contextId),
  }),
}));

jest.mock('../../../services/Go2rtcService', () => ({
  getGo2rtcService: () => go2rtcService,
}));

import { registerCameraRoutes } from './camera-routes';
import { startTestServer } from './test-server';

describe('camera-routes', () => {
  function createDependencies() {
    return {
      backendManager: {
        isBackendReady: jest.fn().mockReturnValue(true),
        getBackendForContext: jest.fn().mockReturnValue({
          getBackendStatus: jest.fn().mockReturnValue({
            features: {
              camera: {
                oemStreamUrl: 'http://192.168.1.25:8080/?action=stream',
                fallbackStreamUrl: '',
                customEnabled: true,
                customUrl: null,
              },
            },
          }),
        }),
        isFeatureAvailable: jest.fn().mockReturnValue(true),
      },
      contextManager: {
        getActiveContextId: jest.fn().mockReturnValue('context-1'),
        getContext: jest.fn().mockReturnValue({
          id: 'context-1',
          printerDetails: {
            IPAddress: '192.168.1.25',
            customCameraEnabled: true,
            customCameraUrl: '',
          },
        }),
      },
      connectionManager: {},
      configManager: {},
      spoolmanService: {},
      // biome-ignore lint/suspicious/noExplicitAny: test double for RouteDependencies
    } as any;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetContext.mockImplementation((contextId: string) => {
      if (contextId !== 'context-1') {
        return undefined;
      }

      return {
        id: 'context-1',
        printerDetails: {
          IPAddress: '192.168.1.25',
          customCameraEnabled: true,
          customCameraUrl: '',
        },
      };
    });
    go2rtcService.hasStream.mockReturnValue(false);
    go2rtcService.hasMatchingStream.mockReturnValue(false);
    go2rtcService.isRunning.mockReturnValue(false);
    go2rtcService.getStreamConfig.mockReturnValue({
      streamName: 'context-1-camera',
      apiPort: 1984,
      mode: 'webrtc,mse,mjpeg',
    });
  });

  it('uses the runtime OEM camera stream and returns a proxied websocket configuration', async () => {
    const deps = createDependencies();
    const server = await startTestServer((app) => {
      const router = express.Router();
      registerCameraRoutes(router, deps);
      app.use('/api', router);
    });

    const response = await fetch(`${server.baseUrl}/api/camera/proxy-config?contextId=context-1`);
    const body = await response.json();

    await server.close();

    expect(response.status).toBe(200);
    expect(go2rtcService.initialize).toHaveBeenCalled();
    expect(go2rtcService.addStream).toHaveBeenCalledWith(
      'context-1',
      'http://192.168.1.25:8080/?action=stream',
      'oem',
      'mjpeg'
    );
    expect(body).toEqual({
      success: true,
      wsUrl: '/api/camera/ws?src=context-1-camera',
      streamType: 'mjpeg',
      sourceType: 'oem',
      streamName: 'context-1-camera',
      mode: 'webrtc,mse,mjpeg',
      showCameraFps: false,
    });
  });

  it('returns 503 when no camera is available for the resolved printer context', async () => {
    mockGetContext.mockReturnValue({
      id: 'context-1',
      printerDetails: {
        IPAddress: '192.168.1.25',
        customCameraEnabled: false,
        customCameraUrl: '',
      },
    });
    const deps = createDependencies();
    deps.backendManager.getBackendForContext = jest.fn().mockReturnValue({
      getBackendStatus: jest.fn().mockReturnValue({
        features: {
          camera: {
            oemStreamUrl: '',
            fallbackStreamUrl: '',
            customEnabled: false,
            customUrl: null,
          },
        },
      }),
    });
    deps.backendManager.isFeatureAvailable = jest.fn().mockReturnValue(false);
    deps.contextManager.getContext = jest.fn().mockReturnValue({
      id: 'context-1',
      printerDetails: {
        IPAddress: '192.168.1.25',
        customCameraEnabled: false,
        customCameraUrl: '',
      },
    });
    const server = await startTestServer((app) => {
      const router = express.Router();
      registerCameraRoutes(router, deps);
      app.use('/api', router);
    });

    const response = await fetch(`${server.baseUrl}/api/camera/proxy-config?contextId=context-1`);
    const body = await response.json();

    await server.close();

    expect(response.status).toBe(503);
    expect(go2rtcService.initialize).not.toHaveBeenCalled();
    expect(body).toEqual({
      success: false,
      error: 'Camera not available for this printer',
    });
  });

  it('returns proxy config for an intelligently detected OEM fallback stream', async () => {
    mockGetContext.mockReturnValue({
      id: 'context-1',
      printerDetails: {
        IPAddress: '192.168.1.25',
        customCameraEnabled: false,
        customCameraUrl: '',
      },
    });
    const deps = createDependencies();
    deps.backendManager.getBackendForContext = jest.fn().mockReturnValue({
      getBackendStatus: jest.fn().mockReturnValue({
        features: {
          camera: {
            oemStreamUrl: '',
            fallbackStreamUrl: 'http://192.168.1.25:8080/?action=stream',
            customEnabled: false,
            customUrl: null,
          },
        },
      }),
    });
    deps.contextManager.getContext = jest.fn().mockReturnValue({
      id: 'context-1',
      printerDetails: {
        IPAddress: '192.168.1.25',
        customCameraEnabled: false,
        customCameraUrl: '',
      },
    });
    const server = await startTestServer((app) => {
      const router = express.Router();
      registerCameraRoutes(router, deps);
      app.use('/api', router);
    });

    const response = await fetch(`${server.baseUrl}/api/camera/proxy-config?contextId=context-1`);
    const body = await response.json();

    await server.close();

    expect(response.status).toBe(200);
    expect(go2rtcService.addStream).toHaveBeenCalledWith(
      'context-1',
      'http://192.168.1.25:8080/?action=stream',
      'intelligent-fallback',
      'mjpeg'
    );
    expect(body).toEqual({
      success: true,
      wsUrl: '/api/camera/ws?src=context-1-camera',
      streamType: 'mjpeg',
      sourceType: 'intelligent-fallback',
      streamName: 'context-1-camera',
      mode: 'webrtc,mse,mjpeg',
      showCameraFps: false,
    });
  });
});
