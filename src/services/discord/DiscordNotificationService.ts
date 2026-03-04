/**
 * @fileoverview Discord webhook notification service for multi-printer status updates.
 *
 * Provides Discord webhook integration for the standalone WebUI using a single
 * global periodic timer plus event-driven notifications for print completion,
 * printer cooled, and idle transitions.
 */

import { EventEmitter } from 'events';
import { getConfigManager, type ConfigManager } from '../../managers/ConfigManager';
import {
  getPrinterContextManager,
  type PrinterContext,
  type PrinterContextManager,
} from '../../managers/PrinterContextManager';
import type { ContextRemovedEvent } from '../../types/printer';
import type { DiscordEmbed, DiscordEmbedField, DiscordServiceConfig, DiscordWebhookPayload } from '../../types/discord';
import type { PrinterState, PrinterStatus } from '../../types/polling';
import type { PrintStateMonitor } from '../PrintStateMonitor';
import type { TemperatureMonitoringService } from '../TemperatureMonitoringService';

type DiscordPrinterState = 'idle' | 'printing' | 'paused' | 'unknown';

type MonitorAttachment = {
  stateMonitor: PrintStateMonitor;
  printCompletedListener: (event: {
    contextId: string;
    jobName: string;
    status: PrinterStatus;
    completedAt: Date;
  }) => void;
  temperatureMonitor?: TemperatureMonitoringService;
  printerCooledListener?: (event: {
    contextId: string;
    temperature: number;
    bedCooledAt: Date;
    status: PrinterStatus;
  }) => void;
};

export class DiscordNotificationService extends EventEmitter {
  private readonly configManager: ConfigManager;
  private readonly contextManager: PrinterContextManager;
  private readonly handleConfigUpdatedBound: () => void;
  private readonly handleContextRemovedBound: (event: ContextRemovedEvent) => void;

  private readonly lastPrinterState = new Map<string, DiscordPrinterState>();
  private readonly cachedStatuses = new Map<string, PrinterStatus>();
  private readonly monitorListeners = new Map<string, MonitorAttachment>();

  private readonly RATE_LIMIT_DELAY_MS = 1000;

  private isInitialized = false;
  private periodicUpdateTimer: NodeJS.Timeout | null = null;
  private periodicUpdateIntervalMs: number | null = null;
  private isPeriodicUpdateInProgress = false;
  private shouldRunPeriodicUpdateAgain = false;
  private currentConfig: DiscordServiceConfig;

  constructor(configManager?: ConfigManager, contextManager?: PrinterContextManager) {
    super();

    this.configManager = configManager ?? getConfigManager();
    this.contextManager = contextManager ?? getPrinterContextManager();
    this.currentConfig = this.extractDiscordConfig();

    this.handleConfigUpdatedBound = () => {
      this.handleConfigUpdate();
    };
    this.handleContextRemovedBound = (event: ContextRemovedEvent) => {
      this.unregisterContext(event.contextId);
    };
  }

  public initialize(): void {
    if (this.isInitialized) {
      console.log('[DiscordNotificationService] Already initialized');
      return;
    }

    this.configManager.on('configUpdated', this.handleConfigUpdatedBound);
    this.contextManager.on('context-removed', this.handleContextRemovedBound);

    this.reconcilePeriodicTimer({ sendImmediateUpdate: true });

    this.isInitialized = true;
    console.log('[DiscordNotificationService] Initialized');
  }

  public registerContext(contextId: string): void {
    console.log(`[DiscordNotificationService] Registering context ${contextId}`);

    if (this.lastPrinterState.has(contextId)) {
      console.log(`[DiscordNotificationService] Context ${contextId} already registered`);
      return;
    }

    this.lastPrinterState.set(contextId, 'unknown');
    this.reconcilePeriodicTimer();
  }

  public unregisterContext(contextId: string): void {
    console.log(`[DiscordNotificationService] Unregistering context ${contextId}`);

    this.detachContextMonitors(contextId);
    this.lastPrinterState.delete(contextId);
    this.cachedStatuses.delete(contextId);
    this.reconcilePeriodicTimer();
  }

