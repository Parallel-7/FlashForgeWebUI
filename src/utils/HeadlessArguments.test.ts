/**
 * @fileoverview Tests for CLI printer-spec parsing and validation.
 * Covers the Creator 5 series TYPE tokens and the serial-number requirement
 * for HTTP-only models, which cannot be probed for their serial (issue #17).
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import {
  type HeadlessConfig,
  parseHeadlessArguments,
  validateHeadlessConfig,
} from './HeadlessArguments';

const originalArgv = process.argv;

function parseWith(printersArg: string): HeadlessConfig {
  process.argv = ['node', 'index.js', `--printers=${printersArg}`];
  return parseHeadlessArguments();
}

afterEach(() => {
  process.argv = originalArgv;
});

describe('parseHeadlessArguments - printer specs', () => {
  it('parses the legacy IP:TYPE:CHECKCODE format unchanged', () => {
    const config = parseWith('192.168.1.100:new:12345678,192.168.1.101:legacy');

    expect(config.mode).toBe('explicit-printers');
    expect(config.printers).toHaveLength(2);
    expect(config.printers?.[0]).toMatchObject({
      ip: '192.168.1.100',
      type: 'new',
      checkCode: '12345678',
    });
    expect(config.printers?.[0].productId).toBeUndefined();
    expect(config.printers?.[1]).toMatchObject({ ip: '192.168.1.101', type: 'legacy' });
  });

  it('parses the optional serial number as a fourth field', () => {
    const config = parseWith('192.168.1.100:new:12345678:SNMOMC1234567');

    expect(config.printers?.[0]).toMatchObject({
      type: 'new',
      checkCode: '12345678',
      serialNumber: 'SNMOMC1234567',
    });
  });

  it('maps Creator tokens to the new client type with an HTTP-only product ID', () => {
    const config = parseWith(
      '192.168.1.184:creator-5:12345678:SN1,192.168.1.185:creator-5-pro:87654321:SN2'
    );

    expect(config.printers?.[0]).toMatchObject({
      type: 'new',
      productId: 40,
      serialNumber: 'SN1',
    });
    expect(config.printers?.[1]).toMatchObject({
      type: 'new',
      productId: 41,
      serialNumber: 'SN2',
    });
  });

  it('falls back to legacy for unknown type tokens', () => {
    const config = parseWith('192.168.1.100:bogus');
    expect(config.printers?.[0].type).toBe('legacy');
  });
});

describe('validateHeadlessConfig', () => {
  const base: HeadlessConfig = { mode: 'explicit-printers' };

  it('requires a serial number for Creator 5 series printers', () => {
    const result = validateHeadlessConfig({
      ...base,
      printers: [{ ip: '192.168.1.184', type: 'new', checkCode: '12345678', productId: 40 }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/serial number/i);
  });

  it('accepts a Creator 5 spec that includes a serial number', () => {
    const result = validateHeadlessConfig({
      ...base,
      printers: [
        {
          ip: '192.168.1.184',
          type: 'new',
          checkCode: '12345678',
          productId: 41,
          serialNumber: 'SNCRE51234567',
        },
      ],
    });

    expect(result.valid).toBe(true);
  });

  it('keeps the serial optional for dual-API printers (TCP probe supplies it)', () => {
    const result = validateHeadlessConfig({
      ...base,
      printers: [{ ip: '192.168.1.100', type: 'new', checkCode: '12345678' }],
    });

    expect(result.valid).toBe(true);
  });

  it('still requires a check code for modern printers', () => {
    const result = validateHeadlessConfig({
      ...base,
      printers: [{ ip: '192.168.1.100', type: 'new' }],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/check code/i);
  });
});
