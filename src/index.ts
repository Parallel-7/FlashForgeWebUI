/**
 * @fileoverview Main entry point for FlashForgeWebUI standalone server
 *
 * This is the heart of the application, responsible for initializing all backend
 * services and managers, connecting to printers, and starting the WebUI server.
 *
 * Key responsibilities:
 * - Initialize data directory and configuration
 * - Parse command-line arguments for connection modes and overrides
 * - Initialize all core managers (Config, Context, Connection, Backend)
 * - Setup backend services (Polling, Camera, Spoolman, Monitoring)
 * - Connect to printers based on CLI mode
 * - Start WebUI server for browser access
 * - Handle graceful shutdown on SIGINT/SIGTERM
 */

import * as readline from 'readline';
import { getConfigManager } from './managers/ConfigManager';
import { getConnectionFlowManager } from './managers/ConnectionFlowManager';
import { getPrinterBackendManager } from './managers/PrinterBackendManager';
import { getPrinterContextManager } from './managers/PrinterContextManager';
import { resolveAndEnsureCameraStream } from './services/CameraStreamCoordinator';
import { getDiscordNotificationService } from './services/discord';
import { getGo2rtcService } from './services/Go2rtcService';
import { getMultiContextPollingCoordinator } from './services/MultiContextPollingCoordinator';
import { getMultiContextPrintStateMonitor } from './services/MultiContextPrintStateMonitor';
import { getMultiContextSpoolmanTracker } from './services/MultiContextSpoolmanTracker';
import { getMultiContextTemperatureMonitor } from './services/MultiContextTemperatureMonitor';
import { getSavedPrinterService } from './services/SavedPrinterService';
import { initializeSpoolmanIntegrationService } from './services/SpoolmanIntegrationService';
import type { PollingData } from './types/polling';
import type { PrinterClientType, PrinterDetails } from './types/printer';
import { getCameraUserConfig } from './utils/camera-utils';
import type { HeadlessConfig, PrinterSpec } from './utils/HeadlessArguments';
import { parseHeadlessArguments, validateHeadlessConfig } from './utils/HeadlessArguments';
import { applyPerPrinterDefaults } from './utils/printerSettingsDefaults';
import { createHardDeadline } from './utils/ShutdownTimeout';
import { initializeDataDirectory } from './utils/setup';
import { getWebUIManager } from './webui/server/WebUIManager';

// Initialize global singleton services
const configManager = getConfigManager();
const connectionManager = getConnectionFlowManager();
const contextManager = getPrinterContextManager();
const backendManager = getPrinterBackendManager();
const pollingCoordinator = getMultiContextPollingCoordinator();
const savedPrinterService = getSavedPrinterService();
const webUIManager = getWebUIManager();
const go2rtcService = getGo2rtcService();
const discordService = getDiscordNotificationService();

let connectedContexts: string[] = [];
let isInitialized = false;
let isShuttingDown = false;

/**
 * Shutdown timeout configuration
 *
 * Layered timeout strategy:
 * 1. Per-operation timeouts (disconnect: 5s, webui: 3s)
 * 2. Hard deadline (10s absolute maximum)
 *
 * This prevents hangs from unresponsive printers or stuck HTTP connections
 */
const SHUTDOWN_CONFIG = {
  /** Hard deadline - forces process.exit(1) if exceeded */
  HARD_DEADLINE_MS: 10000,
  /** Per-printer disconnect timeout (parallelized, so 3 printers = ~5s total) */
  DISCONNECT_TIMEOUT_MS: 5000,
  /** WebUI server graceful close timeout */
  WEBUI_STOP_TIMEOUT_MS: 3000,
} as const;

/**
 * Apply configuration overrides from CLI arguments
 */
async function applyConfigOverrides(config: HeadlessConfig): Promise<void> {
  if (config.webUIPort !== undefined) {
    configManager.set('WebUIPort', config.webUIPort);
    console.log(`[Config] WebUI port override: ${config.webUIPort}`);
  }

  if (config.webUIPassword !== undefined) {
    configManager.set('WebUIPassword', config.webUIPassword);
    console.log('[Config] WebUI password override applied');
  }

  // Force enable WebUI
  configManager.set('WebUIEnabled', true);
}

/**
 * Connect to the last used printer
 */
