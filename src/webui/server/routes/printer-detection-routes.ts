/**
 * @fileoverview Printer Detection API Routes
 * Handles probing printers to determine their type and capabilities
 */

import type { Router, Response } from 'express';
import type { AuthenticatedRequest } from '../auth-middleware';
import { toAppError } from '../../../utils/error.utils';
import type { RouteDependencies } from './route-helpers';
import { sendErrorResponse } from './route-helpers';
import { getConnectionEstablishmentService } from '../../../services/ConnectionEstablishmentService';
import { detectPrinterFamily, determineClientType } from '../../../utils/PrinterUtils';
import type { DiscoveredPrinter } from '../../../types/printer';

export function registerPrinterDetectionRoutes(router: Router, _deps: RouteDependencies): void {
  const connectionService = getConnectionEstablishmentService();

  /**
   * POST /api/printers/detect
   * Probe a printer to determine its type and capabilities
   *
   * This creates a temporary connection to the printer using the legacy API
   * (which is universally compatible) to retrieve the printer's TypeName.
   * The TypeName is then used to determine if it's a 5M family printer
   * and whether it requires a check code.
   */
  router.post('/printers/detect', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body as { ipAddress?: string };
      const ipAddress = body.ipAddress;

      // Validate IP address
      if (!ipAddress || typeof ipAddress !== 'string') {
        return sendErrorResponse(res, 400, 'IP address is required');
      }

      // Basic IP validation
      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
      if (!ipRegex.test(ipAddress)) {
        return sendErrorResponse(res, 400, 'Invalid IP address format');
      }

      console.log(`[Detection] Probing printer at ${ipAddress}...`);

      // Create mock discovered printer for temporary connection
      const mockPrinter: DiscoveredPrinter = {
        name: `Printer at ${ipAddress}`,
        ipAddress,
        serialNumber: '', // Will be determined during connection
        model: undefined
      };

      // Create temporary connection to probe the printer
      const tempResult = await connectionService.createTemporaryConnection(mockPrinter);

      if (!tempResult.success || !tempResult.typeName) {
        console.error(`[Detection] Failed to probe ${ipAddress}: ${tempResult.error}`);
        return sendErrorResponse(
          res,
          500,
          tempResult.error || 'Failed to detect printer type'
        );
      }

      // Extract printer information
      const typeName = tempResult.typeName;
      const serialNumber =
        tempResult.printerInfo?.SerialNumber && typeof tempResult.printerInfo.SerialNumber === 'string'
          ? tempResult.printerInfo.SerialNumber
          : '';
      const printerName =
        tempResult.printerInfo?.Name && typeof tempResult.printerInfo.Name === 'string'
          ? tempResult.printerInfo.Name
          : `Printer at ${ipAddress}`;

      // Detect printer family and determine requirements
      const familyInfo = detectPrinterFamily(typeName);
      const clientType = determineClientType(familyInfo.is5MFamily);

      console.log(`[Detection] Detected ${typeName} as ${familyInfo.is5MFamily ? '5M family' : 'legacy'} printer`);

      return res.json({
        success: true,
        typeName,
        name: printerName,
        serialNumber,
        is5MFamily: familyInfo.is5MFamily,
        requiresCheckCode: familyInfo.requiresCheckCode,
        clientType,
        familyName: familyInfo.familyName
      });

    } catch (error) {
      console.error('[Detection] Printer detection failed:', error);
      const appError = toAppError(error);
      return sendErrorResponse(res, 500, appError.message);
    }
  });
}
