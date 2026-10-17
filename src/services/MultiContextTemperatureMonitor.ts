/**
 * @fileoverview Multi-context temperature monitor for managing temperature monitoring across multiple printer contexts.
 *
 * This service manages per-context TemperatureMonitoringService instances, ensuring that
 * each connected printer gets its own temperature monitor that tracks cooling independently.
 * Temperature monitoring works for ALL connected printers in headless mode.
 *
 * Key Features:
 * - Creates temperature monitor for each printer context
 * - Connects monitors to their respective polling services
 * - Handles monitor cleanup when contexts are removed
 * - Singleton pattern with global instance management
 *
 * Architecture:
 * - Maps context IDs to TemperatureMonitoringService instances
 * - Listens to PrinterContextManager events for context lifecycle
 * - Independent temperature monitoring per printer context
 * - Event forwarding from individual monitors to global listeners
 *
 * Usage:
 * ```typescript
 * const monitor = getMultiContextTemperatureMonitor();
 * monitor.initialize();
 *
 * // Monitors are created automatically when polling services are ready
 * ```
 *
 * @exports MultiContextTemperatureMonitor - Main coordinator class
 * @exports getMultiContextTemperatureMonitor - Singleton instance accessor
 */

import { getPrinterContextManager } from '../managers/PrinterContextManager';
import type { PrinterStatus } from '../types/polling';
import { EventEmitter } from '../utils/EventEmitter';
import type { PrinterPollingService } from './PrinterPollingService';
import type { PrintStateMonitor } from './PrintStateMonitor';
import { TemperatureMonitoringService } from './TemperatureMonitoringService';

/**
 * Event payload for printer-cooled event
 */
export interface PrinterCooledEvent {
  contextId: string;
  temperature: number;
  bedCooledAt: Date;
  status: PrinterStatus;
}

/**
 * Event map for MultiContextTemperatureMonitor
 */
interface MultiContextTempMonitorEventMap extends Record<string, unknown[]> {
  'temperature-checked': [
    {
      contextId: string;
      temperature: number;
      coolingThreshold: number;
      hasCooled: boolean;
    },
  ];
  'printer-cooled': [PrinterCooledEvent];
  'monitoring-started': [{ contextId: string }];
  'monitoring-stopped': [{ contextId: string }];
  'monitor-created': [{ contextId: string }];
  'monitor-removed': [{ contextId: string }];
}

/**
 * Manages temperature monitoring services for all printer contexts
 */
export class MultiContextTemperatureMonitor extends EventEmitter<MultiContextTempMonitorEventMap> {
  private readonly monitors = new Map<string, TemperatureMonitoringService>();
  private isInitialized = false;

  /**
   * Initialize the multi-context temperature monitor
   * Sets up event listeners for context lifecycle events
   */
  public initialize(): void {
    if (this.isInitialized) {
      console.log('[MultiContextTemperatureMonitor] Already initialized');
      return;
    }

    const contextManager = getPrinterContextManager();

    contextManager.on('context-removed', (event) => {
      this.removeMonitorForContext(event.contextId);
    });

    this.isInitialized = true;
    console.log('[MultiContextTemperatureMonitor] Initialized');
  }

  /**
   * Create and configure temperature monitor for a context
   * Called when polling service is ready for a context
   *
   * @param contextId - Context ID
   * @param pollingService - Polling service to attach to monitor
   * @param printStateMonitor - Print state monitor to listen to
   */
  public createMonitorForContext(
    contextId: string,
    pollingService: PrinterPollingService,
    printStateMonitor: PrintStateMonitor
  ): void {
    if (this.monitors.has(contextId)) {
      console.warn(
        `[MultiContextTemperatureMonitor] Monitor already exists for context ${contextId}`
      );
      return;
    }

    const monitor = new TemperatureMonitoringService(contextId);

    // Wire dependencies
    monitor.setPollingService(pollingService);
    monitor.setPrintStateMonitor(printStateMonitor);

    this.setupMonitorEventForwarding(monitor);

    this.monitors.set(contextId, monitor);

    console.log(`[MultiContextTemperatureMonitor] Created monitor for context ${contextId}`);

    this.emit('monitor-created', { contextId });
  }

  /**
   * Setup event forwarding from individual monitor to global listeners
   */
  private setupMonitorEventForwarding(monitor: TemperatureMonitoringService): void {
    const contextId = monitor.getContextId();

    monitor.on('temperature-checked', (event) => {
      this.emit('temperature-checked', event);
    });

    monitor.on('printer-cooled', (event) => {
      this.emit('printer-cooled', event);
    });

    monitor.on('monitoring-started', (event) => {
      this.emit('monitoring-started', event);
    });

    monitor.on('monitoring-stopped', (event) => {
      this.emit('monitoring-stopped', event);
    });

    console.log(`[MultiContextTemperatureMonitor] Event forwarding setup for context ${contextId}`);
  }

  /**
   * Destroy monitor for a specific context (public API)
   * @param contextId - Context ID
   */
  public destroyMonitor(contextId: string): void {
    this.removeMonitorForContext(contextId);
  }

  /**
   * Remove and dispose monitor for a context
   * Called when context is removed
   *
   * @param contextId - Context ID
   */
  private removeMonitorForContext(contextId: string): void {
    const monitor = this.monitors.get(contextId);
    if (!monitor) {
      return;
    }

    monitor.dispose();

    this.monitors.delete(contextId);

    console.log(`[MultiContextTemperatureMonitor] Removed monitor for context ${contextId}`);

    this.emit('monitor-removed', { contextId });
  }

  /**
   * Get monitor for a specific context
   *
   * @param contextId - Context ID
   * @returns Monitor instance or undefined
   */
  public getMonitor(contextId: string): TemperatureMonitoringService | undefined {
    return this.monitors.get(contextId);
  }

  /**
   * Get all active monitors
   *
   * @returns Array of all monitor instances
   */
  public getAllMonitors(): TemperatureMonitoringService[] {
    return Array.from(this.monitors.values());
  }

  /**
   * Get number of active monitors
   *
   * @returns Count of monitors
   */
  public getMonitorCount(): number {
    return this.monitors.size;
  }

  /**
   * Dispose all monitors and cleanup
   */
  public dispose(): void {
    console.log('[MultiContextTemperatureMonitor] Disposing all monitors...');

    for (const [contextId, monitor] of this.monitors) {
      monitor.dispose();
      console.log(`[MultiContextTemperatureMonitor] Disposed monitor for context ${contextId}`);
    }

    this.monitors.clear();

    this.removeAllListeners();

    this.isInitialized = false;
    console.log('[MultiContextTemperatureMonitor] Disposed');
  }
}

/**
 * Global multi-context temperature monitor instance
 */
let globalMultiContextTemperatureMonitor: MultiContextTemperatureMonitor | null = null;

/**
 * Get global multi-context temperature monitor instance
 */
export function getMultiContextTemperatureMonitor(): MultiContextTemperatureMonitor {
  if (!globalMultiContextTemperatureMonitor) {
    globalMultiContextTemperatureMonitor = new MultiContextTemperatureMonitor();
  }
  return globalMultiContextTemperatureMonitor;
}

/**
 * Reset global multi-context temperature monitor (for testing)
 */
export function resetMultiContextTemperatureMonitor(): void {
  if (globalMultiContextTemperatureMonitor) {
    globalMultiContextTemperatureMonitor.dispose();
    globalMultiContextTemperatureMonitor = null;
  }
}
