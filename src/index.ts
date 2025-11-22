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

import { getConfigManager } from './managers/ConfigManager';
import { getConnectionFlowManager } from './managers/ConnectionFlowManager';
import { getPrinterBackendManager } from './managers/PrinterBackendManager';
import { getPrinterContextManager } from './managers/PrinterContextManager';
import { getWebUIManager } from './webui/server/WebUIManager';
import { getMultiContextPollingCoordinator } from './services/MultiContextPollingCoordinator';
import { getMultiContextPrintStateMonitor } from './services/MultiContextPrintStateMonitor';
import { getMultiContextTemperatureMonitor } from './services/MultiContextTemperatureMonitor';
import { getMultiContextSpoolmanTracker } from './services/MultiContextSpoolmanTracker';
import { getCameraProxyService } from './services/CameraProxyService';
import { getRtspStreamService } from './services/RtspStreamService';
import { initializeSpoolmanIntegrationService } from './services/SpoolmanIntegrationService';
import { getSavedPrinterService } from './services/SavedPrinterService';
import { parseHeadlessArguments, validateHeadlessConfig } from './utils/HeadlessArguments';
import type { HeadlessConfig, PrinterSpec } from './utils/HeadlessArguments';
import type { PrinterDetails, PrinterClientType } from './types/printer';
import { initializeDataDirectory } from './utils/setup';

// Initialize global singleton services
const configManager = getConfigManager();
const connectionManager = getConnectionFlowManager();
const contextManager = getPrinterContextManager();
const backendManager = getPrinterBackendManager();
const pollingCoordinator = getMultiContextPollingCoordinator();
const savedPrinterService = getSavedPrinterService();
const webUIManager = getWebUIManager();
// Camera proxy service is initialized but not directly used - proxies are created per-context
// @ts-expect-error - cameraProxyService will be used for direct camera operations in future
const _cameraProxyService = getCameraProxyService();

let connectedContexts: string[] = [];
let isInitialized = false;

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

  console.log(`[Connection] Found last used printer: ${lastUsedPrinter.Name} (${lastUsedPrinter.IPAddress})`);

  // Convert StoredPrinterDetails to PrinterDetails
  const printerDetails: PrinterDetails = {
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
  };

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
  const printerDetailsList: PrinterDetails[] = savedPrinters.map((saved) => ({
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
  }));

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

  console.log(`[Connection] Connecting to ${printerSpecs.length} explicitly specified printer(s)...`);

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pollingCoordinator.on('polling-data', (contextId: string, data: any) => {
    const activeContextId = contextManager.getActiveContextId();
    if (activeContextId === contextId) {
      webUIManager.handlePollingUpdate(data);
    }
  });

  console.log('[Events] Event forwarding configured for WebUI');
}

/**
 * Start polling for all connected contexts
 */
function startPolling(): void {
  for (const contextId of connectedContexts) {
    try {
      pollingCoordinator.startPollingForContext(contextId);
      console.log(`[Polling] Started for context: ${contextId}`);
    } catch (error) {
      console.error(`[Polling] Failed to start for context ${contextId}:`, error);
    }
  }
}

/**
 * Initialize camera proxies for all connected contexts
 */
async function initializeCameraProxies(): Promise<void> {
  for (const contextId of connectedContexts) {
    try {
      const context = contextManager.getContext(contextId);
      if (!context) {
        continue;
      }

      // Camera proxies are created automatically during connection
      // Just log status
      console.log(`[Camera] Proxy ready for context: ${contextId}`);
    } catch (error) {
      console.error(`[Camera] Failed to initialize for context ${contextId}:`, error);
    }
  }
}

/**
 * Setup signal handlers for graceful shutdown
 */
function setupSignalHandlers(): void {
  // Handle Ctrl+C (works on all platforms including Windows)
  process.on('SIGINT', () => {
    console.log('\n[Shutdown] Received SIGINT signal (Ctrl+C)');
    void shutdown().then(() => {
      process.exit(0);
    }).catch((error) => {
      console.error('[Shutdown] Error during shutdown:', error);
      process.exit(1);
    });
  });

  // Handle termination signal (Linux/Mac)
  process.on('SIGTERM', () => {
    console.log('\n[Shutdown] Received SIGTERM signal');
    void shutdown().then(() => {
      process.exit(0);
    }).catch((error) => {
      console.error('[Shutdown] Error during shutdown:', error);
      process.exit(1);
    });
  });

  // Windows-specific: Handle process termination
  if (process.platform === 'win32') {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on('SIGINT', () => {
      process.emit('SIGINT' as any);
    });
  }
}

/**
 * Gracefully shutdown the application
 */
async function shutdown(): Promise<void> {
  if (!isInitialized) {
    return;
  }

  console.log('[Shutdown] Stopping services...');

  try {
    // Stop all polling
    pollingCoordinator.stopAllPolling();
    console.log('[Shutdown] Polling stopped');

    // Disconnect all printers
    for (const contextId of connectedContexts) {
      try {
        await connectionManager.disconnectContext(contextId);
        console.log(`[Shutdown] Disconnected context: ${contextId}`);
      } catch (error) {
        console.error(`[Shutdown] Error disconnecting context ${contextId}:`, error);
      }
    }

    // Stop WebUI
    await webUIManager.stop();
    console.log('[Shutdown] WebUI server stopped');

    console.log('[Shutdown] Graceful shutdown complete');
  } catch (error) {
    console.error('[Shutdown] Error during shutdown:', error);
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
      validation.errors.forEach((error) => console.error(`  - ${error}`));
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

    // 5. Initialize RTSP stream service (before config changes)
    const rtspStreamService = getRtspStreamService();
    await rtspStreamService.initialize();
    console.log('[Init] RTSP stream service initialized');

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

    // 9. Initialize Spoolman usage tracking
    const multiContextSpoolmanTracker = getMultiContextSpoolmanTracker();
    multiContextSpoolmanTracker.initialize();
    console.log('[Init] Spoolman tracker initialized');

    // 10. Connect to printers
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

    // 11. Start WebUI server
    await startWebUI();

    // 12. Setup event forwarding
    setupEventForwarding();

    // 13. Start polling for connected printers
    if (connectedContexts.length > 0) {
      startPolling();
      console.log(`[Init] Polling started for ${connectedContexts.length} printer(s)`);
    }

    // 14. Initialize camera proxies
    if (connectedContexts.length > 0) {
      await initializeCameraProxies();
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
