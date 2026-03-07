/**
 * @fileoverview Service for network scanning and printer discovery operations.
 *
 * Provides network-based printer discovery functionality:
 * - Network-wide printer scanning
 * - Specific IP address printer detection
 * - Discovery timeout and interval configuration
 * - Discovered printer data normalization
 * - Discovery state management (in-progress tracking)
 * - Support for legacy and modern FlashForge UDP discovery packet layouts
 *
 * Key exports:
 * - PrinterDiscoveryService class: Network discovery coordinator
 * - getPrinterDiscoveryService(): Singleton accessor
 *
 * This service encapsulates all network scanning logic, providing a simple interface
 * for discovering FlashForge printers on the local network. Used by ConnectionFlowManager
 * during the printer connection workflow to present available printers to the user.
 */

import * as dgram from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { EventEmitter } from 'events';

import type { DiscoveredPrinter } from '../types/printer';

const DISCOVERY_BIND_PORT = 18007;
const DISCOVERY_MESSAGE = Buffer.from([
  0x77, 0x77, 0x77, 0x2e, 0x75, 0x73, 0x72, 0x22, 0x65, 0x36, 0xc0, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00,
]);
const BROADCAST_DISCOVERY_PORT = 48899;
const MODERN_MULTICAST_PORT = 19000;
const LEGACY_MULTICAST_PORT = 8899;
const MODERN_DISCOVERY_PACKET_SIZE = 276;
const LEGACY_DISCOVERY_PACKET_SIZE = 140;
const LOOPBACK_ADDRESS = '127.0.0.1';
const MULTICAST_ADDRESS = '225.0.0.9';

