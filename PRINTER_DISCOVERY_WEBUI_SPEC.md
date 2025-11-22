# Printer Discovery & Connection WebUI Implementation Specification

**Project:** FlashForgeWebUI
**Date:** 2025-11-22
**Status:** Complete Specification for Implementation

---

## Executive Summary

This specification details the implementation of **comprehensive printer discovery and connection functionality** in the FlashForgeWebUI browser interface. Currently, printer connections can only be established via CLI arguments at server startup. This implementation will add full WebUI-based discovery, connection, and management capabilities.

### Current State Analysis

**What Works:**
- ✅ Backend discovery infrastructure is ported (`PrinterDiscoveryService`)
- ✅ Connection flow management exists (`ConnectionFlowManager`)
- ✅ Connection establishment service works (`ConnectionEstablishmentService`)
- ✅ Saved printer management exists (`SavedPrinterService`)
- ✅ CLI-based connection **attempts to work** but gets stuck during connection handshake
- ✅ Context switching works once printers are connected
- ✅ Multi-printer support architecture is complete

**What's Missing:**
- ❌ WebUI has NO discovery/connection UI (no buttons, modals, or forms)
- ❌ No API routes for discovery operations (`/api/discovery/*`)
- ❌ No API routes for printer management (`/api/printers/*`)
- ❌ CLI connection gets **stuck** during `createTemporaryConnection()` handshake
- ❌ No "Add Printer" button in WebUI
- ❌ No network scan dialog
- ❌ No manual IP entry dialog
- ❌ No saved printer management UI

**Critical Issue to Fix:**
The CLI connection (`node dist/index.js --printers="IP:TYPE:CODE"`) gets stuck after:
```
[Headless] Connecting directly to 192.168.1.108 (new)
TcpPrinterClient creation
Connected
(Legacy API) InitControl()
sendCommand: ~M601 S1
CheckSocket()
```

This happens in `ConnectionEstablishmentService.createTemporaryConnection()` where it calls `tempClient.initControl()` but never receives a response. This needs to be debugged and fixed as part of this implementation.

---

## Implementation Phases

### Phase 1: Fix CLI Connection (CRITICAL)
### Phase 2: Backend API Routes
### Phase 3: Frontend Discovery UI
### Phase 4: Frontend Connection UI
### Phase 5: Saved Printer Management UI
### Phase 6: Integration & Testing

---

## PHASE 1: Fix CLI Connection (CRITICAL)

**Goal:** Make CLI-based printer connection (`--printers`) work reliably.

### Problem Analysis

The connection hangs in `ConnectionEstablishmentService.createTemporaryConnection()`:

**File:** `src/services/ConnectionEstablishmentService.ts` (lines 63-90)

```typescript
public async createTemporaryConnection(printer: DiscoveredPrinter): Promise<TemporaryConnectionResult> {
  try {
    const tempClient = new FlashForgeClient(printer.ipAddress);
    const connected = await tempClient.initControl(); // ← HANGS HERE

    if (!connected) {
      return { success: false, error: 'Failed to establish temporary connection' };
    }

    // Get printer info to determine type
    const printerInfo = await tempClient.getPrinterInfo(); // Never reached
```

**Root Cause:** The `initControl()` method from `@ghosttypes/ff-api` is waiting for a response that never arrives, OR there's a timeout/error that's not being handled properly.

### Tasks to Fix

1. **Add Timeout Handling**
   - Wrap `initControl()` in a Promise.race() with timeout
   - Default timeout: 10 seconds
   - Log timeout errors clearly

2. **Add Connection Retry Logic**
   - Retry connection 2-3 times on failure
   - Exponential backoff between retries

3. **Improve Error Logging**
   - Log exact error from ff-api
   - Log connection state at each step
   - Add debug mode for verbose logging

4. **Test with Real Printer**
   - Verify connection succeeds
   - Verify serial number is extracted
   - Verify model type is detected

### Implementation Details

**File to Edit:** `src/services/ConnectionEstablishmentService.ts`

**Changes Needed:**