  public attachContextMonitors(
    contextId: string,
    stateMonitor: PrintStateMonitor,
    temperatureMonitor?: TemperatureMonitoringService
  ): void {
    this.detachContextMonitors(contextId);

    const printCompletedListener = (event: {
      contextId: string;
      jobName: string;
      status: PrinterStatus;
      completedAt: Date;
    }): void => {
      const duration = event.status.currentJob?.progress.elapsedTimeSeconds;
      void this.notifyPrintComplete(event.contextId, event.jobName, duration);
    };

    stateMonitor.on('print-completed', printCompletedListener);

    let printerCooledListener:
      | ((event: {
          contextId: string;
          temperature: number;
          bedCooledAt: Date;
          status: PrinterStatus;
        }) => void)
      | undefined;
    if (temperatureMonitor) {
      printerCooledListener = (event): void => {
        void this.notifyPrinterCooled(event.contextId);
      };
      temperatureMonitor.on('printer-cooled', printerCooledListener);
    }

    this.monitorListeners.set(contextId, {
      stateMonitor,
      printCompletedListener,
      temperatureMonitor,
      printerCooledListener,
    });
  }

  public dispose(): void {
    console.log('[DiscordNotificationService] Disposing...');

    this.stopPeriodicTimer();

    for (const contextId of this.monitorListeners.keys()) {
      this.detachContextMonitors(contextId);
    }

    this.lastPrinterState.clear();
    this.cachedStatuses.clear();
    this.shouldRunPeriodicUpdateAgain = false;
    this.isPeriodicUpdateInProgress = false;

    this.configManager.off('configUpdated', this.handleConfigUpdatedBound);
    this.contextManager.off('context-removed', this.handleContextRemovedBound);
    this.removeAllListeners();

    this.isInitialized = false;
    console.log('[DiscordNotificationService] Disposed');
  }

  public updatePrinterStatus(contextId: string, status: PrinterStatus): void {
    this.cachedStatuses.set(contextId, status);
    this.checkStateTransition(contextId, status);
  }

  public async notifyPrintComplete(
    contextId: string,
    fileName: string,
    durationSeconds?: number
  ): Promise<void> {
    if (!this.currentConfig.enabled || !this.currentConfig.webhookUrl) {
      return;
    }

    try {
      const embed: DiscordEmbed = {
        title: 'Print Complete!',
        color: 0x00ff00,
        timestamp: new Date().toISOString(),
        fields: [
          {
            name: 'File',
            value: fileName,
            inline: false,
          },
          {
            name: 'Total Time',
            value: durationSeconds !== undefined ? this.formatDuration(durationSeconds) : 'Unknown',
            inline: true,
          },
        ],
      };

      await this.sendWebhook({ embeds: [embed] });

      console.log(`[DiscordNotificationService] Sent print complete notification for ${contextId}`);
      this.emit('notification-sent', { contextId, type: 'print-complete' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DiscordNotificationService] Failed to send print complete notification: ${errorMessage}`);
    }
  }

  public async notifyPrinterCooled(contextId: string): Promise<void> {
    if (!this.currentConfig.enabled || !this.currentConfig.webhookUrl) {
      return;
    }

    try {
      const embed: DiscordEmbed = {
        title: 'Printer Cooled Down',
        color: 0x3498db,
        timestamp: new Date().toISOString(),
        fields: [
          {
            name: 'Status',
            value: 'The printer has cooled down and is ready for the next print.',
            inline: false,
          },
        ],
      };

      await this.sendWebhook({ embeds: [embed] });

      console.log(`[DiscordNotificationService] Sent printer cooled notification for ${contextId}`);
      this.emit('notification-sent', { contextId, type: 'printer-cooled' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DiscordNotificationService] Failed to send printer cooled notification: ${errorMessage}`);
    }
  }

