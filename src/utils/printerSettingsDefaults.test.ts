import { describe, expect, it } from '@jest/globals';
import { applyPerPrinterDefaults, normalizeCustomCameraSettings } from './printerSettingsDefaults';

describe('printerSettingsDefaults', () => {
  it('disables custom camera when enabled without a URL', () => {
    expect(
      normalizeCustomCameraSettings({
        customCameraEnabled: true,
        customCameraUrl: '   ',
      })
    ).toEqual({
      customCameraEnabled: false,
      customCameraUrl: '',
    });
  });

  it('trims and preserves a valid custom camera URL', () => {
    expect(
      applyPerPrinterDefaults({
        customCameraEnabled: true,
        customCameraUrl: '  rtsp://camera.local/stream  ',
      })
    ).toMatchObject({
      customCameraEnabled: true,
      customCameraUrl: 'rtsp://camera.local/stream',
      customLedsEnabled: false,
      forceLegacyMode: false,
      webUIEnabled: true,
    });
  });
});
