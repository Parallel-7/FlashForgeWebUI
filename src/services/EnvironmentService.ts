/**
 * @fileoverview Environment service for path resolution and environment detection
 *
 * Provides environment-aware path resolution for data storage and static assets.
 * Standalone implementation without Electron dependencies.
 */

import * as path from 'path';

/**
 * Environment service for determining runtime environment and paths
 * Standalone Node.js implementation
 */
export class EnvironmentService {
  /**
   * Check if running in Electron
   * Always returns false in standalone implementation
   */
  public isElectron(): boolean {
    return false;
  }

  /**
   * Check if running in production mode
   */
  public isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Check if running in development mode
   */
  public isDevelopment(): boolean {
    return !this.isProduction();
  }

  /**
   * Get the data directory path for storing configuration and printer details
   * Uses process.cwd()/data in standalone implementation
   */
  public getDataPath(): string {
    return path.join(process.cwd(), 'data');
  }

  /**
   * Get the WebUI static files path
   * In production: relative to compiled dist/
   * In development: relative to source dist/
   */
  public getWebUIStaticPath(): string {
    if (this.isProduction()) {
      // In production, static files are in dist/webui/static relative to the compiled code
      return path.join(__dirname, '../webui/static');
    }
    // In development, static files are in dist/webui/static from project root
    return path.join(process.cwd(), 'dist/webui/static');
  }

  /**
   * Get the application root path
   */
  public getAppRootPath(): string {
    return process.cwd();
  }

  /**
   * Get the logs directory path
   */
  public getLogsPath(): string {
    return path.join(this.getDataPath(), 'logs');
  }
}

// Singleton instance
let environmentService: EnvironmentService | null = null;

/**
 * Get the singleton EnvironmentService instance
 */
export function getEnvironmentService(): EnvironmentService {
  if (!environmentService) {
    environmentService = new EnvironmentService();
  }
  return environmentService;
}
