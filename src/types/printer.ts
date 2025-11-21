/**
 * @fileoverview Core printer connection and configuration type definitions.
 *
 * Defines comprehensive TypeScript interfaces for printer discovery, connection management,
 * and multi-printer configuration storage. Supports both legacy and modern API clients with
 * per-printer settings including custom camera URLs, LED control, and material station features.
 *
 * Key exports:
 * - PrinterDetails: Complete printer configuration with per-printer overrides
 * - MultiPrinterConfig: Top-level configuration structure for multiple saved printers
 * - DiscoveredPrinter: Network discovery results
 * - ConnectionResult: Connection flow outcomes
 */

/**
 * Printer model types supported by the backend system
 */
export type PrinterModelType =
  | 'generic-legacy'
  | 'adventurer-5m'
  | 'adventurer-5m-pro'
  | 'ad5x';

/**
 * Client type for printer connection
 */
export type PrinterClientType = 'legacy' | 'new';

/**
 * Connection state for a printer context
 */
export type ContextConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';

/**
 * Printer details structure for saving to printer_details.json
 */
export interface PrinterDetails {
  readonly Name: string;
  readonly IPAddress: string;
  readonly SerialNumber: string;
  readonly CheckCode: string;
  readonly ClientType: PrinterClientType;
  readonly printerModel: string; // typeName from API
  readonly modelType?: PrinterModelType; // Specific model type for backend selection

  // Per-printer settings (overrides global config if set)
  customCameraEnabled?: boolean;
  customCameraUrl?: string; // Supports http://, https://, and rtsp:// URLs
  customLedsEnabled?: boolean;
  forceLegacyMode?: boolean;

  // WebUI settings (per-printer overrides)
  webUIEnabled?: boolean;

  // RTSP streaming settings (per-printer)
  rtspFrameRate?: number;    // 1-60 fps, default: 30
  rtspQuality?: number;       // 1-5 (1=best, 5=worst), default: 3

  // Spoolman integration (per-printer)
  activeSpoolData?: import('./spoolman').ActiveSpoolData | null;
}

/**
 * Discovered printer information from network scan
 */
export interface DiscoveredPrinter {
  readonly name: string;
  readonly ipAddress: string;
  readonly serialNumber: string;
  readonly model?: string;
  readonly status?: string;
  readonly firmwareVersion?: string;
}

/**
 * Basic printer information from API response
 */
export interface PrinterApiInfo {
  readonly TypeName?: string;
  readonly SerialNumber?: string;
  readonly FirmwareVersion?: string;
  readonly Status?: string;
}

/**
 * Extended printer info that may include a reusable client
 */
export interface ExtendedPrinterInfo {
  readonly TypeName?: string;
  readonly SerialNumber?: string;
  readonly FirmwareVersion?: string;
  readonly Status?: string;
  readonly _reuseableClient?: unknown; // For legacy client reuse
  readonly [key: string]: unknown;
}

/**
 * Temporary connection result used during printer type detection
 */
export interface TemporaryConnectionResult {
  readonly success: boolean;
  readonly typeName?: string;
  readonly printerInfo?: ExtendedPrinterInfo;
  readonly error?: string;
}

/**
 * Base interface for printer client instances
 */
export interface PrinterClient {
  readonly isConnected?: boolean;
  readonly disconnect?: () => Promise<void> | void;
  readonly sendRawCmd?: (command: string) => Promise<unknown>;
}

/**
 * Connection flow result after successful connection
 */
export interface ConnectionResult {
  readonly success: boolean;
  readonly printerDetails?: PrinterDetails;
  readonly clientInstance?: unknown;
  readonly error?: string;
}

/**
 * Printer family detection result
 */
export interface PrinterFamilyInfo {
  readonly is5MFamily: boolean;
  readonly requiresCheckCode: boolean;
  readonly familyName: string; // e.g., "Adventurer 5M", "Creator Pro", etc.
}

/**
 * Options for printer connection
 */
export interface ConnectionOptions {
  readonly forceShowPairing?: boolean;
  readonly skipSavedConnection?: boolean;
  readonly checkForActiveConnection?: boolean;
}

/**
 * Current printer connection state
 */
export interface PrinterConnectionState {
  readonly isConnected: boolean;
  readonly printerName?: string;
  readonly ipAddress?: string;
  readonly clientType?: PrinterClientType;
  readonly isPrinting?: boolean;
  readonly lastConnected?: Date;
}

/**
 * Utility function type for determining 5M family printers
 * Based on typeName from printer API response
 */
export type PrinterFamilyDetector = (typeName: string) => PrinterFamilyInfo;

/**
 * Branded type for printer validation
 */
export type ValidatedPrinterDetails = PrinterDetails & {
  readonly __validated: true;
};

/**
 * Extended printer details with metadata for multi-printer storage
 * Extends PrinterDetails with timestamp for sorting/display
 */
export interface StoredPrinterDetails extends PrinterDetails {
  readonly lastConnected: string; // ISO date string
}

/**
 * Multi-printer configuration structure for printer_details.json
 * Top-level structure supporting multiple saved printers
 */
export interface MultiPrinterConfig {
  readonly lastUsedPrinterSerial: string | null;
  readonly printers: Record<string, StoredPrinterDetails>; // key = serial number
}

/**
 * Result of matching discovered printers with saved printers
 * Used during auto-connect discovery phase
 */
export interface SavedPrinterMatch {
  readonly savedDetails: StoredPrinterDetails;
  readonly discoveredPrinter: DiscoveredPrinter | null;
  readonly ipAddressChanged: boolean;
}

/**
 * User's choice for auto-connect when multiple printers are available
 */
export interface AutoConnectChoice {
  readonly selectedSerial: string;
  readonly printerDetails: StoredPrinterDetails;
}

/**
 * Auto-connect decision result based on available printers
 */
export interface AutoConnectDecision {
  readonly action: 'none' | 'connect' | 'select';
  readonly reason?: string;
  readonly selectedMatch?: SavedPrinterMatch;
  readonly matches?: SavedPrinterMatch[];
}

/**
 * Serializable printer context information for UI display
 */
export interface PrinterContextInfo {
  /** Unique identifier for this context */
  readonly id: string;

  /** Display name (usually printer name) */
  readonly name: string;

  /** IP address of the printer */
  readonly ip: string;

  /** Printer model string */
  readonly model: string;

  /** Printer serial number */
  readonly serialNumber: string | null;

  /** Current connection status */
  readonly status: ContextConnectionState;

  /** Whether this context is the active one */
  readonly isActive: boolean;

  /** Whether this printer has camera support */
  readonly hasCamera: boolean;

  /** Local camera proxy URL if available */
  readonly cameraUrl?: string;

  /** When this context was created */
  readonly createdAt: string; // ISO date string

  /** Last activity timestamp */
  readonly lastActivity: string; // ISO date string
}

/**
 * Event payload for context switching events
 */
export interface ContextSwitchEvent {
  readonly contextId: string;
  readonly previousContextId: string | null;
  readonly contextInfo: PrinterContextInfo;
}

/**
 * Event payload for context creation
 */
export interface ContextCreatedEvent {
  readonly contextId: string;
  readonly contextInfo: PrinterContextInfo;
}

/**
 * Event payload for context removal
 */
export interface ContextRemovedEvent {
  readonly contextId: string;
  readonly wasActive: boolean;
}
