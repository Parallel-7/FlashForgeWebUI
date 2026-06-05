/**
 * @fileoverview Spoolman integration routes (config, search, active spool management).
 */

import { FiveMClient } from '@ghosttypes/ff-api';
import type { Response, Router } from 'express';
import { toAppError } from '../../../utils/error.utils';
import {
  createValidationError,
  SlotConfigRequestSchema,
  SpoolClearRequestSchema,
  SpoolSelectRequestSchema,
} from '../../schemas/web-api.schemas';
import type {
  ActiveSpoolResponse,
  SlotConfigResponse,
  SpoolmanConfigResponse,
  SpoolSearchResponse,
  SpoolSelectResponse,
  SpoolSummary,
  StandardAPIResponse,
} from '../../types/web-api.types';
import type { AuthenticatedRequest } from '../auth-middleware';
import { type RouteDependencies, resolveContext, sendErrorResponse } from './route-helpers';

export function registerSpoolmanRoutes(router: Router, deps: RouteDependencies): void {
  router.get('/spoolman/config', async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const activeContextId = deps.contextManager.getActiveContextId();
      if (!activeContextId) {
        return sendErrorResponse<SpoolmanConfigResponse>(res, 503, 'No active printer context', {
          enabled: false,
          serverUrl: '',
          updateMode: 'weight',
          contextId: null,
        });
      }

      const enabled =
        deps.spoolmanService.isGloballyEnabled() &&
        deps.spoolmanService.isContextSupported(activeContextId);
      const disabledReason = deps.spoolmanService.getDisabledReason(activeContextId);

      const response: SpoolmanConfigResponse = {
        success: true,
        enabled,
        disabledReason,
        serverUrl: deps.spoolmanService.getServerUrl(),
        updateMode: deps.spoolmanService.getUpdateMode(),
        contextId: activeContextId,
      };
      return res.json(response);
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<SpoolmanConfigResponse>(res, 500, appError.message, {
        enabled: false,
        serverUrl: '',
        updateMode: 'weight',
        contextId: null,
      });
    }
  });

  router.get('/spoolman/spools', async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!deps.spoolmanService.isGloballyEnabled()) {
        return sendErrorResponse<SpoolSearchResponse>(
          res,
          400,
          'Spoolman integration is not enabled',
          { spools: [] }
        );
      }

      const searchParam =
        typeof req.query?.search === 'string' ? req.query.search.trim() : undefined;

      const searchQuery: import('../../../types/spoolman').SpoolSearchQuery = {
        limit: 50,
        allow_archived: false,
      };

      if (searchParam) {
        searchQuery['filament.name'] = searchParam;
      }

      const spoolsData = await deps.spoolmanService.fetchSpools(searchQuery);
      const spools: SpoolSummary[] = spoolsData.map((spool) => ({
        id: spool.id,
        name: spool.filament.name || `Spool #${spool.id}`,
        vendor: spool.filament.vendor?.name || null,
        material: spool.filament.material || null,
        colorHex: spool.filament.color_hex || '#808080',
        rawColorHex: spool.filament.color_hex || null,
        multiColorHexes: spool.filament.multi_color_hexes || null,
        remainingWeight: spool.remaining_weight || 0,
        remainingLength: spool.remaining_length || 0,
        archived: spool.archived,
      }));

      const response: SpoolSearchResponse = {
        success: true,
        spools,
      };
      return res.json(response);
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<SpoolSearchResponse>(res, 500, appError.message, { spools: [] });
    }
  });

  router.get('/spoolman/active/:contextId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const contextResult = resolveContext(req, deps, { paramName: 'contextId' });
      if (!contextResult.success) {
        return sendErrorResponse<ActiveSpoolResponse>(
          res,
          contextResult.statusCode,
          contextResult.error,
          { spool: null }
        );
      }

      if (!deps.spoolmanService.isContextSupported(contextResult.contextId)) {
        return sendErrorResponse<ActiveSpoolResponse>(
          res,
          409,
          'Spoolman integration is disabled for this printer (AD5X with material station)',
          { spool: null }
        );
      }

      const spool = deps.spoolmanService.getActiveSpool(contextResult.contextId);
      const response: ActiveSpoolResponse = {
        success: true,
        spool,
      };
      return res.json(response);
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<ActiveSpoolResponse>(res, 500, appError.message, { spool: null });
    }
  });

  router.post('/spoolman/select', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validation = SpoolSelectRequestSchema.safeParse(req.body);
      if (!validation.success) {
        const validationError = createValidationError(validation.error);
        return sendErrorResponse<StandardAPIResponse>(res, 400, validationError.error);
      }

      const { contextId, spoolId } = validation.data;
      const overrideContextId = contextId || null;
      const contextResult = resolveContext(req, deps, { overrideContextId });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(
          res,
          contextResult.statusCode,
          contextResult.error
        );
      }

      if (!deps.spoolmanService.isContextSupported(contextResult.contextId)) {
        return sendErrorResponse<StandardAPIResponse>(
          res,
          409,
          'Spoolman integration is disabled for this printer (AD5X with material station)'
        );
      }

      const spoolData = await deps.spoolmanService.getSpoolById(spoolId);
      await deps.spoolmanService.setActiveSpool(contextResult.contextId, spoolData);

      const response: SpoolSelectResponse = {
        success: true,
        spool: spoolData,
      };
      return res.json(response);
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });

  router.delete('/spoolman/select', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validation = SpoolClearRequestSchema.safeParse(req.body);
      if (!validation.success) {
        const validationError = createValidationError(validation.error);
        return sendErrorResponse<StandardAPIResponse>(res, 400, validationError.error);
      }

      const { contextId } = validation.data;
      const overrideContextId = contextId || null;
      const contextResult = resolveContext(req, deps, { overrideContextId });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(
          res,
          contextResult.statusCode,
          contextResult.error
        );
      }

      if (!deps.spoolmanService.isContextSupported(contextResult.contextId)) {
        return sendErrorResponse<StandardAPIResponse>(
          res,
          409,
          'Spoolman integration is disabled for this printer (AD5X with material station)'
        );
      }

      await deps.spoolmanService.clearActiveSpool(contextResult.contextId);
      return res.json({
        success: true,
        message: 'Active spool cleared',
      });
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<StandardAPIResponse>(res, 500, appError.message);
    }
  });

  router.post('/spoolman/slot-config', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validation = SlotConfigRequestSchema.safeParse(req.body);
      if (!validation.success) {
        const validationError = createValidationError(validation.error);
        return sendErrorResponse<SlotConfigResponse>(res, 400, validationError.error);
      }

      const { contextId, slot, materialName, colorHex, currentMaterial } = validation.data;
      const overrideContextId = contextId || null;

      const contextResult = resolveContext(req, deps, {
        overrideContextId,
        requireBackendReady: true,
        requireBackendInstance: true,
      });
      if (!contextResult.success) {
        return sendErrorResponse<SlotConfigResponse>(
          res,
          contextResult.statusCode,
          contextResult.error
        );
      }

      const { contextId: resolvedContextId, backend } = contextResult;
      if (!backend) {
        return sendErrorResponse<SlotConfigResponse>(res, 503, 'Backend not available');
      }

      if (!deps.backendManager.isFeatureAvailable(resolvedContextId, 'material-station')) {
        return sendErrorResponse<SlotConfigResponse>(
          res,
          400,
          'Material station not available on this printer'
        );
      }

      // Resolve the material to write: the client snaps the spool material to the
      // fixed palette; when it does not resolve, keep the slot's current material.
      const materialToWrite = materialName ?? currentMaterial ?? null;
      if (!materialToWrite) {
        return sendErrorResponse<SlotConfigResponse>(
          res,
          400,
          'Spool material did not match a known material and the slot has no current material to keep'
        );
      }

      const primaryClient = backend.getPrimaryClient();
      if (!(primaryClient instanceof FiveMClient)) {
        return sendErrorResponse<SlotConfigResponse>(
          res,
          400,
          'Material station control requires new API client'
        );
      }

      const result = await primaryClient.control.configureSlot(slot, materialToWrite, colorHex);
      const response: SlotConfigResponse = {
        success: result,
        slot,
        material: materialToWrite,
        colorHex,
        message: result ? `Slot ${slot} updated` : undefined,
        error: result ? undefined : 'Failed to configure slot',
      };
      return res.status(result ? 200 : 500).json(response);
    } catch (error) {
      const appError = toAppError(error);
      return sendErrorResponse<SlotConfigResponse>(res, 500, appError.message);
    }
  });
}