async function connectLastUsed(): Promise<string[]> {
  console.log('[Connection] Connecting to last used printer...');

  const lastUsedPrinter = savedPrinterService.getLastUsedPrinter();
  if (!lastUsedPrinter) {
    console.error('[Connection] No last used printer found in saved printer details');
    return [];
  }

  console.log(
    `[Connection] Found last used printer: ${lastUsedPrinter.Name} (${lastUsedPrinter.IPAddress})`
  );

  // Convert StoredPrinterDetails to PrinterDetails
  const printerDetails: PrinterDetails = applyPerPrinterDefaults({
    Name: lastUsedPrinter.Name,
    IPAddress: lastUsedPrinter.IPAddress,
    SerialNumber: lastUsedPrinter.SerialNumber,
    CheckCode: lastUsedPrinter.CheckCode,
    ClientType: lastUsedPrinter.ClientType as PrinterClientType,
    printerModel: lastUsedPrinter.printerModel,
    modelType: lastUsedPrinter.modelType,
    customCameraEnabled: lastUsedPrinter.customCameraEnabled,
    customCameraUrl: lastUsedPrinter.customCameraUrl,
    customLedsEnabled: lastUsedPrinter.customLedsEnabled,
    forceLegacyMode: lastUsedPrinter.forceLegacyMode,
  });

  const results = await connectionManager.connectHeadlessFromSaved([printerDetails]);

  return results.map((r) => r.contextId);
}

/**
 * Connect to all saved printers
 */
async function connectAllSaved(): Promise<string[]> {
  const savedPrinters = savedPrinterService.getSavedPrinters();

  if (savedPrinters.length === 0) {
    console.error('[Connection] No saved printers found');
    return [];
  }

  console.log(`[Connection] Connecting to ${savedPrinters.length} saved printer(s)...`);

  // Convert StoredPrinterDetails to PrinterDetails
  const printerDetailsList: PrinterDetails[] = savedPrinters.map((saved) =>
    applyPerPrinterDefaults({
      Name: saved.Name,
      IPAddress: saved.IPAddress,
      SerialNumber: saved.SerialNumber,
      CheckCode: saved.CheckCode,
      ClientType: saved.ClientType as PrinterClientType,
      printerModel: saved.printerModel,
      modelType: saved.modelType,
      customCameraEnabled: saved.customCameraEnabled,
      customCameraUrl: saved.customCameraUrl,
      customLedsEnabled: saved.customLedsEnabled,
      forceLegacyMode: saved.forceLegacyMode,
    })
  );

  const results = await connectionManager.connectHeadlessFromSaved(printerDetailsList);

  return results.map((r) => r.contextId);
}

/**
 * Connect to explicitly specified printers
 */
async function connectExplicit(printerSpecs: PrinterSpec[]): Promise<string[]> {
  if (printerSpecs.length === 0) {
    console.error('[Connection] No printer specifications provided');
    return [];
  }

  console.log(
    `[Connection] Connecting to ${printerSpecs.length} explicitly specified printer(s)...`
  );

  const results = await connectionManager.connectHeadlessDirect(printerSpecs);

  return results.map((r) => r.contextId);
}

/**
 * Connect to printers based on configured mode
 */
async function connectPrinters(config: HeadlessConfig): Promise<string[]> {
  switch (config.mode) {
    case 'last-used':
      return await connectLastUsed();

    case 'all-saved':
      return await connectAllSaved();

    case 'explicit-printers':
      return await connectExplicit(config.printers || []);

    case 'no-printers':
      console.log('[Connection] Starting without printer connections (--no-printers)');
      return [];

    default:
      console.error(`[Connection] Unknown mode: ${config.mode}`);
      return [];
  }
}

/**
 * Start WebUI server and verify it's running
 */
