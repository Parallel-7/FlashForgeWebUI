/**
 * @fileoverview Unit tests for printer model detection and classification utilities.
 * Focuses on the PID-based detection paths and HTTP-only (Creator 5 series)
 * classification that drive connection-flow routing (issue #17).
 */

import { describe, expect, it } from '@jest/globals';
import {
  detectPrinterFamily,
  detectPrinterFamilyFromId,
  detectPrinterModelType,
  detectPrinterModelTypeFromId,
  isHttpOnlyModel,
  supportsDualAPI,
} from './PrinterUtils';

describe('detectPrinterModelType', () => {
  it('detects 5M family models from typeName', () => {
    expect(detectPrinterModelType('FlashForge Adventurer 5M Pro')).toBe('adventurer-5m-pro');
    expect(detectPrinterModelType('FlashForge Adventurer 5M')).toBe('adventurer-5m');
    expect(detectPrinterModelType('FlashForge AD5X')).toBe('ad5x');
  });

  it('detects Creator 5 series models from typeName', () => {
    expect(detectPrinterModelType('Creator 5 Pro')).toBe('creator-5-pro');
    expect(detectPrinterModelType('Creator 5')).toBe('creator-5');
  });

  it('falls back to generic-legacy for unknown or empty typeName', () => {
    expect(detectPrinterModelType('Adventurer 4')).toBe('generic-legacy');
    expect(detectPrinterModelType('')).toBe('generic-legacy');
  });
});

describe('detectPrinterModelTypeFromId', () => {
  it('prefers the USB product ID when known', () => {
    expect(detectPrinterModelTypeFromId(35, '')).toBe('adventurer-5m');
    expect(detectPrinterModelTypeFromId(36, '')).toBe('adventurer-5m-pro');
    expect(detectPrinterModelTypeFromId(38, '')).toBe('ad5x');
    expect(detectPrinterModelTypeFromId(40, '')).toBe('creator-5');
    expect(detectPrinterModelTypeFromId(41, '')).toBe('creator-5-pro');
  });

  it('falls back to typeName when the product ID is missing or unknown', () => {
    expect(detectPrinterModelTypeFromId(undefined, 'Creator 5 Pro')).toBe('creator-5-pro');
    expect(detectPrinterModelTypeFromId(9999, 'FlashForge Adventurer 5M')).toBe('adventurer-5m');
    expect(detectPrinterModelTypeFromId(undefined, '')).toBe('generic-legacy');
  });
});

describe('detectPrinterFamilyFromId', () => {
  it('classifies known product IDs as new-API printers requiring a check code', () => {
    const info = detectPrinterFamilyFromId(40, '');
    expect(info.is5MFamily).toBe(true);
    expect(info.requiresCheckCode).toBe(true);
    expect(info.familyName).toBe('Creator 5');
  });

  it('falls back to typeName detection without a product ID', () => {
    const legacy = detectPrinterFamilyFromId(undefined, 'Adventurer 4');
    expect(legacy.is5MFamily).toBe(false);
    expect(legacy.requiresCheckCode).toBe(false);
  });
});

describe('detectPrinterFamily', () => {
  it('treats the Creator 5 series as part of the modern check-code family', () => {
    expect(detectPrinterFamily('Creator 5').is5MFamily).toBe(true);
    expect(detectPrinterFamily('Creator 5 Pro').requiresCheckCode).toBe(true);
  });
});

describe('isHttpOnlyModel', () => {
  it('marks only the Creator 5 series as HTTP-only', () => {
    expect(isHttpOnlyModel('creator-5')).toBe(true);
    expect(isHttpOnlyModel('creator-5-pro')).toBe(true);
    expect(isHttpOnlyModel('adventurer-5m')).toBe(false);
    expect(isHttpOnlyModel('adventurer-5m-pro')).toBe(false);
    expect(isHttpOnlyModel('ad5x')).toBe(false);
    expect(isHttpOnlyModel('generic-legacy')).toBe(false);
  });
});

describe('supportsDualAPI', () => {
  it('is true only for modern printers that also run the legacy TCP server', () => {
    expect(supportsDualAPI('adventurer-5m')).toBe(true);
    expect(supportsDualAPI('adventurer-5m-pro')).toBe(true);
    expect(supportsDualAPI('ad5x')).toBe(true);
  });

  it('is false for HTTP-only models (Creator 5 series has no TCP server)', () => {
    expect(supportsDualAPI('creator-5')).toBe(false);
    expect(supportsDualAPI('creator-5-pro')).toBe(false);
  });

  it('is false for legacy printers', () => {
    expect(supportsDualAPI('generic-legacy')).toBe(false);
  });
});
