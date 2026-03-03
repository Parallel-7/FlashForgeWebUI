/**
 * @fileoverview Environment service for path resolution and environment detection
 *
 * Provides environment-aware path resolution for data storage and static assets.
 * Standalone implementation without Electron dependencies.
 */

import * as fs from 'fs';
import * as path from 'path';

interface PkgRuntimeMetadata {
  entrypoint?: string;
}

type PkgProcess = NodeJS.Process & {
  pkg?: PkgRuntimeMetadata;
};

/**
 * Environment service for determining runtime environment and paths
 * Standalone Node.js implementation
 */
export class EnvironmentService {
  private readonly _isPackaged: boolean;

  constructor() {
    // Detect if running as a pkg-bundled binary
    // In pkg binaries, __dirname points to a snapshot filesystem path
    // Also check for the PKG_EXECPATH environment variable which pkg sets
    this._isPackaged = this.detectPackagedEnvironment();
  }

  /**
   * Detect if running in a packaged (pkg) environment
   * Uses multiple detection methods for reliability
   */
  private detectPackagedEnvironment(): boolean {
    const pkgProcess = process as PkgProcess;

    // Method 1: Check for PKG_EXECPATH environment variable (set by pkg)
    if (process.env.PKG_EXECPATH) {
      return true;
    }

    // Method 2: Check if __dirname contains snapshot path (pkg uses /snapshot/)
    if (__dirname.includes('/snapshot/') || __dirname.includes('\\snapshot\\')) {
      return true;
    }

    // Method 3: Check if running from a binary (process.pkg exists in pkg binaries)
    if (pkgProcess.pkg) {
      return true;
    }

    return false;
  }

  /**
   * Resolve the packaged entry directory from pkg metadata when available.
   * Falls back to the current module directory for compatibility with older output layouts.
   */
  private getPackagedEntrypointDir(): string {
    const pkgProcess = process as PkgProcess;
    const packagedEntrypoint = pkgProcess.pkg?.entrypoint;

    if (typeof packagedEntrypoint === 'string' && packagedEntrypoint.length > 0) {
      return path.dirname(packagedEntrypoint);
    }

    return __dirname;
  }

  /**
   * Resolve WebUI static assets inside a pkg snapshot.
   *
   * We support both layouts:
   * - bundled backend:   /snapshot/.../dist/index.js -> /snapshot/.../dist/webui/static
   * - legacy tsc output: /snapshot/.../dist/services/*.js -> /snapshot/.../dist/webui/static
   */
  private getPackagedStaticPath(): string {
    const packagedEntrypointDir = this.getPackagedEntrypointDir();
    const candidatePaths = [
      path.join(packagedEntrypointDir, 'webui', 'static'),
      path.join(packagedEntrypointDir, '..', 'webui', 'static'),
    ];

    const existingPath = candidatePaths.find((candidatePath) => fs.existsSync(candidatePath));
    return existingPath ?? candidatePaths[0];
  }

  /**
   * Check if running in a packaged binary (pkg)
   */
  public isPackaged(): boolean {
    return this._isPackaged;
  }

  /**
   * Check if running in Electron
   * Always returns false in standalone implementation
   */
  public isElectron(): boolean {
    return false;
  }

  /**
   * Check if running in production mode
   * Returns true if packaged or NODE_ENV is 'production'
   */
  public isProduction(): boolean {
    return this._isPackaged || process.env.NODE_ENV === 'production';
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
   * In packaged binaries: relative to __dirname (embedded in pkg snapshot)
   * In development: relative to process.cwd()/dist/
   */
  public getWebUIStaticPath(): string {
    if (this._isPackaged) {
      return this.getPackagedStaticPath();
    }

    // In development or running via node directly, use process.cwd()
    const devStaticPath = path.join(process.cwd(), 'dist/webui/static');

    // Verify the path exists for better error messages
    if (!fs.existsSync(devStaticPath)) {
      console.warn(`[EnvironmentService] Static path not found: ${devStaticPath}`);
      console.warn('[EnvironmentService] Did you run "npm run build" first?');
    }

    return devStaticPath;
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

  /**
   * Get environment info for debugging
   */
  public getEnvironmentInfo(): {
    isPackaged: boolean;
    isProduction: boolean;
    isDevelopment: boolean;
    dirname: string;
    cwd: string;
    staticPath: string;
    dataPath: string;
  } {
    return {
      isPackaged: this._isPackaged,
      isProduction: this.isProduction(),
      isDevelopment: this.isDevelopment(),
      dirname: __dirname,
      cwd: process.cwd(),
      staticPath: this.getWebUIStaticPath(),
      dataPath: this.getDataPath(),
    };
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