async function startWebUI(): Promise<void> {
  try {
    console.log('[WebUI] Starting WebUI server...');

    // Enable auto-start after all services are initialized
    webUIManager.enableAutoStart();

    const success = await webUIManager.start();

    if (!success) {
      console.error('[WebUI] Failed to start - check permissions and port availability');
      process.exit(1);
    }

    const status = webUIManager.getStatus();
    if (!status.isRunning) {
      console.error('[WebUI] Server is not running after start attempt');
      process.exit(1);
    }

    console.log(`[WebUI] Server running at http://${status.serverIP}:${status.port}`);
    console.log(`[WebUI] Access from this machine: http://localhost:${status.port}`);
  } catch (error) {
    console.error('[WebUI] Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Setup event forwarding from polling coordinator to WebUI
 */
function setupEventForwarding(): void {
  // Forward polling data to WebUI for real-time updates
  // For WebUI (single-printer or multi-printer), forward all context data
  // The WebUI/WebSocket layer will handle filtering if needed
  pollingCoordinator.on('polling-data', (contextId: string, data: PollingData) => {
    if (data?.printerStatus) {
      discordService.updatePrinterStatus(contextId, data.printerStatus);
    }

    // Forward all polling data regardless of active context
    // This ensures data reaches the WebUI even if active context isn't set yet
    webUIManager.handlePollingUpdate(contextId, data);
    console.log(`[Events] Forwarded polling data for context: ${contextId}`);
  });

  console.log('[Events] Event forwarding configured for WebUI');
}

/**
 * Reconcile a context's camera stream against current printer details and features.
 */
async function reconcileCameraStream(contextId: string): Promise<void> {
  try {
    const context = contextManager.getContext(contextId);
    if (!context) {
      await go2rtcService.removeStream(contextId);
      return;
    }

    const backend = backendManager.getBackendForContext(contextId);
    if (!backend) {
      await go2rtcService.removeStream(contextId);
      return;
    }

    const ensuredStream = await resolveAndEnsureCameraStream({
      contextId,
      printerIpAddress: context.printerDetails.IPAddress,
      printerFeatures: backend.getBackendStatus().features,
      userConfig: getCameraUserConfig(contextId),
      go2rtcService,
    });

    if (!ensuredStream) {
      return;
    }

    console.log(`[Camera] Stream ready for context: ${contextId}`);
  } catch (error) {
    console.error(`[Camera] Failed to reconcile stream for context ${contextId}:`, error);
  }
}

/**
 * Initialize camera streams for all currently connected contexts.
 */
async function reconcileConnectedCameraStreams(): Promise<void> {
  for (const contextId of connectedContexts) {
    await reconcileCameraStream(contextId);
  }
}

/**
 * Setup signal handlers for graceful shutdown
 */
function setupSignalHandlers(): void {
  // Handle Ctrl+C (works on all platforms including Windows)
  process.on('SIGINT', () => {
    if (isShuttingDown) {
      console.log('\n[Shutdown] Force exit (second Ctrl+C)');
      process.exit(1);
    }
    console.log('\n[Shutdown] Received SIGINT signal (Ctrl+C)');
    isShuttingDown = true;
    void shutdown()
      .then(() => {
        process.exit(0);
      })
      .catch((error) => {
        console.error('[Shutdown] Error during shutdown:', error);
        process.exit(1);
      });
  });

  // Handle termination signal (Linux/Mac)
  process.on('SIGTERM', () => {
    console.log('\n[Shutdown] Received SIGTERM signal');
    void shutdown()
      .then(() => {
        process.exit(0);
      })
      .catch((error) => {
        console.error('[Shutdown] Error during shutdown:', error);
        process.exit(1);
      });
  });

  // Windows-specific: Handle process termination
  if (process.platform === 'win32') {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on('SIGINT', () => {
      process.emit('SIGINT');
    });
  }
}

/**
 * Gracefully shutdown the application
 *
 * Implements a three-tier timeout strategy:
 * 1. Hard deadline (10s) - ultimate fallback with process.exit(1)
 * 2. Parallel disconnects (5s each, concurrent) - one hung printer doesn't block others
 * 3. WebUI stop (3s) - force-close connections if timeout
 *
 * This ensures the application always exits within 10 seconds, even if
 * printers are unresponsive or HTTP connections are stuck.
 */
async function shutdown(): Promise<void> {
  if (!isInitialized) {
    return;
  }

  const startTime = Date.now();
  console.log('[Shutdown] Starting graceful shutdown...');

  // Set hard deadline - ultimate fallback to prevent indefinite hangs
  const hardDeadline = createHardDeadline(SHUTDOWN_CONFIG.HARD_DEADLINE_MS);

  try {
    // Step 1: Stop polling (immediate)
    console.log('[Shutdown] Step 1/5: Stopping polling...');
    pollingCoordinator.stopAllPolling();
    console.log('[Shutdown] Polling stopped');

    // Step 2: Stop Discord notifications
    console.log('[Shutdown] Step 2/5: Stopping Discord notifications...');
    discordService.dispose();
    console.log('[Shutdown] Discord notifications stopped');

    // Step 3: Parallel disconnects (all printers disconnect concurrently)
    console.log(`[Shutdown] Step 3/5: Disconnecting ${connectedContexts.length} context(s)...`);
    if (connectedContexts.length > 0) {
      const results = await Promise.allSettled(
        connectedContexts.map((contextId) => connectionManager.disconnectContext(contextId))
      );

      const succeeded = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.filter((result) => result.status === 'rejected').length;

      console.log(`[Shutdown] Disconnect: ${succeeded} succeeded, ${failed} failed`);

      // Log individual failures for debugging
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(`[Shutdown] Context ${connectedContexts[index]} failed:`, result.reason);
        }
      });
    } else {
      console.log('[Shutdown] No contexts to disconnect');
    }

    // Step 4: Stop go2rtc camera streaming service
    console.log('[Shutdown] Step 4/5: Stopping camera streaming...');
    await go2rtcService.shutdown();
    console.log('[Shutdown] Camera streaming stopped');

    // Step 5: Stop WebUI (with timeout and force-close fallback)
    console.log('[Shutdown] Step 5/5: Stopping WebUI...');
    await webUIManager.stop(SHUTDOWN_CONFIG.WEBUI_STOP_TIMEOUT_MS);
    console.log('[Shutdown] WebUI stopped');

    clearTimeout(hardDeadline);
    const duration = Date.now() - startTime;
    console.log(`[Shutdown] Complete (${duration}ms)`);
  } catch (error) {
    console.error('[Shutdown] Error:', error);
    // Hard deadline will still fire if we exceed max time
  }
}