```typescript
/**
 * Create temporary connection with timeout and retry logic
 */
public async createTemporaryConnection(
  printer: DiscoveredPrinter,
  timeout = 10000,
  retries = 3
): Promise<TemporaryConnectionResult> {
  this.emit('temporary-connection-started', printer);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Connection] Attempt ${attempt}/${retries} for ${printer.ipAddress}`);

      const tempClient = new FlashForgeClient(printer.ipAddress);

      // Wrap initControl in timeout
      const connected = await Promise.race([
        tempClient.initControl(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), timeout)
        )
      ]);

      if (!connected) {
        console.error(`[Connection] initControl returned false for ${printer.ipAddress}`);
        if (attempt < retries) {
          await this.delay(1000 * attempt); // Exponential backoff
          continue;
        }
        return { success: false, error: 'Failed to initialize control' };
      }

      // Get printer info with timeout
      const printerInfo = await Promise.race([
        tempClient.getPrinterInfo(),
        new Promise<any>((_, reject) =>
          setTimeout(() => reject(new Error('Printer info timeout')), timeout)
        )
      ]) as ExtendedPrinterInfo;

      // Disconnect temporary connection
      await tempClient.disconnect();

      // Success
      return {
        success: true,
        typeName: printerInfo.Type,
        printerInfo
      };

    } catch (error) {
      console.error(`[Connection] Attempt ${attempt} failed:`, error);

      if (attempt < retries) {
        await this.delay(1000 * attempt);
        continue;
      }

      // All retries exhausted
      this.emit('temporary-connection-failed', error);
      return {
        success: false,
        error: getConnectionErrorMessage(error)
      };
    }
  }

  return { success: false, error: 'All connection attempts failed' };
}

private async delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Test Plan:**
1. Run `node dist/index.js --printers="192.168.1.108:new:0e35a229"`
2. Should connect successfully within 10 seconds
3. Should log clear error if connection fails
4. Should retry automatically on timeout

---

## PHASE 2: Backend API Routes

**Goal:** Create REST API endpoints for discovery and printer management.

### New API Routes

**File to Create:** `src/webui/server/routes/discovery-routes.ts`

#### Discovery Routes

```typescript
/**
 * Discovery API Routes
 * Handles network scanning and printer discovery
 */

import { Router } from 'express';
import { z } from 'zod';
import { getPrinterDiscoveryService } from '../../../services/PrinterDiscoveryService';
import { getSavedPrinterService } from '../../../services/SavedPrinterService';
import { requireAuth } from '../auth-middleware';
import type { AuthenticatedRequest, StandardAPIResponse } from '../../types/web-api.types';

export function createDiscoveryRoutes(): Router {
  const router = Router();
  const discoveryService = getPrinterDiscoveryService();
  const savedPrinterService = getSavedPrinterService();

  // All routes require authentication
  router.use(requireAuth);

  /**
   * POST /api/discovery/scan
   * Start network-wide printer discovery
   *
   * Body: { timeout?: number, interval?: number, retries?: number }
   * Response: { success: true, printers: DiscoveredPrinter[], savedMatches: SavedPrinterMatch[] }
   */
  router.post('/scan', async (req: AuthenticatedRequest, res) => {
    try {
      const schema = z.object({
        timeout: z.number().min(1000).max(60000).optional().default(10000),
        interval: z.number().min(500).max(5000).optional().default(2000),
        retries: z.number().min(1).max(5).optional().default(3)
      });

      const params = schema.parse(req.body);

      // Check if discovery is already running
      if (discoveryService.isDiscoveryInProgress()) {
        res.status(409).json({
          success: false,
          error: 'Discovery already in progress'
        } as StandardAPIResponse);
        return;
      }

      // Start discovery
      const discoveredPrinters = await discoveryService.scanNetwork(
        params.timeout,
        params.interval,
        params.retries
      );

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

      res.json({
        success: true,
        printers: discoveredPrinters,
        savedMatches,
        count: discoveredPrinters.length
      });

    } catch (error) {
      console.error('[API] Discovery scan failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Discovery failed'
      } as StandardAPIResponse);
    }
  });

  /**
   * POST /api/discovery/scan-ip
   * Scan a specific IP address for a printer
   *
   * Body: { ipAddress: string }
   * Response: { success: true, printer: DiscoveredPrinter | null }
   */
  router.post('/scan-ip', async (req: AuthenticatedRequest, res) => {
    try {
      const schema = z.object({
        ipAddress: z.string().ip()
      });

      const { ipAddress } = schema.parse(req.body);

      const printer = await discoveryService.scanSingleIP(ipAddress);

      res.json({
        success: true,
        printer,
        found: printer !== null
      });

    } catch (error) {
      console.error('[API] Single IP scan failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'IP scan failed'
      } as StandardAPIResponse);
    }
  });

  /**
   * GET /api/discovery/status
   * Get current discovery status
   *
   * Response: { inProgress: boolean }
   */
  router.get('/status', (req: AuthenticatedRequest, res) => {
    res.json({
      inProgress: discoveryService.isDiscoveryInProgress()
    });
  });

  /**
   * POST /api/discovery/cancel
   * Cancel ongoing discovery
   *
   * Response: { success: true }
   */
  router.post('/cancel', (req: AuthenticatedRequest, res) => {
    discoveryService.cancelDiscovery();
    res.json({
      success: true,
      message: 'Discovery cancelled'
    } as StandardAPIResponse);
  });

  return router;
}
```

---

**File to Create:** `src/webui/server/routes/printer-management-routes.ts`

#### Printer Management Routes

