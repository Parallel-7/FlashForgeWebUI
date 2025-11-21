/**
 * @fileoverview Headless DialogIntegrationService for standalone WebUI mode
 *
 * Provides a no-op implementation of DialogIntegrationService for headless Node.js operation.
 * All dialog requests return sensible defaults since there's no user interaction in headless mode.
 *
 * This adapter allows ConnectionFlowManager to work without requiring Electron dialog windows.
 */

import type { DiscoveredPrinter, SavedPrinterMatch, ConnectionResult, StoredPrinterDetails } from '../types/printer';

/**
 * Branded type for DialogIntegrationService singleton
 */
type DialogIntegrationServiceBrand = { readonly __brand: 'DialogIntegrationService' };
type DialogIntegrationServiceInstance = DialogIntegrationService & DialogIntegrationServiceBrand;

/**
 * Headless DialogIntegrationService - returns defaults for all dialogs
 */
export class DialogIntegrationService {
  private static instance: DialogIntegrationServiceInstance | null = null;

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DialogIntegrationServiceInstance {
    if (!DialogIntegrationService.instance) {
      DialogIntegrationService.instance = new DialogIntegrationService() as DialogIntegrationServiceInstance;
    }
    return DialogIntegrationService.instance;
  }

  /**
   * Confirm disconnect for scan (headless: always allow)
   */
  public async confirmDisconnectForScan(_currentPrinterName?: string): Promise<boolean> {
    console.log('[Dialog] Auto-allowing disconnect for scan (headless mode)');
    return true;
  }

  /**
   * Show printer selection dialog (headless: return first printer)
   */
  public async showPrinterSelectionDialog(printers: DiscoveredPrinter[]): Promise<DiscoveredPrinter | null> {
    if (printers.length === 0) {
      console.log('[Dialog] No printers available for selection');
      return null;
    }

    console.log(`[Dialog] Auto-selecting first printer: ${printers[0].name} (headless mode)`);
    return printers[0];
  }

  /**
   * Show saved printer selection dialog (headless: call onSelection for first match)
   */
  public async showSavedPrinterSelectionDialog(
    matches: SavedPrinterMatch[],
    onSelection: (serialNumber: string) => Promise<ConnectionResult>
  ): Promise<ConnectionResult> {
    if (matches.length === 0) {
      console.log('[Dialog] No saved printers available for selection');
      return { success: false, error: 'No saved printers available' };
    }

    const firstMatch = matches[0];
    console.log(`[Dialog] Auto-selecting first saved printer: ${firstMatch.savedDetails.Name} (headless mode)`);
    return await onSelection(firstMatch.savedDetails.SerialNumber);
  }

  /**
   * Show auto-connect choice dialog (headless: return 'connect-last-used')
   */
  public async showAutoConnectChoiceDialog(
    lastUsedPrinter: StoredPrinterDetails | null,
    _savedPrinterCount: number
  ): Promise<string | null> {
    if (lastUsedPrinter) {
      console.log(`[Dialog] Auto-selecting 'connect-last-used': ${lastUsedPrinter.Name} (headless mode)`);
      return 'connect-last-used';
    }

    console.log('[Dialog] No last used printer, returning null (headless mode)');
    return null;
  }
}

/**
 * Get singleton instance
 */
export function getDialogIntegrationService(): DialogIntegrationServiceInstance {
  return DialogIntegrationService.getInstance();
}
