/**
 * @fileoverview Printer Discovery Feature
 * Handles network scanning and printer discovery UI
 */

import { apiRequest } from '../core/Transport.js';
import { $, showElement, hideElement, showToast } from '../shared/dom.js';

interface DiscoveredPrinter {
  name: string;
  ipAddress: string;
  serialNumber: string;
  model?: string;
}

interface SavedPrinterMatch {
  discovered: DiscoveredPrinter;
  saved: unknown | null;
  isKnown: boolean;
  ipAddressChanged: boolean;
}

let scanInProgress = false;

/**
 * Initialize discovery feature
 */
export function initializeDiscovery(): void {
  setupDiscoveryButton();
  setupDiscoveryModal();
}

/**
 * Setup "Add Printer" button in header
 */
function setupDiscoveryButton(): void {
  const header = document.querySelector('.header-right');
  if (!header) {
    return;
  }

  // Create button
  const addButton = document.createElement('button');
  addButton.id = 'add-printer-btn';
  addButton.className = 'add-printer-btn';
  addButton.title = 'Add Printer';
  addButton.innerHTML = '<i data-lucide="plus" aria-hidden="true"></i><span>Add Printer</span>';
  addButton.addEventListener('click', () => {
    showElement('discovery-modal');
    loadSavedPrinters();
  });

  // Insert before settings button
  const settingsBtn = header.querySelector('#settings-button');
  if (settingsBtn) {
    header.insertBefore(addButton, settingsBtn);
  } else {
    header.appendChild(addButton);
  }

  // Re-render lucide icons
  if (typeof (window as never)['lucide'] !== 'undefined') {
    ((window as never)['lucide'] as { createIcons: () => void }).createIcons();
  }
}

/**
 * Setup discovery modal event handlers
 */
function setupDiscoveryModal(): void {
  // Tab switching
  const tabBtns = document.querySelectorAll('.discovery-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      if (!tabName) return;

      // Update active tab button
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update active tab pane
      const panes = document.querySelectorAll('.discovery-tab-pane');
      panes.forEach(pane => {
        if (pane.id === `discovery-tab-${tabName}`) {
          pane.classList.remove('hidden');
        } else {
          pane.classList.add('hidden');
        }
      });
    });
  });

  // Network scan button
  const scanBtn = $('discovery-scan-btn');
  scanBtn?.addEventListener('click', () => void startNetworkScan());

  // Manual connection
  const manualBtn = $('discovery-manual-connect');
  manualBtn?.addEventListener('click', () => void connectManually());

  // Printer type change handler
  const typeSelect = $('discovery-printer-type') as HTMLSelectElement | null;
  typeSelect?.addEventListener('change', () => {
    const checkCodeGroup = $('discovery-check-code-group');
    if (typeSelect.value === 'new') {
      checkCodeGroup?.classList.remove('hidden');
    } else {
      checkCodeGroup?.classList.add('hidden');
    }
  });

  // Close button
  const closeBtn = $('close-discovery');
  closeBtn?.addEventListener('click', () => hideElement('discovery-modal'));
}

/**
 * Start network scan for printers
 */
async function startNetworkScan(): Promise<void> {
  if (scanInProgress) return;

  scanInProgress = true;

  const scanBtn = $('discovery-scan-btn');
  const scanProgress = $('discovery-scan-progress');
  const discoveredContainer = $('discovery-discovered-printers');

  scanBtn?.classList.add('hidden');
  scanProgress?.classList.remove('hidden');
  discoveredContainer?.classList.add('hidden');

  try {
    const response = await apiRequest<{
      success: boolean;
      printers?: DiscoveredPrinter[];
      savedMatches?: SavedPrinterMatch[];
      error?: string;
    }>('/api/discovery/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeout: 15000,
        interval: 2000,
        retries: 3
      })
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
  const printerList = $('discovery-printer-list');
  const container = $('discovery-discovered-printers');

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
            Connect
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
        void connectToDiscoveredPrinter(ip, serial, name || '', model || '');
      }
    });
  });

  container.classList.remove('hidden');
}

/**
 * Get saved printer by serial number
 */
