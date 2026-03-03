/**
 * @fileoverview Camera configuration and resolution types for the go2rtc camera stack.
 */

import type { PrinterFeatureSet } from './printer-backend';

export type CameraSourceType = 'builtin' | 'custom' | 'none';

export type CameraStreamType = 'mjpeg' | 'rtsp';

export interface CameraUserConfig {
  readonly customCameraEnabled: boolean;
  readonly customCameraUrl: string | null;
}

export interface ResolvedCameraConfig {
  readonly sourceType: CameraSourceType;
  readonly streamType?: CameraStreamType;
  readonly streamUrl: string | null;
  readonly isAvailable: boolean;
  readonly unavailableReason?: string;
}

export interface CameraUrlResolutionParams {
  readonly printerIpAddress: string;
  readonly printerFeatures: PrinterFeatureSet;
  readonly userConfig: CameraUserConfig;
}

export const DEFAULT_CAMERA_PATTERNS = {
  FLASHFORGE_MJPEG: (ip: string) => `http://${ip}:8080/?action=stream`,
} as const;

export interface CameraUrlValidationResult {
  readonly isValid: boolean;
  readonly error?: string;
  readonly parsedUrl?: URL;
}

export function isCameraAvailable(
  config: ResolvedCameraConfig
): config is ResolvedCameraConfig & { streamUrl: string } {
  return config.isAvailable && config.streamUrl !== null;
}

export function isCustomCamera(config: ResolvedCameraConfig): boolean {
  return config.sourceType === 'custom';
}

export function isBuiltinCamera(config: ResolvedCameraConfig): boolean {
  return config.sourceType === 'builtin';
}
