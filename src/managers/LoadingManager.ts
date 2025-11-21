/**
 * @fileoverview Headless LoadingManager for standalone WebUI mode
 *
 * Provides a no-op implementation of LoadingManager for headless Node.js operation.
 * All loading states are logged to console instead of displaying UI overlays.
 *
 * This adapter allows PrinterBackendManager and ConnectionFlowManager to work
 * without requiring Electron-specific UI components.
 */

import { EventEmitter } from 'events';

/**
 * Loading state types for different UI states
 */
export type LoadingState = 'hidden' | 'loading' | 'success' | 'error';

/**
 * Loading operation options for customizing behavior
 */
export interface LoadingOptions {
  message: string;
  canCancel?: boolean;
  showProgress?: boolean;
  autoHideAfter?: number; // milliseconds
}

/**
 * Loading event data sent to renderer
 */
export interface LoadingEventData {
  state: LoadingState;
  message?: string;
  progress?: number;
  canCancel?: boolean;
  autoHideAfter?: number;
}

/**
 * Branded type for LoadingManager singleton
 */
type LoadingManagerBrand = { readonly __brand: 'LoadingManager' };
type LoadingManagerInstance = LoadingManager & LoadingManagerBrand;

/**
 * Headless LoadingManager - logs loading states instead of showing UI
 */
export class LoadingManager extends EventEmitter {
  private static instance: LoadingManagerInstance | null = null;

  private currentState: LoadingState = 'hidden';
  private currentMessage: string = '';
  private currentProgress: number = 0;
  private canCancelFlag: boolean = false;

  private constructor() {
    super();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): LoadingManagerInstance {
    if (!LoadingManager.instance) {
      LoadingManager.instance = new LoadingManager() as LoadingManagerInstance;
    }
    return LoadingManager.instance;
  }

  /**
   * Show loading overlay with message (headless: just logs)
   */
  public show(options: LoadingOptions): void {
    this.currentState = 'loading';
    this.currentMessage = options.message;
    this.currentProgress = 0;
    this.canCancelFlag = options.canCancel || false;

    console.log(`[Loading] ${this.currentMessage}`);

    const eventData: LoadingEventData = {
      state: this.currentState,
      message: this.currentMessage,
      progress: this.currentProgress,
      canCancel: this.canCancelFlag
    };

    this.emit('loading-state-changed', eventData);
    this.emit('loadingStateChanged', eventData.state);
  }

  /**
   * Hide loading overlay (headless: just logs)
   */
  public hide(): void {
    this.currentState = 'hidden';
    this.currentMessage = '';
    this.currentProgress = 0;
    this.canCancelFlag = false;

    const eventData: LoadingEventData = {
      state: this.currentState
    };

    this.emit('loading-state-changed', eventData);
    this.emit('loadingStateChanged', eventData.state);
  }

  /**
   * Show success message (headless: just logs)
   */
  public showSuccess(message: string, _autoHideAfter: number = 4000): void {
    this.currentState = 'success';
    this.currentMessage = message;

    console.log(`[Loading] ✓ ${message}`);

    const eventData: LoadingEventData = {
      state: this.currentState,
      message: this.currentMessage,
      autoHideAfter: _autoHideAfter
    };

    this.emit('loading-state-changed', eventData);
    this.emit('loadingStateChanged', eventData.state);

    // Auto-hide after timeout
    setTimeout(() => this.hide(), _autoHideAfter);
  }

  /**
   * Show error message (headless: just logs)
   */
  public showError(message: string, _autoHideAfter: number = 5000): void {
    this.currentState = 'error';
    this.currentMessage = message;

    console.error(`[Loading] ✗ ${message}`);

    const eventData: LoadingEventData = {
      state: this.currentState,
      message: this.currentMessage,
      autoHideAfter: _autoHideAfter
    };

    this.emit('loading-state-changed', eventData);
    this.emit('loadingStateChanged', eventData.state);

    // Auto-hide after timeout
    setTimeout(() => this.hide(), _autoHideAfter);
  }

  /**
   * Set progress percentage
   */
  public setProgress(progress: number): void {
    this.currentProgress = Math.min(100, Math.max(0, progress));

    const eventData: LoadingEventData = {
      state: this.currentState,
      message: this.currentMessage,
      progress: this.currentProgress,
      canCancel: this.canCancelFlag
    };

    this.emit('loading-state-changed', eventData);
  }

  /**
   * Update loading message
   */
  public updateMessage(message: string): void {
    this.currentMessage = message;

    console.log(`[Loading] ${message}`);

    const eventData: LoadingEventData = {
      state: this.currentState,
      message: this.currentMessage,
      progress: this.currentProgress,
      canCancel: this.canCancelFlag
    };

    this.emit('loading-state-changed', eventData);
  }

  /**
   * Handle cancel request (headless: always returns false - no cancellation)
   */
  public handleCancelRequest(): boolean {
    return false;
  }

  /**
   * Get current state
   */
  public getState(): LoadingState {
    return this.currentState;
  }

  /**
   * Get current message
   */
  public getMessage(): string {
    return this.currentMessage;
  }

  /**
   * Get current progress
   */
  public getProgress(): number {
    return this.currentProgress;
  }

  /**
   * Check if loading is visible
   */
  public isVisible(): boolean {
    return this.currentState !== 'hidden';
  }

  /**
   * Check if operation is cancellable
   */
  public isCancellable(): boolean {
    return this.canCancelFlag;
  }

  /**
   * Cleanup and dispose
   */
  public dispose(): void {
    this.hide();
    this.removeAllListeners();
    LoadingManager.instance = null;
  }
}

/**
 * Get singleton instance
 */
export function getLoadingManager(): LoadingManagerInstance {
  return LoadingManager.getInstance();
}
