/**
 * @fileoverview Service for network scanning and printer discovery operations.
 *
 * Provides network-based printer discovery functionality:
 * - Network-wide printer scanning
 * - Specific IP address printer detection
 * - Discovery timeout and interval configuration
 * - Discovered printer data normalization
 * - Discovery state management (in-progress tracking)
 * - Integration with ff-api's PrinterDiscovery
 *
 * Key exports:
 * - PrinterDiscoveryService class: Network discovery coordinator
 * - getPrinterDiscoveryService(): Singleton accessor
 *
 * This service encapsulates all network scanning logic, providing a simple interface
 * for discovering FlashForge printers on the local network. Used by ConnectionFlowManager
 * during the printer connection workflow to present available printers to the user.
 *
 * The UDP protocol itself (multicast/broadcast/loopback probing, and parsing of the
 * 276-byte modern and 140-byte legacy response formats) lives in @ghosttypes/ff-api.
 * This service only maps the library's result into the local DiscoveredPrinter shape.
 */

import { type DiscoveredPrinter as FFDiscoveredPrinter, PrinterDiscovery } from '@ghosttypes/ff-api';
import { EventEmitter } from 'events';

import type { DiscoveredPrinter } from '../types/printer';

/**
 * Map a library discovery result into the local DiscoveredPrinter shape.
 *
 * `model` is intentionally left as 'Unknown': model resolution happens later in
 * ConnectionEstablishmentService, which maps `productId` through NEW_API_PRODUCT_IDS
 * to the local PrinterModelType.
 */
const toDiscoveredPrinter = (printer: FFDiscoveredPrinter): DiscoveredPrinter => ({
  name: printer.name || 'Unknown Printer',
  ipAddress: printer.ipAddress,
  serialNumber: printer.serialNumber || '',
  commandPort: printer.commandPort,
  eventPort: printer.eventPort,
  // USB product ID identifies the model authoritatively (e.g. Creator 5 = 0x0028),
  // which is essential for HTTP-only models that can't be TCP-probed.
  productId: printer.productId,
  model: 'Unknown',
  status: 'Discovered',
});

/**
 * Service responsible for discovering printers on the network
 * Encapsulates all network scanning logic
 */
export class PrinterDiscoveryService extends EventEmitter {
  private static instance: PrinterDiscoveryService | null = null;
  private discoveryInProgress = false;

  private constructor() {
    super();
  }

  /**
   * Get singleton instance of PrinterDiscoveryService
   */
  public static getInstance(): PrinterDiscoveryService {
    if (!PrinterDiscoveryService.instance) {
      PrinterDiscoveryService.instance = new PrinterDiscoveryService();
    }
    return PrinterDiscoveryService.instance;
  }

  /**
   * Discover all printers on the network
   * @param timeout - Discovery timeout in milliseconds (default: 10000)
   * @param interval - Discovery interval in milliseconds (default: 2000)
   * @param retries - Number of discovery retries (default: 3)
   * @returns Array of discovered printers
   */
  public async scanNetwork(
    timeout = 10000,
    interval = 2000,
    retries = 3
  ): Promise<DiscoveredPrinter[]> {
    if (this.discoveryInProgress) {
      throw new Error('Discovery already in progress');
    }

    this.discoveryInProgress = true;
    this.emit('discovery-started');

    try {
      const discovery = new PrinterDiscovery();
      const rawPrinters = await discovery.discover({
        timeout,
        idleTimeout: interval,
        maxRetries: retries,
      });

      const discoveredPrinters = rawPrinters.map(toDiscoveredPrinter);

      this.emit('discovery-completed', discoveredPrinters);
      return discoveredPrinters;
    } catch (error) {
      this.emit('discovery-failed', error);
      throw error;
    } finally {
      this.discoveryInProgress = false;
    }
  }

  /**
   * Scan a specific IP address for a printer
   * @param ipAddress - The IP address to scan
   * @returns Discovered printer or null if not found
   */
  public async scanSingleIP(ipAddress: string): Promise<DiscoveredPrinter | null> {
    this.emit('single-scan-started', ipAddress);

    try {
      const discovery = new PrinterDiscovery();
      const rawPrinters = await discovery.discover({
        timeout: 5000,
        idleTimeout: 1000,
        maxRetries: 1,
      });

      const matchingPrinter = rawPrinters.find((printer) => printer.ipAddress === ipAddress);
      const discoveredPrinter = matchingPrinter ? toDiscoveredPrinter(matchingPrinter) : null;

      this.emit('single-scan-completed', discoveredPrinter);
      return discoveredPrinter;
    } catch (error) {
      this.emit('single-scan-failed', { ipAddress, error });
      return null;
    }
  }

  /**
   * Check if discovery is currently in progress
   */
  public isDiscoveryInProgress(): boolean {
    return this.discoveryInProgress;
  }

  /**
   * Cancel ongoing discovery (if supported by the API)
   */
  public cancelDiscovery(): void {
    if (this.discoveryInProgress) {
      // Note: the underlying UDP discovery is short-lived and cannot currently be interrupted mid-flight.
      this.discoveryInProgress = false;
      this.emit('discovery-cancelled');
    }
  }
}

export const getPrinterDiscoveryService = (): PrinterDiscoveryService => {
  return PrinterDiscoveryService.getInstance();
};
