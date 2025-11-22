/**
 * @fileoverview Printer Management API Routes
 * Handles connecting, disconnecting, and managing printers
 */

import type { Router, Response } from 'express';
import type { AuthenticatedRequest } from '../auth-middleware';
import { StandardAPIResponse } from '../../types/web-api.types';
import { toAppError } from '../../../utils/error.utils';
import type { RouteDependencies } from './route-helpers';
import { sendErrorResponse } from './route-helpers';
import { getSavedPrinterService } from '../../../services/SavedPrinterService';
import type { PrinterClientType } from '../../../types/printer';

export function registerPrinterManagementRoutes(router: Router, deps: RouteDependencies): void {
  const savedPrinterService = getSavedPrinterService();

  /**
   * POST /api/printers/connect
   * Connect to a discovered or manually specified printer
   */
  router.post('/printers/connect', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body as {
        ipAddress?: string;
        serialNumber?: string;
        name?: string;
        model?: string;
        type?: string;
        checkCode?: string;
      };

      const ipAddress = body.ipAddress;
      const type = body.type;
      const checkCode = body.checkCode;

      // Validate required fields
      if (!ipAddress || typeof ipAddress !== 'string') {
        return sendErrorResponse(res, 400, 'IP address is required');
      }

      if (!type || (type !== 'new' && type !== 'legacy')) {
        return sendErrorResponse(res, 400, 'Type must be "new" or "legacy"');
      }

      // Validate check code for new printers
      if (type === 'new' && (!checkCode || typeof checkCode !== 'string')) {
        return sendErrorResponse(res, 400, 'Check code is required for 5M/Pro printers');
      }

      // Build printer spec
      const spec = {
        ip: ipAddress,
        type: type as PrinterClientType,
        checkCode: type === 'new' ? checkCode : undefined
      };

      // Connect via ConnectionFlowManager
      console.log('[API] Connecting to printer:', spec);
      const results = await deps.connectionManager.connectHeadlessDirect([spec]);

      if (results.length === 0 || !results[0].contextId) {
        console.error('[API] Connection failed - no context created');
        return sendErrorResponse(res, 500, 'Failed to connect to printer');
      }

      const contextId = results[0].contextId;
      const context = deps.contextManager.getContext(contextId);

      if (!context) {
        console.error('[API] Context not found after connection:', contextId);
        return sendErrorResponse(res, 500, 'Context not found after connection');
      }

      console.log('[API] Successfully connected to printer:', context.printerDetails.Name);

      return res.json({
        success: true,
        contextId,
        printer: context.printerDetails,
        message: `Connected to ${context.printerDetails.Name}`
      });

    } catch (error) {
      console.error('[API] Printer connection failed:', error);
      const appError = toAppError(error);
      return sendErrorResponse(res, 500, appError.message);
    }
  });

  /**
   * POST /api/printers/disconnect
   * Disconnect a printer context
   */
  router.post('/printers/disconnect', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body as { contextId?: string };
      const contextId = body.contextId;

      if (!contextId || typeof contextId !== 'string') {
        return sendErrorResponse(res, 400, 'Context ID is required');
      }

      // Verify context exists
      const context = deps.contextManager.getContext(contextId);
      if (!context) {
        return sendErrorResponse(res, 404, `Context ${contextId} not found`);
      }

      // Disconnect via ConnectionFlowManager
      console.log('[API] Disconnecting printer:', context.printerDetails.Name);
      await deps.connectionManager.disconnectContext(contextId);

      return res.json({
        success: true,
        message: 'Printer disconnected'
      } as StandardAPIResponse);

    } catch (error) {
      console.error('[API] Printer disconnection failed:', error);
      const appError = toAppError(error);
      return sendErrorResponse(res, 500, appError.message);
    }
  });

  /**
   * GET /api/printers/saved
   * Get all saved printers
   */
  router.get('/printers/saved', (_req: AuthenticatedRequest, res: Response) => {
    try {
      const savedPrinters = savedPrinterService.getSavedPrinters();
      return res.json({
        success: true,
        printers: savedPrinters,
        count: savedPrinters.length
      });
    } catch (error) {
      console.error('[API] Failed to get saved printers:', error);
      const appError = toAppError(error);
      return sendErrorResponse(res, 500, appError.message);
    }
  });

  /**
   * DELETE /api/printers/saved/:serialNumber
   * Delete a saved printer
   */
  router.delete('/printers/saved/:serialNumber', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const serialNumber = req.params.serialNumber;

      if (!serialNumber) {
        return sendErrorResponse(res, 400, 'Serial number is required');
      }

      // Check if printer is currently connected
      const contexts = deps.contextManager.getAllContexts();
      const connectedContext = contexts.find(
        ctx => ctx.printerDetails.SerialNumber === serialNumber
      );

      if (connectedContext) {
        return sendErrorResponse(res, 409, 'Cannot delete a connected printer. Disconnect first.');
      }

      // Delete from saved printers
      await savedPrinterService.removePrinter(serialNumber);

      return res.json({
        success: true,
        message: 'Printer removed from saved list'
      } as StandardAPIResponse);

    } catch (error) {
      console.error('[API] Failed to delete saved printer:', error);
      const appError = toAppError(error);
      return sendErrorResponse(res, 500, appError.message);
    }
  });

  /**
   * POST /api/printers/reconnect/:serialNumber
   * Reconnect to a saved printer
   */
  router.post('/printers/reconnect/:serialNumber', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const serialNumber = req.params.serialNumber;

      if (!serialNumber) {
        return sendErrorResponse(res, 400, 'Serial number is required');
      }

      const savedPrinter = savedPrinterService.getSavedPrinter(serialNumber);
      if (!savedPrinter) {
        return sendErrorResponse(res, 404, 'Saved printer not found');
      }

      // Connect using saved details
      console.log('[API] Reconnecting to saved printer:', savedPrinter.Name);
      const results = await deps.connectionManager.connectHeadlessFromSaved([savedPrinter]);

      if (results.length === 0 || !results[0].contextId) {
        console.error('[API] Reconnection failed - no context created');
        return sendErrorResponse(res, 500, 'Failed to reconnect to printer');
      }

      const contextId = results[0].contextId;
      console.log('[API] Successfully reconnected to:', savedPrinter.Name);

      return res.json({
        success: true,
        contextId,
        message: `Reconnected to ${savedPrinter.Name}`
      });

    } catch (error) {
      console.error('[API] Printer reconnection failed:', error);
      const appError = toAppError(error);
      return sendErrorResponse(res, 500, appError.message);
    }
  });
}