```typescript
/**
 * Printer Management API Routes
 * Handles connecting, disconnecting, and managing printers
 */

import { Router } from 'express';
import { z } from 'zod';
import { getConnectionFlowManager } from '../../../managers/ConnectionFlowManager';
import { getPrinterContextManager } from '../../../managers/PrinterContextManager';
import { getSavedPrinterService } from '../../../services/SavedPrinterService';
import { requireAuth } from '../auth-middleware';
import type { AuthenticatedRequest, StandardAPIResponse } from '../../types/web-api.types';
import type { PrinterClientType } from '../../../types/printer';

export function createPrinterManagementRoutes(): Router {
  const router = Router();
  const connectionManager = getConnectionFlowManager();
  const contextManager = getPrinterContextManager();
  const savedPrinterService = getSavedPrinterService();

  // All routes require authentication
  router.use(requireAuth);

  /**
   * POST /api/printers/connect
   * Connect to a discovered or manually specified printer
   *
   * Body: {
   *   ipAddress: string,
   *   serialNumber?: string,  // From discovery
   *   name?: string,          // From discovery
   *   model?: string,         // From discovery
   *   type: 'new' | 'legacy',
   *   checkCode?: string      // Required for 'new' type
   * }
   *
   * Response: { success: true, contextId: string, printer: PrinterDetails }
   */
  router.post('/connect', async (req: AuthenticatedRequest, res) => {
    try {
      const schema = z.object({
        ipAddress: z.string().ip(),
        serialNumber: z.string().optional(),
        name: z.string().optional(),
        model: z.string().optional(),
        type: z.enum(['new', 'legacy']),
        checkCode: z.string().optional()
      });

      const data = schema.parse(req.body);

      // Validate check code for new printers
      if (data.type === 'new' && !data.checkCode) {
        res.status(400).json({
          success: false,
          error: 'Check code is required for 5M/Pro printers'
        } as StandardAPIResponse);
        return;
      }

      // Build printer spec
      const spec = {
        ip: data.ipAddress,
        type: data.type as PrinterClientType,
        checkCode: data.checkCode
      };

      // Connect via ConnectionFlowManager
      const results = await connectionManager.connectHeadlessDirect([spec]);

      if (results.length === 0 || !results[0].contextId) {
        res.status(500).json({
          success: false,
          error: 'Failed to connect to printer'
        } as StandardAPIResponse);
        return;
      }

      const contextId = results[0].contextId;
      const context = contextManager.getContext(contextId);

      if (!context) {
        res.status(500).json({
          success: false,
          error: 'Context not found after connection'
        } as StandardAPIResponse);
        return;
      }

      res.json({
        success: true,
        contextId,
        printer: context.printerDetails,
        message: `Connected to ${context.printerDetails.Name}`
      });

    } catch (error) {
      console.error('[API] Printer connection failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      } as StandardAPIResponse);
    }
  });

  /**
   * POST /api/printers/disconnect
   * Disconnect a printer context
   *
   * Body: { contextId: string }
   * Response: { success: true }
   */
  router.post('/disconnect', async (req: AuthenticatedRequest, res) => {
    try {
      const schema = z.object({
        contextId: z.string()
      });

      const { contextId } = schema.parse(req.body);

      // Disconnect via ConnectionFlowManager
      await connectionManager.disconnectContext(contextId);

      res.json({
        success: true,
        message: 'Printer disconnected'
      } as StandardAPIResponse);

    } catch (error) {
      console.error('[API] Printer disconnection failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Disconnection failed'
      } as StandardAPIResponse);
    }
  });

  /**
   * GET /api/printers/saved
   * Get all saved printers
   *
   * Response: { printers: StoredPrinterDetails[] }
   */
  router.get('/saved', (req: AuthenticatedRequest, res) => {
    const savedPrinters = savedPrinterService.getSavedPrinters();
    res.json({
      success: true,
      printers: savedPrinters,
      count: savedPrinters.length
    });
  });

  /**
   * DELETE /api/printers/saved/:serialNumber
   * Delete a saved printer
   *
   * Response: { success: true }
   */
  router.delete('/saved/:serialNumber', async (req: AuthenticatedRequest, res) => {
    try {
      const serialNumber = req.params.serialNumber;

      // Check if printer is currently connected
      const contexts = contextManager.getAllContexts();
      const connectedContext = contexts.find(
        ctx => ctx.printerDetails.SerialNumber === serialNumber
      );

      if (connectedContext) {
        res.status(409).json({
          success: false,
          error: 'Cannot delete a connected printer. Disconnect first.'
        } as StandardAPIResponse);
        return;
      }

      // Delete from saved printers
      await savedPrinterService.removePrinter(serialNumber);

      res.json({
        success: true,
        message: 'Printer removed from saved list'
      } as StandardAPIResponse);

    } catch (error) {
      console.error('[API] Failed to delete saved printer:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Delete failed'
      } as StandardAPIResponse);
    }
  });

  /**
   * POST /api/printers/reconnect/:serialNumber
   * Reconnect to a saved printer
   *
   * Response: { success: true, contextId: string }
   */
  router.post('/reconnect/:serialNumber', async (req: AuthenticatedRequest, res) => {
    try {
      const serialNumber = req.params.serialNumber;

      const savedPrinter = savedPrinterService.getSavedPrinter(serialNumber);
      if (!savedPrinter) {
        res.status(404).json({
          success: false,
          error: 'Saved printer not found'
        } as StandardAPIResponse);
        return;
      }

      // Connect using saved details
      const results = await connectionManager.connectHeadlessFromSaved([savedPrinter]);

      if (results.length === 0 || !results[0].contextId) {
        res.status(500).json({
          success: false,
          error: 'Failed to reconnect to printer'
        } as StandardAPIResponse);
        return;
      }

      res.json({
        success: true,
        contextId: results[0].contextId,
        message: `Reconnected to ${savedPrinter.Name}`
      });

    } catch (error) {
      console.error('[API] Printer reconnection failed:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Reconnection failed'
      } as StandardAPIResponse);
    }
  });

  return router;
}
```