/**
 * Main application initialization
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('FlashForgeWebUI - Standalone WebUI Server');
  console.log('='.repeat(60));

  try {
    // 1. Initialize data directory
    console.log('[Init] Initializing data directory...');
    initializeDataDirectory();

    // 2. Parse CLI arguments
    const config = parseHeadlessArguments();
    console.log(`[Init] Mode: ${config.mode}`);

    // 3. Validate configuration
    const validation = validateHeadlessConfig(config);
    if (!validation.valid) {
      console.error('[Init] Configuration validation failed:');
      validation.errors.forEach((error) => {
        console.error(`  - ${error}`);
      });
      process.exit(1);
    }

    // 4. Wait for config to be loaded
    console.log('[Init] Loading configuration...');
    await new Promise<void>((resolve) => {
      if (configManager.isConfigLoaded()) {
        resolve();
      } else {
        configManager.once('config-loaded', () => resolve());
      }
    });

    // 5. Initialize go2rtc camera streaming service
    await go2rtcService.initialize();
    console.log('[Init] go2rtc camera streaming service initialized');

    // 6. Initialize Spoolman integration service (before config changes)
    initializeSpoolmanIntegrationService(configManager, contextManager, backendManager);
    console.log('[Init] Spoolman integration service initialized');

    // 7. Apply CLI overrides (after services are initialized)
    await applyConfigOverrides(config);

    // 8. Initialize monitoring systems
    const multiContextTempMonitor = getMultiContextTemperatureMonitor();
    multiContextTempMonitor.initialize();
    console.log('[Init] Temperature monitor initialized');

    // Print state monitor is initialized automatically via singleton pattern
    getMultiContextPrintStateMonitor();
    console.log('[Init] Print state monitor initialized');

    discordService.initialize();
    console.log('[Init] Discord notification service initialized');

    // 9. Initialize Spoolman usage tracking
    const multiContextSpoolmanTracker = getMultiContextSpoolmanTracker();
    multiContextSpoolmanTracker.initialize();
    console.log('[Init] Spoolman tracker initialized');

    // 10. Setup event handlers BEFORE connecting to printers
    // This ensures handlers are ready when backend-initialized events fire during connection
    setupEventForwarding();

    // 10b. Setup post-connection hook for logging
    connectionManager.on('connected', (printerDetails) => {
      console.log(`[Events] Printer connected: ${printerDetails.Name}`);
      // Polling and monitors are initialized by backend-initialized handler
    });
    console.log('[Events] Post-connection hook configured');

    // 10c. Setup backend-initialized hook to start polling, create monitors, and reconcile camera streams
    // This is critical for Spoolman deduction and print state monitoring
    // IMPORTANT: This handles both startup connections AND dynamic connections (API reconnect/discovery)
    connectionManager.on('backend-initialized', (event: unknown) => {
      const backendEvent = event as { contextId: string; modelType: string };
      const contextId = backendEvent.contextId;

      console.log(`[Events] Backend initialized for context ${contextId}, starting services...`);

      try {
        // STEP 1: Start polling FIRST (this creates the pollingService reference)
        pollingCoordinator.startPollingForContext(contextId);
        console.log(`[Polling] Started for context: ${contextId}`);

        // STEP 2: Get context and polling service (now available after step 1)
        const context = contextManager.getContext(contextId);
        const pollingService = context?.pollingService;

        if (!pollingService) {
          console.error('[Events] Missing polling service for context initialization');
          return;
        }

        // STEP 3: Create PrintStateMonitor for this context
        const printStateMonitor = getMultiContextPrintStateMonitor();
        printStateMonitor.createMonitorForContext(contextId, pollingService);
        const stateMonitor = printStateMonitor.getMonitor(contextId);

        if (!stateMonitor) {
          console.error('[Events] Failed to create print state monitor');
          return;
        }

        console.log(`[Events] Created PrintStateMonitor for context ${contextId}`);

        // STEP 4: Create TemperatureMonitor for this context
        const temperatureMonitor = getMultiContextTemperatureMonitor();
        temperatureMonitor.createMonitorForContext(contextId, pollingService, stateMonitor);
        const contextTemperatureMonitor = temperatureMonitor.getMonitor(contextId);

        if (!contextTemperatureMonitor) {
          console.error('[Events] Failed to create temperature monitor');
          return;
        }

        console.log(`[Events] Created TemperatureMonitor for context ${contextId}`);

        // STEP 5: Create SpoolmanTracker for this context (depends on PrintStateMonitor)
        const spoolmanTracker = getMultiContextSpoolmanTracker();
        spoolmanTracker.createTrackerForContext(contextId, stateMonitor);

        console.log(`[Events] Created SpoolmanTracker for context ${contextId}`);
        discordService.registerContext(contextId);
        discordService.attachContextMonitors(contextId, stateMonitor, contextTemperatureMonitor);
        console.log(`[Events] Registered Discord notifications for context ${contextId}`);
        void reconcileCameraStream(contextId);
        console.log(`[Events] All services initialized for context ${contextId}`);
      } catch (error) {
        console.error(`[Events] Failed to initialize services for context ${contextId}:`, error);
      }
    });
    console.log('[Events] Backend-initialized hook configured');

    contextManager.on('context-updated', (contextId: string) => {
      void reconcileCameraStream(contextId);
    });
    console.log('[Events] Context-updated hook configured');

    connectionManager.on(
      'feature-updated',
      (event: { contextId?: string; changedKeys?: readonly string[] }) => {
        const contextId = event.contextId;
        if (!contextId) {
          return;
        }

        const changedKeys = event.changedKeys || [];
        if (!changedKeys.includes('oemCameraStreamUrl')) {
          return;
        }

        void reconcileCameraStream(contextId);
      }
    );
    console.log('[Events] Feature-updated hook configured');

    connectionManager.on('pre-disconnect', (contextId: string) => {
      void go2rtcService.removeStream(contextId);
    });
    console.log('[Events] Pre-disconnect hook configured');

    contextManager.on('context-removed', (event: { contextId: string }) => {
      void go2rtcService.removeStream(event.contextId);
    });
    console.log('[Events] Context-removed hook configured');

    // 11. Connect to printers (handlers are now ready to receive backend-initialized events)
    console.log('[Init] Connecting to printers...');
    connectedContexts = await connectPrinters(config);

    if (connectedContexts.length === 0 && config.mode !== 'no-printers') {
      console.warn('[Warning] No printers connected, but WebUI will still start');
    } else if (connectedContexts.length > 0) {
      console.log(`[Init] Connected to ${connectedContexts.length} printer(s)`);

      // Log connection summary
      for (const contextId of connectedContexts) {
        const context = contextManager.getContext(contextId);
        if (context) {
          console.log(`  - ${context.printerDetails.Name} (${context.printerDetails.IPAddress})`);
        }
      }
    }

    // 12. Start WebUI server
    await startWebUI();

    // 13. Note: Polling, monitors, and camera streams are initialized by backend-initialized handler
    // This handler fires for both startup connections AND dynamic connections
    if (connectedContexts.length > 0) {
      console.log(
        `[Init] Services initialized for ${connectedContexts.length} printer(s) via backend-initialized handler`
      );
    }

    // 14. Reconcile camera streams for any contexts already connected
    if (connectedContexts.length > 0) {
      await reconcileConnectedCameraStreams();
    }

    // 15. Setup signal handlers
    setupSignalHandlers();

    isInitialized = true;

    console.log('='.repeat(60));
    console.log('[Ready] FlashForgeWebUI is ready');
    console.log('[Ready] Press Ctrl+C to stop');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('[Fatal] Initialization failed:', error);
    process.exit(1);
  }
}

// Start the application
void main();
