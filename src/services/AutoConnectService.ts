/**
 * @fileoverview
 * AutoConnectService.ts
 *
 * Provides automated printer connection functionality for the FlashForgeUI-Electron application.
 * This service handles the logic for determining when and how to automatically connect to
 * previously saved printers based on network discovery results. It implements decision-making
 * algorithms for selecting the appropriate printer when multiple matches are found, and manages
 * auto-connect preferences and retry logic. The service follows a singleton pattern and extends
 * EventEmitter to provide event-based communication with other components.
 *
 * Key responsibilities:
 * - Determine when auto-connection should be attempted
 * - Make decisions about which printer to connect to when multiple options exist
 * - Manage auto-connect preferences and configuration
 * - Handle auto-connect retry logic and logging
 */

import { EventEmitter } from 'events';
import type { AutoConnectDecision, SavedPrinterMatch } from '../types/printer';
export class AutoConnectService extends EventEmitter {
  private static instance: AutoConnectService | null = null;

  private constructor() {
    super();
  }

  /**
   * Get singleton instance of AutoConnectService
   */
  public static getInstance(): AutoConnectService {
    if (!AutoConnectService.instance) {
      AutoConnectService.instance = new AutoConnectService();
    }
    return AutoConnectService.instance;
  }

  /**
   * Determine if auto-connect should be attempted
   * Based on configuration settings and saved printer availability
   */
  public shouldAutoConnect(): boolean {
    // Auto-connect is always enabled by default
    return true;
  }

  /**
   * Determine the auto-connect choice based on available matches
   * @param matches - Array of saved printer matches found on network
   * @returns The auto-connect choice and selected match if applicable
   */
  public determineAutoConnectChoice(matches: SavedPrinterMatch[]): AutoConnectDecision {
    if (matches.length === 0) {
      // No saved printers found on network
      return {
        action: 'none',
        reason: 'No saved printers found on network',
      };
    } else if (matches.length === 1) {
      // Single saved printer found - auto-connect
      return {
        action: 'connect',
        selectedMatch: matches[0],
        reason: 'Single saved printer found',
      };
    } else {
      // Multiple saved printers found - need user selection
      return {
        action: 'select',
        matches,
        reason: 'Multiple saved printers found',
      };
    }
  }

  /**
   * Get the preferred printer for auto-connect
   * Returns the last used printer if available
   */
  public getPreferredPrinter(matches: SavedPrinterMatch[]): SavedPrinterMatch | null {
    if (matches.length === 0) {
      return null;
    }

    // Return null; the UI handles printer selection
    return null;
  }

  /**
   * Check if a specific printer should be auto-connected
   * Can be used for direct connection attempts
   */
  public shouldAutoConnectToPrinter(_serialNumber: string): boolean {
    return false;
  }

  /**
   * Update auto-connect preferences after successful connection
   */
  public updateAutoConnectPreferences(serialNumber: string): void {
    this.emit('auto-connect-preferences-updated', serialNumber);
  }

  /**
   * Get auto-connect delay in milliseconds
   * Allows for a brief delay before attempting auto-connect
   */
  public getAutoConnectDelay(): number {
    return 100;
  }

  /**
   * Check if auto-connect should be retried after failure
   */
  public shouldRetryAutoConnect(_attemptCount: number): boolean {
    // No retries by default
    return false;
  }

  /**
   * Log auto-connect attempt for debugging
   */
  public logAutoConnectAttempt(
    action: 'started' | 'succeeded' | 'failed' | 'cancelled',
    details?: unknown
  ): void {
    const timestamp = new Date().toISOString();
    console.log(`[AutoConnect] ${timestamp} - ${action}`, details);
    this.emit('auto-connect-logged', { action, details, timestamp });
  }
}

export const getAutoConnectService = (): AutoConnectService => {
  return AutoConnectService.getInstance();
};
