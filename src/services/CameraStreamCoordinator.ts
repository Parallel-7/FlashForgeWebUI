/**
 * @fileoverview Shared camera stream reconciliation helpers for the standalone WebUI server.
 */

import type { CameraSourceType, CameraUserConfig, ResolvedCameraConfig } from '../types/camera';
import type { PrinterFeatureSet } from '../types/printer-backend';
import type { CameraStreamConfig } from '../types/go2rtc.types';
import type { Go2rtcService } from './Go2rtcService';
import { resolveCameraConfig } from '../utils/camera-utils';

export interface CameraStreamResolutionParams {
  readonly contextId: string;
  readonly printerIpAddress: string;
  readonly printerFeatures: PrinterFeatureSet;
  readonly userConfig: CameraUserConfig;
  readonly go2rtcService: Go2rtcService;
}

export interface EnsuredCameraStream {
  readonly cameraConfig: ResolvedCameraConfig;
  readonly streamConfig: CameraStreamConfig;
}

function isGo2rtcSourceType(sourceType: CameraSourceType): sourceType is 'oem' | 'custom' {
  return sourceType === 'oem' || sourceType === 'custom';
}

export async function resolveAndEnsureCameraStream(
  params: CameraStreamResolutionParams
): Promise<EnsuredCameraStream | null> {
  const { contextId, printerIpAddress, printerFeatures, userConfig, go2rtcService } = params;
  const cameraConfig = resolveCameraConfig({
    printerIpAddress,
    printerFeatures,
    userConfig,
  });

  if (
    !cameraConfig.isAvailable ||
    !cameraConfig.streamUrl ||
    !cameraConfig.streamType ||
    !isGo2rtcSourceType(cameraConfig.sourceType)
  ) {
    await go2rtcService.removeStream(contextId);
    return null;
  }

  if (!go2rtcService.isRunning()) {
    await go2rtcService.initialize();
  }

  if (
    !go2rtcService.hasMatchingStream(
      contextId,
      cameraConfig.streamUrl,
      cameraConfig.sourceType,
      cameraConfig.streamType
    )
  ) {
    await go2rtcService.addStream(
      contextId,
      cameraConfig.streamUrl,
      cameraConfig.sourceType,
      cameraConfig.streamType
    );
  }

  const streamConfig = go2rtcService.getStreamConfig(contextId);
  if (!streamConfig) {
    return null;
  }

  return {
    cameraConfig,
    streamConfig,
  };
}
