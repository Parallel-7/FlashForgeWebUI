/**
 * @fileoverview Service for establishing and validating printer connections with type detection.
 *
 * Handles the technical aspects of creating and validating printer connections:
 * - Temporary connection establishment for printer detection
 * - Printer type and family detection (5M, 5M Pro, AD5X, legacy)
 * - Client instance creation (FiveMClient and/or FlashForgeClient)
 * - Connection validation and error handling
 * - Dual-API support determination
 * - Check code validation and firmware version retrieval
 *
 * Key exports:
 * - ConnectionEstablishmentService class: Low-level connection establishment
 * - getConnectionEstablishmentService(): Singleton accessor
 *
 * This service provides the foundation for printer connections, handling the complexity
 * of determining which API(s) to use and creating appropriate client instances. Works in
 * conjunction with ConnectionFlowManager for complete connection workflows.
 */

import { EventEmitter } from 'events';
import { FiveMClient, FlashForgeClient } from '@ghosttypes/ff-api';
import {
  DiscoveredPrinter,
  TemporaryConnectionResult,
  ExtendedPrinterInfo
} from '../types/printer';
import {
  detectPrinterFamily,
  getConnectionErrorMessage
} from '../utils/PrinterUtils';

// Connection clients interface for dual API support
interface ConnectionClients {
  primaryClient: FiveMClient | FlashForgeClient;
  secondaryClient?: FlashForgeClient;
}

/**
 * Service responsible for establishing printer connections
 * Handles type detection, client creation, and connection validation
 */
export class ConnectionEstablishmentService extends EventEmitter {
  private static instance: ConnectionEstablishmentService | null = null;

  private constructor() {
    super();
  }

  /**
   * Get singleton instance of ConnectionEstablishmentService
   */
  public static getInstance(): ConnectionEstablishmentService {
    if (!ConnectionEstablishmentService.instance) {
      ConnectionEstablishmentService.instance = new ConnectionEstablishmentService();
    }
    return ConnectionEstablishmentService.instance;
  }

  /**
   * Create temporary connection to determine printer type
   * Uses legacy API for universal compatibility
   * Includes timeout handling and retry logic
   */
  public async createTemporaryConnection(
    printer: DiscoveredPrinter,
    timeout = 10000,
    retries = 3
  ): Promise<TemporaryConnectionResult> {
    this.emit('temporary-connection-started', printer);

    for (let attempt = 1; attempt <= retries; attempt++) {
      let tempClient: FlashForgeClient | null = null;

      try {
        console.log(`[Connection] Attempt ${attempt}/${retries} for ${printer.ipAddress}`);

        // Always use legacy API for type detection
        tempClient = new FlashForgeClient(printer.ipAddress);

        // Wrap initControl in timeout
        console.log(`[Connection] Initializing control connection (timeout: ${timeout}ms)...`);
        const connected = await Promise.race([
          tempClient.initControl(),
          new Promise<boolean>((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), timeout)
          )
        ]);

        if (!connected) {
          console.error(`[Connection] initControl returned false for ${printer.ipAddress}`);
          if (tempClient) {
            try {
              void tempClient.dispose();
            } catch (disposeError) {
              console.error('[Connection] Error disposing temp client after initControl failure:', disposeError);
            }
          }

          if (attempt < retries) {
            await this.delay(1000 * attempt); // Exponential backoff
            continue;
          }

          this.emit('temporary-connection-failed', 'Failed to initialize control');
          return {
            success: false,
            error: 'Failed to initialize control'
          };
        }

        console.log(`[Connection] Control initialized, fetching printer info (timeout: ${timeout}ms)...`);

        // Get printer info with timeout
        const printerInfo = await Promise.race([
          tempClient.getPrinterInfo(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Printer info timeout')), timeout)
          )
        ]);

        if (!printerInfo || !printerInfo.TypeName) {
          console.error(`[Connection] Invalid printer info received`);
          if (tempClient) {
            void tempClient.dispose();
          }

          if (attempt < retries) {
            await this.delay(1000 * attempt);
            continue;
          }

          this.emit('temporary-connection-failed', 'Failed to get printer type information');
          return {
            success: false,
            error: 'Failed to get printer type information'
          };
        }

        const typeName = printerInfo.TypeName;
        const familyInfo = detectPrinterFamily(typeName);

        console.log('[Connection] Temporary connection successful - extracted printer info:', {
          TypeName: printerInfo.TypeName,
          Name: printerInfo.Name,
          SerialNumber: printerInfo.SerialNumber,
          is5MFamily: familyInfo.is5MFamily
        });

        this.emit('printer-type-detected', { typeName, familyInfo });

        // For legacy printers, we can reuse this connection
        if (!familyInfo.is5MFamily) {
          console.log('[Connection] Legacy printer detected, reusing connection');
          return {
            success: true,
            typeName,
            printerInfo: {
              ...(printerInfo as unknown as Record<string, unknown>),
              _reuseableClient: tempClient // Store for reuse
            }
          };
        } else {
          // 5M family - dispose temp client, will create new one
          // But first ensure we have critical information for dual API connection
          if (!printerInfo.SerialNumber || printerInfo.SerialNumber.trim() === '') {
            console.warn('[Connection] Warning: No serial number found in printer info for 5M family printer');
            console.warn('[Connection] This may cause dual API connection to fail');
          }

          console.log('[Connection] 5M family printer detected, disposing temporary connection');
          void tempClient.dispose();

          // Add a small delay after disposing temp client to ensure clean state
          await new Promise(resolve => setTimeout(resolve, 200));

          return {
            success: true,
            typeName,
            printerInfo: printerInfo as unknown as ExtendedPrinterInfo
          };
        }

      } catch (error) {
        console.error(`[Connection] Attempt ${attempt} failed:`, error);

        // Clean up temp client on error
        if (tempClient) {
          try {
            void tempClient.dispose();
          } catch (disposeError) {
            console.error('[Connection] Error disposing temp client after error:', disposeError);
          }
        }

        if (attempt < retries) {
          const backoffDelay = 1000 * attempt;
          console.log(`[Connection] Retrying in ${backoffDelay}ms...`);
          await this.delay(backoffDelay);
          continue;
        }

        // All retries exhausted
        const errorMessage = getConnectionErrorMessage(error);
        console.error(`[Connection] All ${retries} attempts failed:`, errorMessage);
        this.emit('temporary-connection-failed', errorMessage);
        return {
          success: false,
          error: errorMessage
        };
      }
    }