---

**File to Edit:** `src/webui/server/api-routes.ts`

Register the new routes:

```typescript
// Add imports
import { createDiscoveryRoutes } from './routes/discovery-routes';
import { createPrinterManagementRoutes } from './routes/printer-management-routes';

// In the route registration section, add:
app.use('/api/discovery', createDiscoveryRoutes());
app.use('/api/printers', createPrinterManagementRoutes());
```

---

## PHASE 3: Frontend Discovery UI

**Goal:** Create UI for discovering printers on the network.

### New Frontend Components

**File to Create:** `src/webui/static/features/printer-discovery.ts`

```typescript
/**
 * Printer Discovery Feature
 * Handles network scanning and printer discovery UI
 */

import { Transport } from '../core/Transport';
import { showDialog, hideDialog, showToast } from '../ui/dialogs';
import { DOM } from '../shared/dom';
import { createIcon } from '../shared/icons';

interface DiscoveredPrinter {
  name: string;
  ipAddress: string;
  serialNumber: string;
  model?: string;
}

interface SavedPrinterMatch {
  discovered: DiscoveredPrinter;
  saved: any | null;
  isKnown: boolean;
  ipAddressChanged: boolean;
}

let scanInProgress = false;

/**
 * Initialize discovery feature
 */
export function initializeDiscovery(transport: Transport): void {
  setupDiscoveryButton();
  setupScanIPButton();
}

/**
 * Setup "Add Printer" button in header
 */
function setupDiscoveryButton(): void {
  // Find or create add printer button in header
  const header = DOM.query('.webui-header');
  if (!header) return;

  const addButton = document.createElement('button');
  addButton.className = 'btn btn-primary add-printer-btn';
  addButton.innerHTML = `
    ${createIcon('plus')}
    <span>Add Printer</span>
  `;
  addButton.addEventListener('click', () => showDiscoveryDialog());

  // Insert before settings button
  const settingsBtn = header.querySelector('.settings-btn');
  if (settingsBtn) {
    header.insertBefore(addButton, settingsBtn);
  } else {
    header.appendChild(addButton);
  }
}

/**
 * Show printer discovery dialog
 */
function showDiscoveryDialog(): void {
  const modalContent = `
    <div class="discovery-modal">
      <h2>Add Printer</h2>

      <div class="discovery-tabs">
        <button class="tab-btn active" data-tab="scan">
          ${createIcon('wifi')} Network Scan
        </button>
        <button class="tab-btn" data-tab="manual">
          ${createIcon('keyboard')} Manual Entry
        </button>
        <button class="tab-btn" data-tab="saved">
          ${createIcon('archive')} Saved Printers
        </button>
      </div>

      <div class="tab-content">
        <!-- Network Scan Tab -->
        <div class="tab-pane active" id="tab-scan">
          <p class="help-text">
            Scan your local network to automatically discover FlashForge printers.
          </p>

          <button class="btn btn-primary btn-block scan-network-btn" id="scan-network-btn">
            ${createIcon('search')} Start Network Scan
          </button>

          <div class="scan-progress hidden" id="scan-progress">
            <div class="spinner"></div>
            <p>Scanning network... This may take up to 30 seconds.</p>
          </div>

          <div class="discovered-printers-container hidden" id="discovered-printers">
            <h3>Discovered Printers</h3>
            <div class="printer-list" id="printer-list"></div>
          </div>
        </div>

        <!-- Manual Entry Tab -->
        <div class="tab-pane" id="tab-manual">
          <p class="help-text">
            Enter the IP address of your printer to connect directly.
          </p>

          <div class="form-group">
            <label for="manual-ip">IP Address</label>
            <input type="text" id="manual-ip" class="form-control" placeholder="192.168.1.100" />
          </div>

          <div class="form-group">
            <label for="printer-type">Printer Type</label>
            <select id="printer-type" class="form-control">
              <option value="new">5M / 5M Pro (New API)</option>
              <option value="legacy">Legacy Printers (Old API)</option>
            </select>
          </div>

          <div class="form-group check-code-group" id="check-code-group">
            <label for="check-code">Check Code</label>
            <input type="text" id="check-code" class="form-control" placeholder="12345678" maxlength="8" />
            <small class="form-text">Required for 5M/Pro printers. Found in printer settings.</small>
          </div>

          <button class="btn btn-primary btn-block" id="connect-manual-btn">
            ${createIcon('link')} Connect to Printer
          </button>
        </div>

        <!-- Saved Printers Tab -->
        <div class="tab-pane" id="tab-saved">
          <p class="help-text">
            Reconnect to a previously saved printer.
          </p>

          <div class="saved-printers-list" id="saved-printers-list">
            <p class="text-muted">Loading saved printers...</p>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary close-discovery-btn">Cancel</button>
      </div>
    </div>
  `;

  showDialog(modalContent, 'discovery-dialog');

  // Setup tab switching
  setupTabs();

  // Setup scan button
  const scanBtn = DOM.query('#scan-network-btn');
  scanBtn?.addEventListener('click', () => startNetworkScan());

  // Setup manual connection
  const manualBtn = DOM.query('#connect-manual-btn');
  manualBtn?.addEventListener('click', () => connectManually());

  // Setup printer type change handler
  const typeSelect = DOM.query('#printer-type') as HTMLSelectElement;
  typeSelect?.addEventListener('change', () => {
    const checkCodeGroup = DOM.query('#check-code-group');
    if (typeSelect.value === 'new') {
      checkCodeGroup?.classList.remove('hidden');
    } else {
      checkCodeGroup?.classList.add('hidden');
    }
  });

  // Load saved printers
  loadSavedPrinters();

  // Setup close button
  const closeBtn = DOM.query('.close-discovery-btn');
  closeBtn?.addEventListener('click', () => hideDialog());
}

/**
 * Setup tab switching
 */
function setupTabs(): void {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      if (!tabName) return;

      // Update active tab button
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update active tab pane
      const panes = document.querySelectorAll('.tab-pane');
      panes.forEach(pane => {
        if (pane.id === `tab-${tabName}`) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });
    });
  });
}

/**
 * Start network scan for printers
 */
async function startNetworkScan(): Promise<void> {
  if (scanInProgress) return;

  scanInProgress = true;

  const scanBtn = DOM.query('#scan-network-btn');
  const scanProgress = DOM.query('#scan-progress');
  const discoveredContainer = DOM.query('#discovered-printers');

  scanBtn?.classList.add('hidden');
  scanProgress?.classList.remove('hidden');
  discoveredContainer?.classList.add('hidden');

  try {
    const response = await Transport.post('/api/discovery/scan', {
      timeout: 15000,
      interval: 2000,
      retries: 3
    });

    if (!response.success) {
      throw new Error(response.error || 'Scan failed');
    }

    displayDiscoveredPrinters(response.savedMatches || []);

  } catch (error) {
    console.error('Network scan failed:', error);
    showToast('Network scan failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
  } finally {
    scanInProgress = false;
    scanBtn?.classList.remove('hidden');
    scanProgress?.classList.add('hidden');
  }
}

/**
 * Display discovered printers
 */
function displayDiscoveredPrinters(matches: SavedPrinterMatch[]): void {
  const printerList = DOM.query('#printer-list');
  const container = DOM.query('#discovered-printers');

  if (!printerList || !container) return;

  if (matches.length === 0) {
    printerList.innerHTML = '<p class="text-muted">No printers found on the network.</p>';
    container.classList.remove('hidden');
    return;
  }

  printerList.innerHTML = matches.map(match => {
    const printer = match.discovered;
    const isKnown = match.isKnown;
    const ipChanged = match.ipAddressChanged;

    return `
      <div class="printer-card ${isKnown ? 'known' : 'new'}">
        <div class="printer-info">
          <h4>${printer.name}</h4>
          <p class="printer-details">
            ${printer.ipAddress} ${printer.model ? `• ${printer.model}` : ''}
          </p>
          ${isKnown ? '<span class="badge badge-success">Saved</span>' : '<span class="badge badge-info">New</span>'}
          ${ipChanged ? '<span class="badge badge-warning">IP Changed</span>' : ''}
        </div>
        <div class="printer-actions">
          <button class="btn btn-primary connect-printer-btn"
                  data-ip="${printer.ipAddress}"
                  data-serial="${printer.serialNumber}"
                  data-name="${printer.name}"
                  data-model="${printer.model || ''}">
            ${createIcon('link')} Connect
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Setup connect buttons
  const connectBtns = printerList.querySelectorAll('.connect-printer-btn');
  connectBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const ip = btn.getAttribute('data-ip');
      const serial = btn.getAttribute('data-serial');
      const name = btn.getAttribute('data-name');
      const model = btn.getAttribute('data-model');

      if (ip && serial) {
        connectToDiscoveredPrinter(ip, serial, name || '', model || '');
      }
    });
  });

  container.classList.remove('hidden');
}

