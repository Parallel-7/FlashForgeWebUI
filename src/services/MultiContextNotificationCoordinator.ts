/**
 * @fileoverview Multi-context notification coordinator for headless WebUI mode.
 *
 * This service aggregates and forwards events from multiple printer contexts for
 * WebSocket/HTTP clients to consume. Unlike the Electron version, this does not
 * send desktop notifications - instead it provides a centralized event stream
 * that the WebUI server can expose to browser clients.
 *
 * Key Features:
 * - Aggregates print state events from all contexts
 * - Forwards events with context identification
 * - Lightweight event forwarding (no desktop notifications)
 * - Integration with multi-context print state monitor
 *
 * Architecture:
 * - Listens to MultiContextPrintStateMonitor events
 * - Forwards events with additional context information
 * - WebUI server can listen to these events and broadcast via WebSocket
 *
 * Usage:
 * ```typescript
 * const coordinator = getMultiContextNotificationCoordinator();
 * coordinator.initialize();
 *
 * // Listen to aggregated events
 * coordinator.on('print-notification', (event) => {
 *   // Broadcast to WebSocket clients
 *   webSocketServer.broadcast(event);
 * });
 * ```
 *
 * @exports MultiContextNotificationCoordinator - Main coordinator class
 * @exports getMultiContextNotificationCoordinator - Singleton instance accessor
 */

import { EventEmitter } from '../utils/EventEmitter';
import { getMultiContextPrintStateMonitor } from './MultiContextPrintStateMonitor';
import type { PrinterStatus } from '../types/polling';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Notification event types
 */
export type NotificationType =
  | 'print-started'
  | 'print-completed'
  | 'print-cancelled'
  | 'print-error';

/**
 * Print notification event payload
 */
export interface PrintNotificationEvent {
  type: NotificationType;
  contextId: string;
  printerName: string;
  jobName: string;
  timestamp: Date;
  status?: PrinterStatus;
}

/**
 * Event map for MultiContextNotificationCoordinator
 */
interface NotificationCoordinatorEventMap extends Record<string, unknown[]> {
  'print-notification': [PrintNotificationEvent];
}

// ============================================================================
// MULTI-CONTEXT NOTIFICATION COORDINATOR
// ============================================================================

/**
 * Coordinates notification events across all printer contexts
 */
export class MultiContextNotificationCoordinator extends EventEmitter<NotificationCoordinatorEventMap> {
  private isInitialized = false;

  constructor() {
    super();
  }

  /**
   * Initialize the notification coordinator
   * Sets up event listeners for print state events
   */
  public initialize(): void {
    if (this.isInitialized) {
      console.log('[MultiContextNotificationCoordinator] Already initialized');
      return;
    }

    const printStateMonitor = getMultiContextPrintStateMonitor();

    // Listen to print state events and forward as notifications
    printStateMonitor.on('print-started', (event) => {
      this.forwardNotification('print-started', event);
    });

    printStateMonitor.on('print-completed', (event) => {
      this.forwardNotification('print-completed', event);
    });

    printStateMonitor.on('print-cancelled', (event) => {
      this.forwardNotification('print-cancelled', event);
    });

    printStateMonitor.on('print-error', (event) => {
      this.forwardNotification('print-error', event);
    });

    this.isInitialized = true;
    console.log('[MultiContextNotificationCoordinator] Initialized');
  }

  /**
   * Forward print state event as notification
   */
  private forwardNotification(
    type: NotificationType,
    event: {
      contextId: string;
      jobName: string;
      status: PrinterStatus;
      timestamp?: Date;
      completedAt?: Date;
    }
  ): void {
    const printerName = event.status.printerInfo.printerName || 'Unknown Printer';

    const notification: PrintNotificationEvent = {
      type,
      contextId: event.contextId,
      printerName,
      jobName: event.jobName,
      timestamp: event.timestamp || event.completedAt || new Date(),
      status: event.status
    };

    console.log(`[MultiContextNotificationCoordinator] ${type}: ${printerName} - ${event.jobName}`);

    this.emit('print-notification', notification);
  }

  /**
   * Dispose and cleanup
   */
  public dispose(): void {
    console.log('[MultiContextNotificationCoordinator] Disposing...');

    this.removeAllListeners();

    this.isInitialized = false;
    console.log('[MultiContextNotificationCoordinator] Disposed');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global notification coordinator instance
 */
let globalNotificationCoordinator: MultiContextNotificationCoordinator | null = null;

/**
 * Get global notification coordinator instance
 */
export function getMultiContextNotificationCoordinator(): MultiContextNotificationCoordinator {
  if (!globalNotificationCoordinator) {
    globalNotificationCoordinator = new MultiContextNotificationCoordinator();
  }
  return globalNotificationCoordinator;
}

/**
 * Reset global notification coordinator (for testing)
 */
export function resetMultiContextNotificationCoordinator(): void {
  if (globalNotificationCoordinator) {
    globalNotificationCoordinator.dispose();
    globalNotificationCoordinator = null;
  }
}
