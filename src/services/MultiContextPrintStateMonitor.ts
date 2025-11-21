/**
 * @fileoverview Multi-context coordinator for print state monitoring services.
 *
 * Manages PrintStateMonitor instances across multiple printer contexts, ensuring
 * each printer connection has its own isolated state monitoring instance.
 */

import { EventEmitter } from '../utils/EventEmitter';
import { PrintStateMonitor } from './PrintStateMonitor';
import type { PrinterPollingService } from './PrinterPollingService';
import type { PrinterStatus } from '../types/polling';

/**
 * Event map for MultiContextPrintStateMonitor
 */
interface MultiContextPrintStateMonitorEventMap extends Record<string, unknown[]> {
  'state-changed': [{
    contextId: string;
    previousState: string;
    currentState: string;
    status: PrinterStatus;
    timestamp: Date;
  }];
  'print-started': [{
    contextId: string;
    jobName: string;
    status: PrinterStatus;
    timestamp: Date;
  }];
  'print-completed': [{
    contextId: string;
    jobName: string;
    status: PrinterStatus;
    completedAt: Date;
  }];
  'print-cancelled': [{
    contextId: string;
    jobName: string;
    status: PrinterStatus;
    timestamp: Date;
  }];
  'print-error': [{
    contextId: string;
    jobName: string;
    status: PrinterStatus;
    timestamp: Date;
  }];
}

/**
 * Multi-context coordinator for print state monitoring
 * Manages per-context PrintStateMonitor instances and forwards their events
 */
export class MultiContextPrintStateMonitor extends EventEmitter<MultiContextPrintStateMonitorEventMap> {
  private readonly monitors: Map<string, PrintStateMonitor> = new Map();

  constructor() {
    super();
  }

  /**
   * Create a print state monitor for a specific context
   */
  public createMonitorForContext(
    contextId: string,
    pollingService: PrinterPollingService
  ): void {
    // Check if monitor already exists
    if (this.monitors.has(contextId)) {
      console.warn(`[MultiContextPrintStateMonitor] Monitor already exists for context ${contextId}`);
      return;
    }

    // Create new monitor
    const monitor = new PrintStateMonitor(contextId);
    monitor.setPollingService(pollingService);

    // Forward events from this monitor
    this.setupEventForwarding(monitor);

    // Store monitor
    this.monitors.set(contextId, monitor);

    console.log(`[MultiContextPrintStateMonitor] Created monitor for context ${contextId}`);
  }

  /**
   * Setup event forwarding from individual monitor
   */
  private setupEventForwarding(monitor: PrintStateMonitor): void {
    monitor.on('state-changed', (event) => {
      this.emit('state-changed', event);
    });

    monitor.on('print-started', (event) => {
      // Only forward if we have a job name
      if (event.jobName) {
        this.emit('print-started', { ...event, jobName: event.jobName });
      }
    });

    monitor.on('print-completed', (event) => {
      // Only forward if we have a job name
      if (event.jobName) {
        this.emit('print-completed', { ...event, jobName: event.jobName });
      }
    });

    monitor.on('print-cancelled', (event) => {
      // Only forward if we have a job name
      if (event.jobName) {
        this.emit('print-cancelled', { ...event, jobName: event.jobName });
      }
    });

    monitor.on('print-error', (event) => {
      // Only forward if we have a job name
      if (event.jobName) {
        this.emit('print-error', { ...event, jobName: event.jobName });
      }
    });
  }

  /**
   * Get print state monitor for a specific context
   */
  public getMonitor(contextId: string): PrintStateMonitor | undefined {
    return this.monitors.get(contextId);
  }

  /**
   * Check if monitor exists for context
   */
  public hasMonitor(contextId: string): boolean {
    return this.monitors.has(contextId);
  }

  /**
   * Destroy monitor for a specific context
   */
  public destroyMonitor(contextId: string): void {
    const monitor = this.monitors.get(contextId);

    if (monitor) {
      monitor.dispose();
      this.monitors.delete(contextId);
      console.log(`[MultiContextPrintStateMonitor] Destroyed monitor for context ${contextId}`);
    }
  }

  /**
   * Get all monitors (for debugging/testing)
   */
  public getAllMonitors(): Map<string, PrintStateMonitor> {
    return new Map(this.monitors);
  }

  /**
   * Get count of active monitors
   */
  public getMonitorCount(): number {
    return this.monitors.size;
  }

  /**
   * Dispose all monitors
   */
  public dispose(): void {
    console.log('[MultiContextPrintStateMonitor] Disposing all monitors');

    for (const [contextId, monitor] of this.monitors) {
      monitor.dispose();
      console.log(`[MultiContextPrintStateMonitor] Disposed monitor for context ${contextId}`);
    }

    this.monitors.clear();
  }
}

// Singleton instance
let instance: MultiContextPrintStateMonitor | null = null;

/**
 * Get singleton instance of MultiContextPrintStateMonitor
 */
export function getMultiContextPrintStateMonitor(): MultiContextPrintStateMonitor {
  if (!instance) {
    instance = new MultiContextPrintStateMonitor();
  }
  return instance;
}