/**
 * Connect to a discovered printer
 */
async function connectToDiscoveredPrinter(
  ip: string,
  serial: string,
  name: string,
  model: string
): Promise<void> {
  try {
    // Determine printer type based on model
    const type = model.includes('5M') || model.includes('Pro') ? 'new' : 'legacy';

    // If new printer, prompt for check code
    let checkCode: string | undefined;
    if (type === 'new') {
      checkCode = prompt('Enter the printer check code (8 digits):');
      if (!checkCode || checkCode.length !== 8) {
        showToast('Invalid check code', 'error');
        return;
      }
    }

    showToast('Connecting to printer...', 'info');

    const response = await Transport.post('/api/printers/connect', {
      ipAddress: ip,
      serialNumber: serial,
      name,
      model,
      type,
      checkCode
    });

    if (!response.success) {
      throw new Error(response.error || 'Connection failed');
    }

    showToast(`Connected to ${name}!`, 'success');
    hideDialog();

    // Reload page to refresh printer list
    window.location.reload();

  } catch (error) {
    console.error('Connection failed:', error);
    showToast('Connection failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
  }
}

/**
 * Connect manually via IP address
 */
async function connectManually(): Promise<void> {
  const ipInput = DOM.query('#manual-ip') as HTMLInputElement;
  const typeSelect = DOM.query('#printer-type') as HTMLSelectElement;
  const checkCodeInput = DOM.query('#check-code') as HTMLInputElement;

  if (!ipInput || !typeSelect) return;

  const ip = ipInput.value.trim();
  const type = typeSelect.value;
  const checkCode = checkCodeInput?.value.trim();

  // Validate IP
  if (!ip) {
    showToast('Please enter an IP address', 'error');
    return;
  }

  // Validate check code for new printers
  if (type === 'new' && (!checkCode || checkCode.length !== 8)) {
    showToast('Please enter a valid 8-digit check code', 'error');
    return;
  }

  try {
    showToast('Connecting to printer...', 'info');

    const response = await Transport.post('/api/printers/connect', {
      ipAddress: ip,
      type,
      checkCode: type === 'new' ? checkCode : undefined
    });

    if (!response.success) {
      throw new Error(response.error || 'Connection failed');
    }

    showToast('Connected successfully!', 'success');
    hideDialog();

    // Reload page to refresh printer list
    window.location.reload();

  } catch (error) {
    console.error('Manual connection failed:', error);
    showToast('Connection failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
  }
}

/**
 * Load and display saved printers
 */
async function loadSavedPrinters(): Promise<void> {
  const savedList = DOM.query('#saved-printers-list');
  if (!savedList) return;

  try {
    const response = await Transport.get('/api/printers/saved');

    if (!response.success || !response.printers || response.printers.length === 0) {
      savedList.innerHTML = '<p class="text-muted">No saved printers found.</p>';
      return;
    }

    savedList.innerHTML = response.printers.map((printer: any) => `
      <div class="saved-printer-card">
        <div class="printer-info">
          <h4>${printer.Name}</h4>
          <p class="printer-details">${printer.IPAddress} • ${printer.printerModel || 'Unknown Model'}</p>
          <small class="text-muted">Last connected: ${new Date(printer.lastConnected).toLocaleDateString()}</small>
        </div>
        <div class="printer-actions">
          <button class="btn btn-primary reconnect-btn" data-serial="${printer.SerialNumber}">
            ${createIcon('refresh-cw')} Reconnect
          </button>
          <button class="btn btn-danger delete-btn" data-serial="${printer.SerialNumber}">
            ${createIcon('trash')} Delete
          </button>
        </div>
      </div>
    `).join('');

    // Setup reconnect buttons
    const reconnectBtns = savedList.querySelectorAll('.reconnect-btn');
    reconnectBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const serial = btn.getAttribute('data-serial');
        if (serial) {
          await reconnectToSavedPrinter(serial);
        }
      });
    });

    // Setup delete buttons
    const deleteBtns = savedList.querySelectorAll('.delete-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const serial = btn.getAttribute('data-serial');
        if (serial && confirm('Are you sure you want to delete this printer?')) {
          await deleteSavedPrinter(serial);
        }
      });
    });

  } catch (error) {
    console.error('Failed to load saved printers:', error);
    savedList.innerHTML = '<p class="text-danger">Failed to load saved printers.</p>';
  }
}