  private extractDiscordConfig(): DiscordServiceConfig {
    const config = this.configManager.getConfig();

    return {
      enabled: config.DiscordSync,
      webhookUrl: config.WebhookUrl,
      updateIntervalMinutes: config.DiscordUpdateIntervalMinutes,
    };
  }

  private handleConfigUpdate(): void {
    const newConfig = this.extractDiscordConfig();
    const configChanged =
      this.currentConfig.enabled !== newConfig.enabled ||
      this.currentConfig.webhookUrl !== newConfig.webhookUrl ||
      this.currentConfig.updateIntervalMinutes !== newConfig.updateIntervalMinutes;

    if (!configChanged) {
      return;
    }

    console.log('[DiscordNotificationService] Config changed, restarting timers');
    this.currentConfig = newConfig;
    this.reconcilePeriodicTimer({ sendImmediateUpdate: true });
  }

  private reconcilePeriodicTimer(options?: { sendImmediateUpdate?: boolean }): void {
    const shouldRunTimer = this.shouldRunPeriodicTimer();
    if (!shouldRunTimer) {
      this.stopPeriodicTimer();
      return;
    }

    const intervalMinutes = Math.max(1, this.currentConfig.updateIntervalMinutes || 1);
    const intervalMs = intervalMinutes * 60 * 1000;
    const timerNeedsRestart =
      this.periodicUpdateTimer === null || this.periodicUpdateIntervalMs !== intervalMs;

    if (!timerNeedsRestart) {
      if (options?.sendImmediateUpdate) {
        void this.runPeriodicStatusUpdates();
      }
      return;
    }

    this.stopPeriodicTimer();
    this.startPeriodicTimer(intervalMs, options?.sendImmediateUpdate === true);
  }

  private shouldRunPeriodicTimer(): boolean {
    return (
      this.currentConfig.enabled &&
      Boolean(this.currentConfig.webhookUrl) &&
      this.lastPrinterState.size > 0
    );
  }

  private startPeriodicTimer(intervalMs: number, sendImmediateUpdate: boolean): void {
    if (sendImmediateUpdate) {
      void this.runPeriodicStatusUpdates();
    }

    this.periodicUpdateTimer = setInterval(() => {
      void this.runPeriodicStatusUpdates();
    }, intervalMs);
    this.periodicUpdateIntervalMs = intervalMs;

    console.log(
      `[DiscordNotificationService] Started global timer (${this.currentConfig.updateIntervalMinutes} min interval)`
    );
  }

  private stopPeriodicTimer(): void {
    if (this.periodicUpdateTimer) {
      clearInterval(this.periodicUpdateTimer);
      this.periodicUpdateTimer = null;
      this.periodicUpdateIntervalMs = null;
      console.log('[DiscordNotificationService] Stopped global timer');
    }
  }

  private async runPeriodicStatusUpdates(): Promise<void> {
    if (this.isPeriodicUpdateInProgress) {
      this.shouldRunPeriodicUpdateAgain = true;
      return;
    }

    this.isPeriodicUpdateInProgress = true;

    try {
      do {
        this.shouldRunPeriodicUpdateAgain = false;
        await this.sendStatusUpdatesForAllContexts();
      } while (this.shouldRunPeriodicUpdateAgain && this.shouldRunPeriodicTimer());
    } finally {
      this.isPeriodicUpdateInProgress = false;
    }
  }

  private detachContextMonitors(contextId: string): void {
    const listeners = this.monitorListeners.get(contextId);
    if (!listeners) {
      return;
    }

    listeners.stateMonitor.off('print-completed', listeners.printCompletedListener);
    if (listeners.temperatureMonitor && listeners.printerCooledListener) {
      listeners.temperatureMonitor.off('printer-cooled', listeners.printerCooledListener);
    }

    this.monitorListeners.delete(contextId);
  }

