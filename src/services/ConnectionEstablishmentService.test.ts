/**
 * @fileoverview Tests for the product-ID short-circuit in
 * ConnectionEstablishmentService.createTemporaryConnection (issue #17).
 * When the discovery USB product ID identifies any modern (new-API) model, the
 * service must synthesize the type info from the discovery packet and return
 * without ever opening a legacy TCP probe. Printers with no product ID still
 * fall through to the probe, which remains the detection path for legacy models.
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

  it('short-circuits the TCP probe for dual-API product IDs', async () => {
    // The broadcast carries the serial (0x92) and the product ID (0x88), and
    // FiveMClient.initialize() supplies the capability flags — so the probe adds
    // nothing for 5M / 5M Pro / AD5X either, and must not run.
    const spy = jest.spyOn(
      service as unknown as { createLegacyClient: () => unknown },
      'createLegacyClient'
    );

    try {
      for (const [productId, expectedTypeName] of [
        [35, 'Adventurer 5M'],
        [36, 'Adventurer 5M Pro'],
        [38, 'AD5X'],
      ] as const) {
        spy.mockClear();

        const result = await service.createTemporaryConnection(
          { ...basePrinter, productId },
          50,
          1
        );

        expect(spy).not.toHaveBeenCalled();
        expect(result.success).toBe(true);
        expect(result.typeName).toBe(expectedTypeName);
        expect(result.printerInfo?.SerialNumber).toBe('SNCRE5PRO001');
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('still runs the TCP probe when no product ID is present (legacy fallback)', async () => {
    // Genuine legacy printers — and manual/headless connects that named no model —
    // have no product ID, so type detection must still go over TCP.
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
        { ...basePrinter, productId: undefined },
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
