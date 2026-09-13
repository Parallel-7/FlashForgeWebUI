/**
 * @fileoverview Multi-context Spoolman tracker for managing filament usage tracking across multiple printer contexts.
 *
 * This service manages per-context SpoolmanUsageTracker instances, ensuring that each
 * connected printer gets its own usage tracker that monitors filament consumption independently.
 * Spoolman tracking works for ALL connected printers in headless mode.
 *
 * Key Features:
 * - Creates Spoolman usage tracker for each printer context
 * - Connects trackers to their respective print state monitors
 * - Handles tracker cleanup when contexts are removed (including pruning
 *   the serial-keyed station tracking stores)
 * - Singleton pattern with global instance management
 *
 * Architecture:
 * - Maps context IDs to SpoolmanUsageTracker instances
 * - Listens to PrinterContextManager events for context lifecycle
 * - Independent usage tracking per printer context
 * - Event forwarding from individual trackers to global listeners
 *
 * Usage:
 * ```typescript
 * const tracker = getMultiContextSpoolmanTracker();
 * tracker.initialize();
 *
 * // Trackers are created automatically when print state monitors are ready
 * ```
 *
 * @exports MultiContextSpoolmanTracker - Main coordinator class
 * @exports getMultiContextSpoolmanTracker - Singleton instance accessor
 */

import { getPrinterContextManager } from '../managers/PrinterContextManager';
import { getPrinterBackendManager } from '../managers/PrinterBackendManager';
import { getConfigManager } from '../managers/ConfigManager';
import type { DeductionSummary } from '../types/spoolman-tracking';
import { EventEmitter } from '../utils/EventEmitter';
import type { PrintStateMonitor } from './PrintStateMonitor';
import type { PrinterPollingService } from './PrinterPollingService';
import { SpoolmanService } from './SpoolmanService';
import { getSpoolmanIntegrationService } from './SpoolmanIntegrationService';
import { getJobEstimateStore } from './JobEstimateStore';
import { getSlotSpoolStore } from './SlotSpoolStore';
import { SpoolmanUsageTracker } from './SpoolmanUsageTracker';
import { StationUsageTracker } from './StationUsageTracker';
import { pruneStationStores } from './station-store-key';

/**
 * Event map for MultiContextSpoolmanTracker
 */
interface MultiContextSpoolmanTrackerEventMap extends Record<string, unknown[]> {
  'tracker-created': [{ contextId: string }];
  'tracker-removed': [{ contextId: string }];
  'usage-updated': [
    {
      contextId: string;
      spoolId: number;
      usage: { use_weight?: number; use_length?: number };
    },
  ];
  'usage-update-failed': [
    {
      contextId: string;
      error: string;
    },
  ];
  'station-deduction': [
    {
      contextId: string;
      summary: DeductionSummary;
    },
  ];
}

/** Either tracker flavor owned by the coordinator. */
export type ContextUsageTracker = SpoolmanUsageTracker | StationUsageTracker;

/**
 * Manages Spoolman usage trackers for all printer contexts
 */
export class MultiContextSpoolmanTracker extends EventEmitter<MultiContextSpoolmanTrackerEventMap> {
  private readonly trackers = new Map<string, ContextUsageTracker>();
  private isInitialized = false;

  /**
   * Initialize the multi-context Spoolman tracker
   * Sets up event listeners for context lifecycle events
   */
  public initialize(): void {
    if (this.isInitialized) {
      console.log('[MultiContextSpoolmanTracker] Already initialized');
      return;
    }

    const contextManager = getPrinterContextManager();

    contextManager.on('context-removed', (event) => {
      this.removeTrackerForContext(event.contextId);
      // Also prune the serial-keyed station stores (estimates + ledger and
      // slot→spool assignments) for every key this context may have used.
      pruneStationStores(event.contextId);
    });

    this.isInitialized = true;
    console.log('[MultiContextSpoolmanTracker] Initialized');
  }

  /**
   * Create and configure Spoolman usage tracker for a context
   * Called when print state monitor is ready for a context
   *
   * Material-station printers (Creator 5 series, AD5X with station) get the
   * estimate-based {@link StationUsageTracker}; every other context keeps the
   * unchanged single-spool {@link SpoolmanUsageTracker} flow.
   *
   * @param contextId - Context ID
   * @param printStateMonitor - Print state monitor to attach to tracker
   * @param pollingService - Polling service feeding the monitor (station
   *   trackers use it to sample last-known progress for cancel deductions)
   */
  public createTrackerForContext(
    contextId: string,
    printStateMonitor: PrintStateMonitor,
    pollingService?: PrinterPollingService
  ): void {
    if (this.trackers.has(contextId)) {
      console.warn(`[MultiContextSpoolmanTracker] Tracker already exists for context ${contextId}`);
      return;
    }

    const isStationContext = getPrinterBackendManager().isFeatureAvailable(
      contextId,
      'material-station'
    );
    if (isStationContext) {
      this.createStationTracker(contextId, printStateMonitor, pollingService ?? null);
      this.emit('tracker-created', { contextId });
      return;
    }

    const tracker = new SpoolmanUsageTracker(contextId);

    // Wire print state monitor
    tracker.setPrintStateMonitor(printStateMonitor);

    this.setupTrackerEventForwarding(tracker);

    this.trackers.set(contextId, tracker);

    console.log(`[MultiContextSpoolmanTracker] Created tracker for context ${contextId}`);

    this.emit('tracker-created', { contextId });
  }

