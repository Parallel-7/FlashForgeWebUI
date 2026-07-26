/**
 * @fileoverview Express router composition for the WebUI HTTP API.
 *
 * Wires together modular route registrations so each domain (status, control, jobs, etc.) can
 * stay focused and reusable. Shared manager dependencies are resolved once and passed into the
 * registration helpers, enabling multi-context REST support and easier future maintenance.
 */

import { Router } from 'express';
import { getConfigManager } from '../../managers/ConfigManager';
import { getPrinterConnectionManager } from '../../managers/ConnectionFlowManager';
import { getPrinterBackendManager } from '../../managers/PrinterBackendManager';
import { getPrinterContextManager } from '../../managers/PrinterContextManager';
import { getSpoolmanIntegrationService } from '../../services/SpoolmanIntegrationService';
import { createAuthMiddleware } from './auth-middleware';
import { registerCalibrationRoutes } from './routes/calibration-routes';
import { registerCameraRoutes } from './routes/camera-routes';
import { registerContextRoutes } from './routes/context-routes';
import { registerDiscoveryRoutes } from './routes/discovery-routes';
import { registerFileManagerRoutes } from './routes/file-manager-routes';
import { registerFiltrationRoutes } from './routes/filtration-routes';
import { registerJobRoutes } from './routes/job-routes';
import { registerPrinterPowerRoutes } from './routes/printer-power-routes';
import { registerPrinterControlRoutes } from './routes/printer-control-routes';
import { registerPrinterDetectionRoutes } from './routes/printer-detection-routes';
import { registerPrinterManagementRoutes } from './routes/printer-management-routes';
import { registerPrinterStatusRoutes } from './routes/printer-status-routes';
import type { RouteDependencies } from './routes/route-helpers';
import { registerSpoolmanRoutes } from './routes/spoolman-routes';
import { registerSSHSettingsRoutes } from './routes/ssh-settings-routes';
import { registerTemperatureRoutes } from './routes/temperature-routes';
import { registerThemeRoutes } from './routes/theme-routes';

export function buildRouteDependencies(): RouteDependencies {
  return {
    backendManager: getPrinterBackendManager(),
    connectionManager: getPrinterConnectionManager(),
    contextManager: getPrinterContextManager(),
    configManager: getConfigManager(),
    spoolmanService: getSpoolmanIntegrationService(),
  };
}

export function createAPIRoutes(deps: RouteDependencies = buildRouteDependencies()): Router {
  const router = Router();

  // Per-route authentication: wrap each HTTP-verb registration method so the auth
  // middleware is prepended to every route's handler chain. This MUST be per-route
  // (rather than a pathless `router.use(auth)` or a blanket `app.use('/api', auth)`),
  // because any pathless auth layer runs for EVERY /api/* request — including
  // unknown paths — and would turn would-be 404s into 401s, defeating the
  // app-level /api/*splat 404 handler. With per-route binding, requests to unknown
  // /api/* paths find no matching route and fall through to 404, while every
  // registered route stays authenticated exactly as before.
  const auth = createAuthMiddleware();
  type Verb = 'get' | 'post' | 'put' | 'patch' | 'delete';
  const verbs: readonly Verb[] = ['get', 'post', 'put', 'patch', 'delete'];
  const routerMethods = router as unknown as Record<Verb, (...args: unknown[]) => Router>;
  for (const verb of verbs) {
    const original = routerMethods[verb].bind(router);
    routerMethods[verb] = (path: unknown, ...handlers: unknown[]): Router =>
      original(path, auth, ...handlers);
  }

  registerPrinterStatusRoutes(router, deps);
  registerPrinterControlRoutes(router, deps);
  registerTemperatureRoutes(router, deps);
  registerFiltrationRoutes(router, deps);
  registerJobRoutes(router, deps);
  registerCameraRoutes(router, deps);
  registerContextRoutes(router, deps);
  registerThemeRoutes(router, deps);
  registerSpoolmanRoutes(router, deps);
  registerDiscoveryRoutes(router, deps);
  registerPrinterDetectionRoutes(router, deps);
  registerPrinterManagementRoutes(router, deps);
  registerCalibrationRoutes(router, deps);
  registerFileManagerRoutes(router, deps);
  registerSSHSettingsRoutes(router, deps);
  registerPrinterPowerRoutes(router, deps);

  return router;
}