async function getSavedPrinterBySerial(serialNumber: string): Promise<{ Name: string; IPAddress: string; SerialNumber: string; CheckCode?: string; printerModel?: string } | null> {
  if (!serialNumber) {
    return null;
  }

  try {
    const response = await apiRequest<{
      success: boolean;
      printers?: { Name: string; IPAddress: string; SerialNumber: string; CheckCode?: string; printerModel?: string }[];
      error?: string;
    }>('/api/printers/saved');

    if (!response.success || !response.printers) {
      return null;
    }

    return response.printers.find(p => p.SerialNumber === serialNumber) || null;
  } catch (error) {
    console.error('Failed to fetch saved printers:', error);
    return null;
  }
}

/**
 * Connect to a discovered printer
 */
async function connectToDiscoveredPrinter(
  ip: string,
  serial: string,
  name: string,
  _model: string
): Promise<void> {
  try {
    showToast('Detecting printer type...', 'info');

    // STEP 1: Probe printer to detect type and capabilities
    const detectResponse = await apiRequest<{
      success: boolean;
      typeName?: string;
      name?: string;
      serialNumber?: string;
      is5MFamily?: boolean;
      requiresCheckCode?: boolean;
      clientType?: string;
      error?: string;
    }>('/api/printers/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ipAddress: ip })
    });

    if (!detectResponse.success || !detectResponse.typeName) {
      throw new Error(detectResponse.error || 'Failed to detect printer type');
    }

    const { typeName, serialNumber, is5MFamily, requiresCheckCode, clientType } = detectResponse;
    const detectedName = detectResponse.name || name;
    const detectedSerial = serialNumber || serial;
    const type = clientType || (is5MFamily ? 'new' : 'legacy');

    console.log(`[Discovery] Detected: ${typeName} (${is5MFamily ? '5M family' : 'legacy'})`);

    // STEP 2: Get check code if needed
    let checkCode: string | undefined;
    if (requiresCheckCode && is5MFamily) {
      // Check if printer is already saved with a check code
      const savedPrinter = await getSavedPrinterBySerial(detectedSerial);

      if (savedPrinter?.CheckCode && savedPrinter.CheckCode !== '123') {
        // Use saved check code
        checkCode = savedPrinter.CheckCode;
        console.log('[Discovery] Using saved check code');
      } else {
        // Prompt user for check code
        checkCode = prompt(`Enter the check code for ${detectedName} (8 digits):`) || undefined;
        if (!checkCode || checkCode.length !== 8) {
          showToast('Invalid check code - must be 8 digits', 'error');
          return;
        }
      }
    }

    // STEP 3: Connect with detected type and check code
    showToast('Connecting to printer...', 'info');

    const response = await apiRequest<{
      success: boolean;
      contextId?: string;
      error?: string;
    }>('/api/printers/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ipAddress: ip,
        serialNumber: detectedSerial,
        name: detectedName,
        model: typeName,
        type,
        checkCode
      })
    });

    if (!response.success) {
      throw new Error(response.error || 'Connection failed');
    }

    showToast(`Connected to ${detectedName}!`, 'success');
    hideElement('discovery-modal');

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
  const ipInput = $('discovery-manual-ip') as HTMLInputElement | null;
  const typeSelect = $('discovery-printer-type') as HTMLSelectElement | null;
  const checkCodeInput = $('discovery-check-code') as HTMLInputElement | null;

  if (!ipInput || !typeSelect) return;

  const ip = ipInput.value.trim();
  const userSelectedType = typeSelect.value;
  const userCheckCode = checkCodeInput?.value.trim();

  // Validate IP
  if (!ip) {
    showToast('Please enter an IP address', 'error');
    return;
  }

  try {
    showToast('Detecting printer type...', 'info');

    // STEP 1: Auto-detect printer type
    const detectResponse = await apiRequest<{
      success: boolean;
      typeName?: string;
      name?: string;
      serialNumber?: string;
      is5MFamily?: boolean;
      requiresCheckCode?: boolean;
      clientType?: string;
      error?: string;
    }>('/api/printers/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ipAddress: ip })
    });

    if (!detectResponse.success || !detectResponse.typeName) {
      throw new Error(detectResponse.error || 'Failed to detect printer type');
    }

    const { typeName, serialNumber, is5MFamily, requiresCheckCode, clientType } = detectResponse;
    const detectedName = detectResponse.name || `Printer at ${ip}`;
    const detectedSerial = serialNumber || '';
    const detectedType = clientType || (is5MFamily ? 'new' : 'legacy');

    console.log(`[Manual] Detected: ${typeName} (${is5MFamily ? '5M family' : 'legacy'})`);

    // STEP 2: Validate user selection against detection (warn if mismatch)
    if (userSelectedType !== detectedType) {
      const proceed = confirm(
        `Warning: You selected "${userSelectedType}" but the printer was detected as "${detectedType}".\n\n` +
        `Using detected type: ${detectedType}\n\nContinue?`
      );
      if (!proceed) {
        return;
      }
    }

    // STEP 3: Get check code if needed
    let checkCode: string | undefined;
    if (requiresCheckCode && is5MFamily) {
      // Check if printer is already saved with a check code
      const savedPrinter = await getSavedPrinterBySerial(detectedSerial);

      if (savedPrinter?.CheckCode && savedPrinter.CheckCode !== '123') {
        // Use saved check code
        checkCode = savedPrinter.CheckCode;
        console.log('[Manual] Using saved check code');
      } else if (userCheckCode && userCheckCode.length === 8) {
        // Use user-provided check code from form
        checkCode = userCheckCode;
      } else {
        // Prompt user for check code
        checkCode = prompt(`Enter the check code for ${detectedName} (8 digits):`) || undefined;
        if (!checkCode || checkCode.length !== 8) {
          showToast('Invalid check code - must be 8 digits', 'error');
          return;
        }
      }
    }

    // STEP 4: Connect with detected type
    showToast('Connecting to printer...', 'info');

    const response = await apiRequest<{
      success: boolean;
      contextId?: string;
      error?: string;
    }>('/api/printers/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ipAddress: ip,
        serialNumber: detectedSerial,
        name: detectedName,
        model: typeName,
        type: detectedType,
        checkCode
      })
    });

    if (!response.success) {
      throw new Error(response.error || 'Connection failed');
    }

    showToast('Connected successfully!', 'success');
    hideElement('discovery-modal');

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
  const savedList = $('discovery-saved-printers-list');
  if (!savedList) return;

  try {
    const response = await apiRequest<{
      success: boolean;
      printers?: { Name: string; IPAddress: string; SerialNumber: string; printerModel?: string; lastConnected?: string }[];
      error?: string;
    }>('/api/printers/saved');

    if (!response.success || !response.printers || response.printers.length === 0) {
      savedList.innerHTML = '<p class="text-muted">No saved printers found.</p>';
      return;
    }

    savedList.innerHTML = response.printers.map(printer => `
      <div class="saved-printer-card">
        <div class="printer-info">
          <h4>${printer.Name}</h4>
          <p class="printer-details">${printer.IPAddress} • ${printer.printerModel || 'Unknown Model'}</p>
          <small class="text-muted">Last connected: ${printer.lastConnected ? new Date(printer.lastConnected).toLocaleDateString() : 'Never'}</small>
        </div>
        <div class="printer-actions">
          <button class="btn btn-primary reconnect-btn" data-serial="${printer.SerialNumber}">
            Reconnect
          </button>
          <button class="btn btn-danger delete-btn" data-serial="${printer.SerialNumber}">
            Delete
          </button>
        </div>
      </div>
    `).join('');

    // Setup reconnect buttons
    const reconnectBtns = savedList.querySelectorAll('.reconnect-btn');
    reconnectBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const serial = btn.getAttribute('data-serial');
        if (serial) {
          void reconnectToSavedPrinter(serial);
        }
      });
    });

    // Setup delete buttons
    const deleteBtns = savedList.querySelectorAll('.delete-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const serial = btn.getAttribute('data-serial');
        if (serial && confirm('Are you sure you want to delete this printer?')) {
          void deleteSavedPrinter(serial);
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

    const response = await apiRequest<{
      success: boolean;
      contextId?: string;
      error?: string;
    }>(`/api/printers/reconnect/${serialNumber}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });

    if (!response.success) {
      throw new Error(response.error || 'Reconnection failed');
    }

    showToast('Reconnected successfully!', 'success');
    hideElement('discovery-modal');

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
    const response = await apiRequest<{
      success: boolean;
      error?: string;
    }>(`/api/printers/saved/${serialNumber}`, {
      method: 'DELETE'
    });

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