  /**
   * Create the estimate-based tracker for a material-station context.
   */
  private createStationTracker(
    contextId: string,
    printStateMonitor: PrintStateMonitor,
    pollingService: PrinterPollingService | null
  ): void {
    const tracker = new StationUsageTracker({
      contextId,
      estimates: getJobEstimateStore(),
      slots: getSlotSpoolStore(),
      createSpoolmanService: () => {
        const config = getConfigManager().getConfig();
        if (!config.SpoolmanEnabled || !config.SpoolmanServerUrl) {
          return null;
        }
        return new SpoolmanService(config.SpoolmanServerUrl);
      },
      integrationService: getSpoolmanIntegrationService(),
      onSummary: (summary) => {
        this.emit('station-deduction', { contextId, summary });
      },
    });
    tracker.setMonitors(printStateMonitor, pollingService);
    this.trackers.set(contextId, tracker);
    console.log(`[MultiContextSpoolmanTracker] Created station tracker for context ${contextId}`);
  }

  /**
   * Setup event forwarding from individual tracker to global listeners
   */
  private setupTrackerEventForwarding(tracker: SpoolmanUsageTracker): void {
    const contextId = tracker.getContextId();

    tracker.on('usage-updated', (event) => {
      this.emit('usage-updated', event);
    });

    tracker.on('usage-update-failed', (event) => {
      this.emit('usage-update-failed', event);
    });

    console.log(`[MultiContextSpoolmanTracker] Event forwarding setup for context ${contextId}`);
  }

  /**
   * Destroy tracker for a specific context (public API)
   * @param contextId - Context ID
   */
  public destroyTracker(contextId: string): void {
    this.removeTrackerForContext(contextId);
  }

  /**
   * Remove and dispose tracker for a context
   * Called when context is removed
   *
   * @param contextId - Context ID
   */
  private removeTrackerForContext(contextId: string): void {
    const tracker = this.trackers.get(contextId);
    if (!tracker) {
      return;
    }

    tracker.dispose();

    this.trackers.delete(contextId);

    console.log(`[MultiContextSpoolmanTracker] Removed tracker for context ${contextId}`);

    this.emit('tracker-removed', { contextId });
  }

  /**
   * Get tracker for a specific context
   *
   * @param contextId - Context ID
   * @returns Tracker instance or undefined
   */
  public getTracker(contextId: string): ContextUsageTracker | undefined {
    return this.trackers.get(contextId);
  }

  /**
   * Get the station tracker for a context (estimate-based deduction), if any.
   */
  public getStationTracker(contextId: string): StationUsageTracker | undefined {
    const tracker = this.trackers.get(contextId);
    return tracker instanceof StationUsageTracker ? tracker : undefined;
  }

  /**
   * Last deduction summary produced by a context's station tracker.
   */
  public getLastDeduction(contextId: string): DeductionSummary | null {
    return this.getStationTracker(contextId)?.getLastSummary() ?? null;
  }

  /**
   * Get all active trackers
   *
   * @returns Array of all tracker instances
   */
  public getAllTrackers(): ContextUsageTracker[] {
    return Array.from(this.trackers.values());
  }

  /**
   * Get number of active trackers
   *
   * @returns Count of trackers
   */
  public getTrackerCount(): number {
    return this.trackers.size;
  }

  /**
   * Dispose all trackers and cleanup
   */
  public dispose(): void {
    console.log('[MultiContextSpoolmanTracker] Disposing all trackers...');

    for (const [contextId, tracker] of this.trackers) {
      tracker.dispose();
      console.log(`[MultiContextSpoolmanTracker] Disposed tracker for context ${contextId}`);
    }

    this.trackers.clear();

    this.removeAllListeners();

    this.isInitialized = false;
    console.log('[MultiContextSpoolmanTracker] Disposed');
  }
}

/**
 * Global multi-context Spoolman tracker instance
 */
let globalMultiContextSpoolmanTracker: MultiContextSpoolmanTracker | null = null;

/**
 * Get global multi-context Spoolman tracker instance
 */
export function getMultiContextSpoolmanTracker(): MultiContextSpoolmanTracker {
  if (!globalMultiContextSpoolmanTracker) {
    globalMultiContextSpoolmanTracker = new MultiContextSpoolmanTracker();
  }
  return globalMultiContextSpoolmanTracker;
}

/**
 * Reset global multi-context Spoolman tracker (for testing)
 */
export function resetMultiContextSpoolmanTracker(): void {
  if (globalMultiContextSpoolmanTracker) {
    globalMultiContextSpoolmanTracker.dispose();
    globalMultiContextSpoolmanTracker = null;
  }
}