  private checkStateTransition(contextId: string, status: PrinterStatus): void {
    const currentState = this.mapPrinterState(status.state);
    const previousState = this.lastPrinterState.get(contextId) ?? 'unknown';

    if (previousState !== 'idle' && currentState === 'idle' && previousState !== 'unknown') {
      console.log(`[DiscordNotificationService] Detected idle transition for context ${contextId}`);
      void this.sendIdleNotification(contextId, status);
    }

    this.lastPrinterState.set(contextId, currentState);
  }

  private mapPrinterState(state: PrinterState): DiscordPrinterState {
    switch (state) {
      case 'Ready':
        return 'idle';
      case 'Printing':
        return 'printing';
      case 'Paused':
        return 'paused';
      default:
        return 'unknown';
    }
  }

  private async sendStatusUpdatesForAllContexts(): Promise<void> {
    if (!this.currentConfig.enabled || !this.currentConfig.webhookUrl) {
      return;
    }

    const contexts = this.contextManager.getAllContexts();
    const connectedContexts = contexts.filter(
      (context) => context.connectionState === 'connected' && this.cachedStatuses.has(context.id)
    );

    console.log(
      `[DiscordNotificationService] Sending updates for ${connectedContexts.length} contexts`
    );

    for (let index = 0; index < connectedContexts.length; index++) {
      const context = connectedContexts[index];
      const status = this.cachedStatuses.get(context.id);

      if (status) {
        const currentState = this.mapPrinterState(status.state);
        if (currentState === 'idle') {
          console.log(
            `[DiscordNotificationService] Skipping idle printer on timer update: ${context.id}`
          );
          continue;
        }

        await this.sendStatusUpdate(context.id, status, context);

        if (index < connectedContexts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, this.RATE_LIMIT_DELAY_MS));
        }
      }
    }
  }

  private async sendStatusUpdate(
    contextId: string,
    status: PrinterStatus,
    context?: PrinterContext
  ): Promise<void> {
    try {
      const resolvedContext = context ?? this.contextManager.getContext(contextId);
      if (!resolvedContext) {
        console.warn(`[DiscordNotificationService] Context not found: ${contextId}`);
        return;
      }

      const embed = this.createStatusEmbed(status, resolvedContext);
      await this.sendWebhook({ embeds: [embed] });

      console.log(`[DiscordNotificationService] Sent status update for ${contextId}`);
      this.emit('notification-sent', { contextId, type: 'status' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DiscordNotificationService] Failed to send status update: ${errorMessage}`);
      this.emit('notification-failed', { contextId, error: errorMessage });
    }
  }

  private async sendIdleNotification(contextId: string, status: PrinterStatus): Promise<void> {
    if (!this.currentConfig.enabled || !this.currentConfig.webhookUrl) {
      return;
    }

    try {
      const context = this.contextManager.getContext(contextId);
      if (!context) {
        return;
      }

      const embed = this.createStatusEmbed(status, context);
      await this.sendWebhook({ embeds: [embed] });

      console.log(
        `[DiscordNotificationService] Sent idle transition notification for ${contextId}`
      );
      this.emit('notification-sent', { contextId, type: 'idle-transition' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DiscordNotificationService] Failed to send idle notification: ${errorMessage}`);
    }
  }

  private createStatusEmbed(status: PrinterStatus, context: PrinterContext): DiscordEmbed {
    const fields: DiscordEmbedField[] = [];

    fields.push({
      name: 'Status',
      value: this.formatMachineStatus(status.state),
      inline: true,
    });

    if (status.temperatures?.extruder) {
      fields.push({
        name: 'Extruder Temp',
        value: `${this.roundTemperature(status.temperatures.extruder.current)}C / ${this.roundTemperature(status.temperatures.extruder.target)}C`,
        inline: true,
      });
    }

    if (status.temperatures?.bed) {
      fields.push({
        name: 'Bed Temp',
        value: `${this.roundTemperature(status.temperatures.bed.current)}C / ${this.roundTemperature(status.temperatures.bed.target)}C`,
        inline: true,
      });
    }

    if (status.currentJob) {
      const progress = status.currentJob.progress.percentage / 100;
      const progressBar = this.createProgressBar(progress);

      fields.push({
        name: 'Progress',
        value: `${progressBar} ${Math.round(progress * 100)}%`,
        inline: false,
      });

      if (status.currentJob.progress.elapsedTimeSeconds !== undefined) {
        fields.push({
          name: 'Print Time',
          value: this.formatDuration(status.currentJob.progress.elapsedTimeSeconds),
          inline: true,
        });
      }

      const etaDate = this.resolveEtaDate(status);
      if (etaDate) {
        fields.push({
          name: 'ETA',
          value: etaDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }),
          inline: true,
        });
      }

      if (
        status.currentJob.progress.currentLayer !== undefined &&
        status.currentJob.progress.currentLayer !== null &&
        status.currentJob.progress.totalLayers !== undefined &&
        status.currentJob.progress.totalLayers !== null
      ) {
        fields.push({
          name: 'Layer',
          value: `${status.currentJob.progress.currentLayer} / ${status.currentJob.progress.totalLayers}`,
          inline: true,
        });
      }

      if (status.currentJob.fileName) {
        fields.push({
          name: 'File',
          value: status.currentJob.fileName,
          inline: false,
        });
      }
    }

    return {
      title: `${context.name || 'FlashForge Printer'}`,
      color: this.getStatusColor(status.state),
      timestamp: new Date().toISOString(),
      fields,
    };
  }

  private resolveEtaDate(status: PrinterStatus): Date | null {
    const progress = status.currentJob?.progress;
    if (!progress) {
      return null;
    }

    if (progress.formattedEta && progress.formattedEta !== '--:--') {
      const [hours, minutes] = progress.formattedEta.split(':').map(Number);
      if (Number.isFinite(hours) && Number.isFinite(minutes)) {
        return new Date(Date.now() + (hours * 60 + minutes) * 60_000);
      }
    }

    if (progress.timeRemaining != null) {
      return new Date(Date.now() + progress.timeRemaining * 60_000);
    }

    return null;
  }

  private getStatusColor(state: PrinterState): number {
    switch (state) {
      case 'Printing':
        return 0x00ff00;
      case 'Ready':
        return 0x3498db;
      case 'Paused':
        return 0xf39c12;
      default:
        return 0x95a5a6;
    }
  }

  private formatMachineStatus(state: PrinterState): string {
    const statusMap: Record<PrinterState, string> = {
      Ready: 'Ready',
      Printing: 'Printing',
      Paused: 'Paused',
      Completed: 'Completed',
      Error: 'Error',
      Busy: 'Busy',
      Calibrating: 'Calibrating',
      Heating: 'Heating',
      Pausing: 'Pausing',
      Cancelled: 'Cancelled',
    };

    return statusMap[state] || state;
  }

  private createProgressBar(progress: number): string {
    const percentage = Math.max(0, Math.min(100, progress * 100));
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;

    return `${'='.repeat(filled)}${'.'.repeat(empty)}`;
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return `${hours}h ${minutes}m`;
  }

  private roundTemperature(temp: number): string {
    if (typeof temp !== 'number' || Number.isNaN(temp)) {
      return '0.00';
    }

    return temp.toFixed(2);
  }

  private async sendWebhook(payload: DiscordWebhookPayload): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(this.currentConfig.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Discord webhook returned ${response.status}: ${response.statusText}`);
      }

      console.log('[DiscordNotificationService] Webhook sent successfully');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

let globalDiscordNotificationService: DiscordNotificationService | null = null;

export function getDiscordNotificationService(): DiscordNotificationService {
  if (!globalDiscordNotificationService) {
    globalDiscordNotificationService = new DiscordNotificationService();
  }

  return globalDiscordNotificationService;
}

export function resetDiscordNotificationService(): void {
  if (globalDiscordNotificationService) {
    globalDiscordNotificationService.dispose();
    globalDiscordNotificationService = null;
  }
}