/**
 * Reconnect to a saved printer
 */
async function reconnectToSavedPrinter(serialNumber: string): Promise<void> {
  try {
    showToast('Reconnecting to printer...', 'info');

    const response = await Transport.post(`/api/printers/reconnect/${serialNumber}`, {});

    if (!response.success) {
      throw new Error(response.error || 'Reconnection failed');
    }

    showToast('Reconnected successfully!', 'success');
    hideDialog();

    // Reload page
    window.location.reload();

  } catch (error) {
    console.error('Reconnection failed:', error);
    showToast('Reconnection failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
  }
}

/**
 * Delete a saved printer
 */
async function deleteSavedPrinter(serialNumber: string): Promise<void> {
  try {
    const response = await Transport.delete(`/api/printers/saved/${serialNumber}`);

    if (!response.success) {
      throw new Error(response.error || 'Delete failed');
    }

    showToast('Printer deleted', 'success');

    // Reload saved printers list
    await loadSavedPrinters();

  } catch (error) {
    console.error('Delete failed:', error);
    showToast('Delete failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
  }
}

/**
 * Setup scan IP button (if needed elsewhere)
 */
function setupScanIPButton(): void {
  // Placeholder for future implementation if needed
}
```

---

**File to Edit:** `src/webui/static/app.ts`

Add discovery initialization:

```typescript
import { initializeDiscovery } from './features/printer-discovery';

// After transport initialization
initializeDiscovery(transport);
```

---

**File to Edit:** `src/webui/static/webui.css`

Add discovery styles:

```css
/* Discovery Modal Styles */
.discovery-modal {
  max-width: 700px;
  width: 100%;
}

.discovery-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid var(--theme-surface);
}

.tab-btn {
  padding: 0.75rem 1rem;
  border: none;
  background: transparent;
  color: var(--theme-text);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tab-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

.tab-btn.active {
  border-bottom-color: var(--theme-primary);
  color: var(--theme-primary);
}

.tab-pane {
  display: none;
}

.tab-pane.active {
  display: block;
}

.help-text {
  color: var(--theme-text);
  opacity: 0.8;
  margin-bottom: 1.5rem;
}

.scan-progress {
  text-align: center;
  padding: 2rem;
}

.spinner {
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top: 3px solid var(--theme-primary);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.printer-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border: 1px solid var(--theme-surface);
  border-radius: 8px;
  margin-bottom: 0.75rem;
  background: rgba(255, 255, 255, 0.02);
}

.printer-card.known {
  border-left: 3px solid var(--theme-primary);
}

.printer-card.new {
  border-left: 3px solid #4caf50;
}

.printer-info h4 {
  margin: 0 0 0.5rem 0;
  color: var(--theme-text);
}

.printer-details {
  margin: 0;
  color: var(--theme-text);
  opacity: 0.7;
  font-size: 0.9rem;
}

.badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  margin-left: 0.5rem;
}

.badge-success {
  background: #4caf50;
  color: white;
}

.badge-info {
  background: #2196f3;
  color: white;
}

.badge-warning {
  background: #ff9800;
  color: white;
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  color: var(--theme-text);
  font-weight: 500;
}

.form-control {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--theme-surface);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--theme-text);
  font-size: 1rem;
}

