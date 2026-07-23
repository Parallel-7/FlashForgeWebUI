/**
 * @fileoverview Tests for the HTTP-only short-circuit in
 * ConnectionEstablishmentService.createTemporaryConnection (issue #17).
 * When a Creator 5 series product ID is supplied, the service must synthesize
 * the type info and return without ever opening a legacy TCP probe — the
 * Creator 5 series runs no TCP server on port 8899.
 */

import { describe, expect, it, jest } from '@jest/globals';
import type { DiscoveredPrinter } from '../types/printer';
import { getConnectionEstablishmentService } from './ConnectionEstablishmentService';

describe('ConnectionEstablishmentService.createTemporaryConnection', () => {
  const service = getConnectionEstablishmentService();

  const basePrinter: DiscoveredPrinter = {
    name: 'Printer at 192.168.1.184',
    ipAddress: '192.168.1.184',
    serialNumber: 'SNCRE5PRO001',
    model: undefined,
  };

  it('short-circuits the TCP probe for the Creator 5 (productId 40)', async () => {
    const result = await service.createTemporaryConnection({ ...basePrinter, productId: 40 });

    expect(result.success).toBe(true);
    expect(result.typeName).toBe('Creator 5');
    expect(result.printerInfo?.SerialNumber).toBe('SNCRE5PRO001');
  });

  it('short-circuits the TCP probe for the Creator 5 Pro (productId 41)', async () => {
    const result = await service.createTemporaryConnection({ ...basePrinter, productId: 41 });

    expect(result.success).toBe(true);
    expect(result.typeName).toBe('Creator 5 Pro');
  });

  it('does not short-circuit for dual-API product IDs', async () => {
    // 5M family printers run a real TCP server, so the probe must actually run.
    // Stub the legacy client factory so no real socket is opened.
    const fakeClient = {
      initControl: jest.fn(async () => false),
      dispose: jest.fn(async () => undefined),
    };
    const spy = jest
      .spyOn(
        service as unknown as { createLegacyClient: () => unknown },
        'createLegacyClient'
      )
      .mockReturnValue(fakeClient);

    try {
      const result = await service.createTemporaryConnection(
        { ...basePrinter, productId: 35 },
        50,
        1
      );

      expect(spy).toHaveBeenCalled();
      expect(result.success).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