    // Should never reach here, but TypeScript requires it
    return {
      success: false,
      error: 'All connection attempts failed'
    };
  }

  /**
   * Delay helper for exponential backoff
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Establish final connection based on printer type
   * Returns both primary and secondary clients for dual API connections
   */
  public async establishFinalConnection(
    printer: DiscoveredPrinter,
    typeName: string,
    is5MFamily: boolean,
    checkCode: string,
    ForceLegacyAPI: boolean
  ): Promise<ConnectionClients | null> {
    this.emit('final-connection-started', { printer, typeName });

    try {
      if (is5MFamily && !ForceLegacyAPI) {
        return await this.establishDualAPIConnection(printer, checkCode);
      } else {
        return await this.establishLegacyConnection(printer);
      }
    } catch (error) {
      console.error('Failed to establish final connection:', error);
      this.emit('final-connection-failed', error);
      return null;
    }
  }

  /**
   * Establish dual API connection for 5M family printers
   */
  private async establishDualAPIConnection(
    printer: DiscoveredPrinter,
    checkCode: string
  ): Promise<ConnectionClients> {
    console.log('Creating dual API connection for 5M family printer');
    console.log('Connection details:', {
      ipAddress: printer.ipAddress,
      serialNumber: printer.serialNumber,
      name: printer.name,
      hasValidSerial: !!(printer.serialNumber && printer.serialNumber.trim() !== '')
    });
    
    // Validate that we have a valid serial number for FiveMClient
    if (!printer.serialNumber || printer.serialNumber.trim() === '') {
      console.error('Cannot create FiveMClient without valid serial number');
      throw new Error('Serial number is required for dual API connection but was not provided');
    }
    
    // Primary client: FiveMClient for new API operations
    const primaryClient = new FiveMClient(printer.ipAddress, printer.serialNumber, checkCode);
    
    try {
      console.log('Initializing FiveMClient...');
      const initialized = await primaryClient.initialize();
      if (!initialized) {
        console.error('FiveMClient initialization returned false');
        throw new Error('Failed to initialize 5M client - initialization returned false');
      }
      console.log('FiveMClient initialized successfully');

      console.log('Initializing FiveMClient control...');
      const controlOk = await primaryClient.initControl();
      if (!controlOk) {
        console.error('FiveMClient control initialization failed');
        throw new Error('Failed to initialize 5M control - initControl returned false');
      }
      console.log('FiveMClient control initialized successfully');
      
      // Add a small delay to ensure primary client is fully ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Secondary client: FlashForgeClient for legacy API operations (G-code commands)
      console.log('Initializing secondary FlashForgeClient...');
      const secondaryClient = new FlashForgeClient(printer.ipAddress);
      const legacyConnected = await secondaryClient.initControl();
      if (!legacyConnected) {
        console.error('Secondary FlashForgeClient initialization failed');
        // If secondary client fails, dispose primary and fail
        try {
          await primaryClient.dispose();
        } catch (disposeError) {
          console.error('Error disposing primary client after secondary failure:', disposeError);
        }
        throw new Error('Failed to initialize legacy client for dual API');
      }
      console.log('Secondary FlashForgeClient initialized successfully');
      
      console.log('Both clients initialized successfully for dual API');
      this.emit('dual-api-connection-established', {
        ipAddress: printer.ipAddress,
        serialNumber: printer.serialNumber
      });
      
      return {
        primaryClient,
        secondaryClient
      };
    } catch (error) {
      console.error('Error in establishDualAPIConnection:', error);
      // Clean up on failure
      try {
        await primaryClient.dispose();
      } catch (disposeError) {
        console.error('Error disposing primary client after error:', disposeError);
      }
      
      // Provide more specific error information
      if (error instanceof Error) {
        throw new Error(`Dual API connection failed: ${error.message}`);
      } else {
        throw new Error(`Dual API connection failed: ${String(error)}`);
      }
    }
  }

  /**
   * Establish legacy connection for non-5M printers
   */
  private async establishLegacyConnection(
    printer: DiscoveredPrinter
  ): Promise<ConnectionClients> {
    console.log('Creating single legacy API connection');
    
    // Try to reuse temporary connection if available
    const tempInfo = await this.createTemporaryConnection(printer);
    if (tempInfo.success && tempInfo.printerInfo?._reuseableClient) {
      console.log('Reusing temporary connection for legacy printer');
      this.emit('legacy-connection-reused');
      return {
        primaryClient: tempInfo.printerInfo._reuseableClient as FlashForgeClient
      };
    } else {
      // Create new legacy connection
      const primaryClient = new FlashForgeClient(printer.ipAddress);
      const connected = await primaryClient.initControl();
      
      if (!connected) {
        throw new Error('Failed to initialize legacy client');
      }

      this.emit('legacy-connection-established');
      return {
        primaryClient
      };
    }
  }

  /**
   * Send logout command to legacy client
   */
  public async sendLogoutCommand(client: FlashForgeClient): Promise<void> {
    try {
      await client.sendRawCmd('~M602');
      console.log('Logout command sent successfully');
    } catch (error) {
      console.warn('Failed to send logout command:', error);
      // Don't throw - continue with disconnect even if logout fails
    }
  }

  /**
   * Dispose client connections safely
   */
  public async disposeClients(
    primaryClient: FiveMClient | FlashForgeClient | null,
    secondaryClient: FlashForgeClient | null,
    clientType?: string
  ): Promise<void> {
    // Send logout to legacy clients before disposal
    if (clientType === 'legacy' && primaryClient) {
      await this.sendLogoutCommand(primaryClient as FlashForgeClient);
      await new Promise(resolve => setTimeout(resolve, 200)); // Give time to process
    }

    if (secondaryClient) {
      await this.sendLogoutCommand(secondaryClient);
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Dispose clients
    if (primaryClient) {
      try {
        void primaryClient.dispose();
      } catch (error) {
        console.error('Error disposing primary client:', error);
      }
    }

    if (secondaryClient) {
      try {
        void secondaryClient.dispose();
      } catch (error) {
        console.error('Error disposing secondary client:', error);
      }
    }

    this.emit('clients-disposed');
  }
}

// Export singleton getter function
export const getConnectionEstablishmentService = (): ConnectionEstablishmentService => {
  return ConnectionEstablishmentService.getInstance();
};