.form-control:focus {
  outline: none;
  border-color: var(--theme-primary);
}

.form-text {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.875rem;
  color: var(--theme-text);
  opacity: 0.7;
}

.btn-block {
  width: 100%;
  justify-content: center;
}

.saved-printer-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border: 1px solid var(--theme-surface);
  border-radius: 8px;
  margin-bottom: 0.75rem;
  background: rgba(255, 255, 255, 0.02);
}

.printer-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-danger {
  background: #f44336;
  color: white;
}

.btn-danger:hover {
  background: #d32f2f;
}

.add-printer-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.hidden {
  display: none !important;
}
```

---

## PHASE 4: Update Transport.ts

**File to Edit:** `src/webui/static/core/Transport.ts`

Add DELETE method support:

```typescript
/**
 * Make DELETE request
 */
public static async delete(url: string): Promise<any> {
  return this.request(url, {
    method: 'DELETE'
  });
}
```

---

## PHASE 5: Update HTML

**File to Edit:** `src/webui/static/index.html`

No changes needed - the discovery dialog is created dynamically via JavaScript.

---

## PHASE 6: Integration Testing

### Test Plan

1. **CLI Connection Test**
   ```bash
   node dist/index.js --printers="192.168.1.108:new:0e35a229"
   ```
   - Should connect within 10 seconds
   - Should NOT hang on CheckSocket()
   - Should log connection success
   - Should create context

2. **Network Scan Test**
   - Open WebUI in browser
   - Click "Add Printer" button
   - Click "Network Scan" tab
   - Click "Start Network Scan"
   - Should show discovered printers within 30 seconds
   - Should indicate which printers are saved/new

3. **Manual Connection Test**
   - Click "Add Printer" button
   - Click "Manual Entry" tab
   - Enter IP address
   - Select printer type
   - Enter check code (for new printers)
   - Click "Connect to Printer"
   - Should connect successfully

4. **Saved Printer Reconnection Test**
   - Click "Add Printer" button
   - Click "Saved Printers" tab
   - Should show list of saved printers
   - Click "Reconnect" on a saved printer
   - Should reconnect successfully

5. **Delete Saved Printer Test**
   - Click "Add Printer" button
   - Click "Saved Printers" tab
   - Click "Delete" on a saved printer
   - Confirm deletion
   - Printer should be removed from list

6. **Disconnect Test**
   - From printer dropdown, select a connected printer
   - (Future: Add disconnect button to UI)
   - Should disconnect and remove from active contexts

---

## Reference Files from FlashForgeUI-Electron

**To Review During Implementation:**

1. **Connection Flow:**
   - `FlashForgeUI-Electron/src/managers/ConnectionFlowManager.ts` (lines 1-1300)
   - Study the discovery → connection → context creation flow

2. **Discovery Service:**
   - `FlashForgeUI-Electron/src/services/PrinterDiscoveryService.ts`
   - Already ported, but verify implementation matches

3. **Connection Establishment:**
   - `FlashForgeUI-Electron/src/services/ConnectionEstablishmentService.ts`
   - Pay special attention to timeout handling

4. **Desktop UI (for reference only):**
   - `FlashForgeUI-Electron/src/renderer/components/PrinterManagementPage.tsx`
   - Study the UX flow and user interactions

5. **IPC Handlers (for API design reference):**
   - `FlashForgeUI-Electron/src/ipc/printerConnectionHandlers.ts`
   - See how discovery/connection was exposed to renderer

---

## Summary of Changes

### Backend Changes (7 files)

1. **Fix:** `src/services/ConnectionEstablishmentService.ts`
   - Add timeout handling to `createTemporaryConnection()`
   - Add retry logic with exponential backoff
   - Improve error logging

2. **New:** `src/webui/server/routes/discovery-routes.ts`
   - POST `/api/discovery/scan` - Network scan
   - POST `/api/discovery/scan-ip` - Single IP scan
   - GET `/api/discovery/status` - Discovery status
   - POST `/api/discovery/cancel` - Cancel scan

3. **New:** `src/webui/server/routes/printer-management-routes.ts`
   - POST `/api/printers/connect` - Connect to printer
   - POST `/api/printers/disconnect` - Disconnect printer
   - GET `/api/printers/saved` - List saved printers
   - DELETE `/api/printers/saved/:serial` - Delete saved printer
   - POST `/api/printers/reconnect/:serial` - Reconnect saved printer

4. **Edit:** `src/webui/server/api-routes.ts`
   - Register discovery and printer management routes

### Frontend Changes (4 files)

5. **New:** `src/webui/static/features/printer-discovery.ts`
   - Network scan UI
   - Manual connection UI
   - Saved printer management UI
   - All user interactions

6. **Edit:** `src/webui/static/core/Transport.ts`
   - Add DELETE method

7. **Edit:** `src/webui/static/app.ts`
   - Initialize discovery feature

8. **Edit:** `src/webui/static/webui.css`
   - Add discovery modal styles
   - Add printer card styles
   - Add form styles

---

## Success Criteria

Implementation is complete when:

- ✅ CLI connection (`--printers`) works without hanging
- ✅ "Add Printer" button appears in WebUI header
- ✅ Network scan discovers printers on local network
- ✅ Manual IP entry connects to specified printer
- ✅ Saved printers can be reconnected
- ✅ Saved printers can be deleted
- ✅ All connections create contexts correctly
- ✅ Printer dropdown updates when new printers connect
- ✅ No console errors in browser
- ✅ No backend errors in terminal

---

## Estimated Implementation Time

- **Phase 1 (Fix CLI):** 2-3 hours
- **Phase 2 (Backend Routes):** 3-4 hours
- **Phase 3 (Frontend Discovery):** 4-5 hours
- **Phase 4-5 (Transport & HTML):** 1 hour
- **Phase 6 (Testing):** 2-3 hours

**Total:** 12-16 hours

---

## Notes for Implementation Agent

1. **Clone FlashForgeUI-Electron** for reference:
   ```bash
   git clone https://github.com/Parallel-7/FlashForgeUI-Electron.git
   cd FlashForgeUI-Electron
   git checkout alpha
   ```

2. **Test with real printer** - The user has a printer at `192.168.1.108` with check code `0e35a229`

3. **Priority:** Fix Phase 1 (CLI connection) FIRST before adding WebUI features

4. **Error Handling:** Be generous with try/catch blocks and user-friendly error messages

5. **Logging:** Add console.log statements for debugging connection flow

6. **TypeScript:** Maintain strict type safety throughout

---

**END OF SPECIFICATION**
