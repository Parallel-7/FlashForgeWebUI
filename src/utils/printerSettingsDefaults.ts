/**
 * @fileoverview Centralized per-printer settings defaults and normalization helpers.
 */

import type { PrinterDetails } from '../types/printer';

export const PER_PRINTER_SETTINGS_DEFAULTS = {
  customCameraEnabled: false,
  customCameraUrl: '',
  customLedsEnabled: false,
  forceLegacyMode: false,
  webUIEnabled: true,
} as const;

export interface PerPrinterSettings {
  customCameraEnabled: boolean;
  customCameraUrl: string;
  customLedsEnabled: boolean;
  forceLegacyMode: boolean;
  webUIEnabled: boolean;
}

type CameraSettingSubset = Pick<Partial<PrinterDetails>, 'customCameraEnabled' | 'customCameraUrl'>;

/**
 * Normalize camera-related settings without forcing unrelated defaults.
 * If custom camera is enabled without a URL, disable it and clear the URL.
 */
export function normalizeCustomCameraSettings<T extends CameraSettingSubset>(details: T): T {
  const customCameraUrl =
    typeof details.customCameraUrl === 'string' ? details.customCameraUrl.trim() : details.customCameraUrl;

  if (details.customCameraEnabled && (!customCameraUrl || customCameraUrl === '')) {
    return {
      ...details,
      customCameraEnabled: false,
      customCameraUrl: '',
    };
  }

  if (customCameraUrl !== details.customCameraUrl) {
    return {
      ...details,
      customCameraUrl,
    };
  }

  return { ...details };
}

export function applyPerPrinterDefaults<T extends Partial<PrinterDetails>>(details: T): T & PerPrinterSettings {
  return normalizeCustomCameraSettings({
    ...details,
    customCameraEnabled: details.customCameraEnabled ?? PER_PRINTER_SETTINGS_DEFAULTS.customCameraEnabled,
    customCameraUrl: details.customCameraUrl ?? PER_PRINTER_SETTINGS_DEFAULTS.customCameraUrl,
    customLedsEnabled: details.customLedsEnabled ?? PER_PRINTER_SETTINGS_DEFAULTS.customLedsEnabled,
    forceLegacyMode: details.forceLegacyMode ?? PER_PRINTER_SETTINGS_DEFAULTS.forceLegacyMode,
    webUIEnabled: details.webUIEnabled ?? PER_PRINTER_SETTINGS_DEFAULTS.webUIEnabled,
  }) as T & PerPrinterSettings;
}

export function hasMissingDefaults(details: Partial<PrinterDetails>): boolean {
  return (
    details.customCameraEnabled === undefined ||
    details.customCameraUrl === undefined ||
    details.customLedsEnabled === undefined ||
    details.forceLegacyMode === undefined ||
    details.webUIEnabled === undefined
  );
}
