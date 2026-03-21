import { describe, expect, it } from '@jest/globals';
import type { PrinterFeatureSet } from '../types/printer-backend';
import { resolveCameraConfig } from './camera-utils';

function createFeatures(oemStreamUrl = ''): PrinterFeatureSet {
  return {
    camera: {
      oemStreamUrl,
      fallbackStreamUrl: '',
      customUrl: null,
      customEnabled: false,
    },
    ledControl: {
      builtin: false,
      customControlEnabled: false,
      usesLegacyAPI: true,
    },
    filtration: {
      available: false,
      controllable: false,
      reason: 'Unavailable',
    },
    gcodeCommands: {
      available: true,
      usesLegacyAPI: true,
      supportedCommands: [],
    },
    statusMonitoring: {
      available: true,
      usesNewAPI: true,
      usesLegacyAPI: true,
      realTimeUpdates: true,
    },
    jobManagement: {
      localJobs: true,
      recentJobs: true,
      uploadJobs: true,
      startJobs: true,
      pauseResume: true,
      cancelJobs: true,
      usesNewAPI: true,
    },
    materialStation: {
      available: false,
      slotCount: 0,
      perSlotInfo: false,
      materialDetection: false,
    },
  };
}

describe('resolveCameraConfig', () => {
  it('uses the explicit custom camera URL when provided', () => {
    expect(
      resolveCameraConfig({
        printerIpAddress: '192.168.1.50',
        printerFeatures: createFeatures('http://192.168.1.50:8080/?action=stream'),
        userConfig: {
          customCameraEnabled: true,
          customCameraUrl: 'rtsp://camera.local/stream',
        },
      })
    ).toMatchObject({
      sourceType: 'custom',
      streamType: 'rtsp',
      streamUrl: 'rtsp://camera.local/stream',
      isAvailable: true,
    });
  });

  it('normalizes blank custom camera settings and falls back to OEM auto-detection', () => {
    expect(
      resolveCameraConfig({
        printerIpAddress: '192.168.1.50',
        printerFeatures: createFeatures('http://192.168.1.50:8080/?action=stream'),
        userConfig: {
          customCameraEnabled: true,
          customCameraUrl: '   ',
        },
      })
    ).toMatchObject({
      sourceType: 'oem',
      streamType: 'mjpeg',
      streamUrl: 'http://192.168.1.50:8080/?action=stream',
      isAvailable: true,
    });
  });

  it('reports unavailable when neither OEM nor custom camera is configured', () => {
    expect(
      resolveCameraConfig({
        printerIpAddress: '192.168.1.50',
        printerFeatures: createFeatures(''),
        userConfig: {
          customCameraEnabled: false,
          customCameraUrl: null,
        },
      })
    ).toMatchObject({
      sourceType: 'none',
      streamUrl: null,
      isAvailable: false,
    });
  });

  it('uses the intelligent fallback camera URL when firmware omits the OEM stream', () => {
    expect(
      resolveCameraConfig({
        printerIpAddress: '192.168.1.50',
        printerFeatures: {
          ...createFeatures(''),
          camera: {
            ...createFeatures('').camera,
            fallbackStreamUrl: 'http://192.168.1.50:8080/?action=stream',
          },
        },
        userConfig: {
          customCameraEnabled: false,
          customCameraUrl: null,
        },
      })
    ).toMatchObject({
      sourceType: 'intelligent-fallback',
      streamType: 'mjpeg',
      streamUrl: 'http://192.168.1.50:8080/?action=stream',
      isAvailable: true,
    });
  });
});