interface DiscoveryTarget {
  readonly address: string;
  readonly port: number;
}

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
      const discoveredPrinters = await this.discoverPrintersAsync(timeout, interval, retries);
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
      const rawPrinters = await this.discoverPrintersAsync(5000, 1000, 1);
      const matchingPrinter = rawPrinters.find((printer) => printer.ipAddress === ipAddress) ?? null;

      this.emit('single-scan-completed', matchingPrinter);
      return matchingPrinter;
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

  private async discoverPrintersAsync(
    timeoutMs: number,
    idleTimeoutMs: number,
    maxRetries: number
  ): Promise<DiscoveredPrinter[]> {
    const printers = new Map<string, DiscoveredPrinter>();

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

      try {
        await this.bindSocket(socket);
        socket.setBroadcast(true);
        socket.setMulticastTTL(1);

        const targets = this.getDiscoveryTargets();
        for (const target of targets) {
          try {
            socket.send(DISCOVERY_MESSAGE, target.port, target.address);
          } catch (error) {
            console.warn(
              `[Discovery] Failed to send UDP probe to ${target.address}:${target.port}:`,
              error
            );
          }
        }

        await this.receivePrinterResponses(socket, printers, timeoutMs, idleTimeoutMs);
      } finally {
        socket.close();
      }

      if (printers.size > 0) {
        break;
      }

      if (attempt < maxRetries - 1) {
        await this.delay(1000);
      }
    }

    return Array.from(printers.values());
  }

  private async bindSocket(socket: dgram.Socket): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.bind(DISCOVERY_BIND_PORT, () => {
        socket.off('error', reject);
        resolve();
      });
    });
  }

  private async receivePrinterResponses(
    socket: dgram.Socket,
    printers: Map<string, DiscoveredPrinter>,
    totalTimeoutMs: number,
    idleTimeoutMs: number
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      let totalTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
      let idleTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const cleanup = (): void => {
        if (totalTimeoutHandle) {
          clearTimeout(totalTimeoutHandle);
        }
        if (idleTimeoutHandle) {
          clearTimeout(idleTimeoutHandle);
        }
        socket.off('message', handleMessage);
        socket.off('error', handleError);
      };

      const finish = (callback: () => void): void => {
        cleanup();
        callback();
      };

      const resetIdleTimeout = (): void => {
        if (idleTimeoutHandle) {
          clearTimeout(idleTimeoutHandle);
        }
        idleTimeoutHandle = setTimeout(() => {
          finish(resolve);
        }, idleTimeoutMs);
      };

      const handleMessage = (buffer: Buffer, rinfo: dgram.RemoteInfo): void => {
        resetIdleTimeout();

        const printer = this.parsePrinterResponse(buffer, rinfo.address);
        if (!printer) {
          return;
        }

        const key = `${printer.ipAddress}:${printer.commandPort ?? 8899}:${printer.serialNumber}`;
        printers.set(key, printer);
      };

      const handleError = (error: Error): void => {
        finish(() => reject(error));
      };

      totalTimeoutHandle = setTimeout(() => {
        finish(resolve);
      }, totalTimeoutMs);

      socket.on('message', handleMessage);
      socket.on('error', handleError);
      resetIdleTimeout();
    });
  }

  private parsePrinterResponse(response: Buffer, ipAddress: string): DiscoveredPrinter | null {
    if (!response || response.length < LEGACY_DISCOVERY_PACKET_SIZE) {
      return null;
    }

    if (response.length >= MODERN_DISCOVERY_PACKET_SIZE) {
      const name = this.readNullTerminatedAscii(response, 0x00, 132);
      const serialNumber = this.readNullTerminatedAscii(response, 0x92, 130);

      return {
        name: name || 'Unknown Printer',
        ipAddress,
        serialNumber,
        commandPort: response.readUInt16BE(0x84),
        eventPort: response.readUInt16BE(0x8e),
        model: 'Unknown',
        status: 'Discovered',
      };
    }

    const name = this.readNullTerminatedAscii(response, 0x00, 128);

    return {
      name: name || 'Unknown Printer',
      ipAddress,
      serialNumber: '',
      commandPort: response.readUInt16BE(0x84),
      model: 'Unknown',
      status: 'Discovered',
    };
  }

  private readNullTerminatedAscii(buffer: Buffer, offset: number, length: number): string {
    return buffer.toString('ascii', offset, offset + length).replace(/\0.*$/, '').trim();
  }

  private getDiscoveryTargets(): DiscoveryTarget[] {
    const targets = new Map<string, DiscoveryTarget>();

    for (const broadcastAddress of this.getBroadcastAddresses()) {
      targets.set(`${broadcastAddress}:${BROADCAST_DISCOVERY_PORT}`, {
        address: broadcastAddress,
        port: BROADCAST_DISCOVERY_PORT,
      });
    }

    const fallbackTargets: readonly DiscoveryTarget[] = [
      { address: LOOPBACK_ADDRESS, port: BROADCAST_DISCOVERY_PORT },
      { address: LOOPBACK_ADDRESS, port: MODERN_MULTICAST_PORT },
      { address: LOOPBACK_ADDRESS, port: LEGACY_MULTICAST_PORT },
      { address: MULTICAST_ADDRESS, port: MODERN_MULTICAST_PORT },
      { address: MULTICAST_ADDRESS, port: LEGACY_MULTICAST_PORT },
    ];

    for (const target of fallbackTargets) {
      targets.set(`${target.address}:${target.port}`, target);
    }

    return Array.from(targets.values());
  }

  private getBroadcastAddresses(): string[] {
    const addresses = new Set<string>();
    const interfaces = networkInterfaces();

    for (const networkInterface of Object.values(interfaces)) {
      if (!networkInterface) {
        continue;
      }

      for (const iface of networkInterface) {
        if (iface.family !== 'IPv4' || iface.internal || !iface.netmask) {
          continue;
        }

        const broadcastAddress = this.calculateBroadcastAddress(iface.address, iface.netmask);
        if (broadcastAddress) {
          addresses.add(broadcastAddress);
        }
      }
    }

    return Array.from(addresses.values());
  }

  private calculateBroadcastAddress(ipAddress: string, subnetMask: string): string | null {
    try {
      const ip = ipAddress.split('.').map(Number);
      const mask = subnetMask.split('.').map(Number);

      if (ip.length !== 4 || mask.length !== 4) {
        return null;
      }

      const broadcast = ip.map((octet, index) => octet | (~mask[index] & 255));
      return broadcast.join('.');
    } catch (error) {
      console.warn('[Discovery] Failed to calculate broadcast address:', error);
      return null;
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}

// Export singleton getter function
export const getPrinterDiscoveryService = (): PrinterDiscoveryService => {
  return PrinterDiscoveryService.getInstance();
};
