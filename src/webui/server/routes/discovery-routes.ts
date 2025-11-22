/**
 * @fileoverview Discovery API Routes
 * Handles network scanning and printer discovery
 */

import type { Router, Response } from 'express';
import type { AuthenticatedRequest } from '../auth-middleware';
import { StandardAPIResponse } from '../../types/web-api.types';
import { toAppError } from '../../../utils/error.utils';
import type { RouteDependencies } from './route-helpers';
import { sendErrorResponse } from './route-helpers';
import { getPrinterDiscoveryService } from '../../../services/PrinterDiscoveryService';
import { getSavedPrinterService } from '../../../services/SavedPrinterService';

export function registerDiscoveryRoutes(router: Router, _deps: RouteDependencies): void {
  const discoveryService = getPrinterDiscoveryService();
  const savedPrinterService = getSavedPrinterService();

  /**
   * POST /api/discovery/scan
   * Start network-wide printer discovery
   */
  router.post('/discovery/scan', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body as {
        timeout?: number;
        interval?: number;
        retries?: number;
      };

      const timeout = typeof body.timeout === 'number' ? body.timeout : 10000;
      const interval = typeof body.interval === 'number' ? body.interval : 2000;
      const retries = typeof body.retries === 'number' ? body.retries : 3;

      // Validate parameters
      if (timeout < 1000 || timeout > 60000) {
        return sendErrorResponse(res, 400, 'Timeout must be between 1000 and 60000ms');
      }
      if (interval < 500 || interval > 5000) {
        return sendErrorResponse(res, 400, 'Interval must be between 500 and 5000ms');
      }
      if (retries < 1 || retries > 5) {
        return sendErrorResponse(res, 400, 'Retries must be between 1 and 5');
      }

      // Check if discovery is already running
      if (discoveryService.isDiscoveryInProgress()) {
        return sendErrorResponse(res, 409, 'Discovery already in progress');
      }

      // Start discovery
      const discoveredPrinters = await discoveryService.scanNetwork(timeout, interval, retries);

      // Match with saved printers
      const savedPrinters = savedPrinterService.getSavedPrinters();
      const savedMatches = discoveredPrinters.map(discovered => {
        const saved = savedPrinters.find(s => s.SerialNumber === discovered.serialNumber);
        return {
          discovered,
          saved: saved || null,
          isKnown: !!saved,
          ipAddressChanged: saved ? saved.IPAddress !== discovered.ipAddress : false
        };
      });

      return res.json({
        success: true,
        printers: discoveredPrinters,
        savedMatches,
        count: discoveredPrinters.length
      });

    } catch (error) {
      console.error('[API] Discovery scan failed:', error);
      const appError = toAppError(error);
      return sendErrorResponse(res, 500, appError.message);
    }
  });

  /**
   * POST /api/discovery/scan-ip
   * Scan a specific IP address for a printer
   */
  router.post('/discovery/scan-ip', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body as { ipAddress?: string };
      const ipAddress = body.ipAddress;

      if (!ipAddress || typeof ipAddress !== 'string') {
        return sendErrorResponse(res, 400, 'IP address is required');
      }

      // Basic IP validation
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(ipAddress)) {
        return sendErrorResponse(res, 400, 'Invalid IP address format');
      }

      const printer = await discoveryService.scanSingleIP(ipAddress);

      return res.json({
        success: true,
        printer,
        found: printer !== null
      });

    } catch (error) {
      console.error('[API] Single IP scan failed:', error);
      const appError = toAppError(error);
      return sendErrorResponse(res, 500, appError.message);
    }
  });

  /**
   * GET /api/discovery/status
   * Get current discovery status
   */
  router.get('/discovery/status', (_req: AuthenticatedRequest, res: Response) => {
    return res.json({
      success: true,
      inProgress: discoveryService.isDiscoveryInProgress()
    });
  });

  /**
   * POST /api/discovery/cancel
   * Cancel ongoing discovery
   */
  router.post('/discovery/cancel', (_req: AuthenticatedRequest, res: Response) => {
    discoveryService.cancelDiscovery();
    return res.json({
      success: true,
      message: 'Discovery cancelled'
    } as StandardAPIResponse);
  });
}
