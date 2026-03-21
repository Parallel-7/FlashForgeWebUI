/**
 * @fileoverview Guarded HTTP hooks used exclusively by live hardware E2E coverage.
 *
 * Exposes narrow Discord-notification trigger surfaces so Playwright can exercise the
 * real notification pipeline without waiting on timers or issuing any printer control
 * commands. These routes are only registered when FFUI_E2E_HARDWARE=1 is set and only
 * accept loopback requests.
 */

import type { Response, Router } from 'express';
import { getDiscordNotificationService } from '../../../services/discord';
import type { StandardAPIResponse } from '../../types/web-api.types';
import type { AuthenticatedRequest } from '../auth-middleware';
import { type RouteDependencies, resolveContext, sendErrorResponse } from './route-helpers';

function isLoopbackAddress(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return value === '127.0.0.1' || value === '::1' || value === '::ffff:127.0.0.1';
}

function ensureE2ERequestAllowed(req: AuthenticatedRequest, res: Response): boolean {
  if (process.env.FFUI_E2E_HARDWARE !== '1') {
    sendErrorResponse<StandardAPIResponse>(res, 404, 'Not found');
    return false;
  }

  const remoteAddress = req.socket.remoteAddress;
  if (!isLoopbackAddress(remoteAddress)) {
    sendErrorResponse<StandardAPIResponse>(res, 403, 'Forbidden');
    return false;
  }

  return true;
}

export function registerE2ERoutes(router: Router, deps: RouteDependencies): void {
  if (process.env.FFUI_E2E_HARDWARE !== '1') {
    return;
  }

  router.post(
    '/e2e/discord/send-current-status',
    async (req: AuthenticatedRequest, res: Response) => {
      if (!ensureE2ERequestAllowed(req, res)) {
        return;
      }

      const contextResult = resolveContext(req, deps, { requireBackendReady: true });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(
          res,
          contextResult.statusCode,
          contextResult.error
        );
      }

      try {
        await getDiscordNotificationService().sendCurrentStatusNow(contextResult.contextId);
        return res.json({
          success: true,
          contextId: contextResult.contextId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return sendErrorResponse<StandardAPIResponse>(res, 500, message);
      }
    }
  );

  router.post(
    '/e2e/discord/send-print-complete',
    async (req: AuthenticatedRequest, res: Response) => {
      if (!ensureE2ERequestAllowed(req, res)) {
        return;
      }

      const contextResult = resolveContext(req, deps, { requireBackendReady: true });
      if (!contextResult.success) {
        return sendErrorResponse<StandardAPIResponse>(
          res,
          contextResult.statusCode,
          contextResult.error
        );
      }

      const { fileName, durationSeconds } = req.body as {
        fileName?: string;
        durationSeconds?: number;
      };

      if (!fileName || typeof fileName !== 'string' || fileName.trim().length === 0) {
        return sendErrorResponse<StandardAPIResponse>(res, 400, 'fileName is required');
      }

      try {
        await getDiscordNotificationService().sendPrintCompleteNow(
          contextResult.contextId,
          fileName.trim(),
          typeof durationSeconds === 'number' ? durationSeconds : undefined
        );
        return res.json({
          success: true,
          contextId: contextResult.contextId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return sendErrorResponse<StandardAPIResponse>(res, 500, message);
      }
    }
  );
}
