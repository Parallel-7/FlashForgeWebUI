/**
 * @fileoverview Manages the go2rtc binary lifecycle for the standalone WebUI.
 *
 * The go2rtc binary is bundled per platform under resources/bin/{platform-arch}
 * and extracted to the writable data directory when running from a pkg snapshot.
 */

import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { getEnvironmentService } from './EnvironmentService';
import type { Go2rtcBinaryInfo, Go2rtcConfig } from '../types/go2rtc.types';

type PkgProcess = NodeJS.Process & {
  pkg?: {
    entrypoint?: string;
  };
};

const GO2RTC_VERSION = '1.9.13';

/**
 * Singleton manager for go2rtc binary lifecycle.
 */
export class Go2rtcBinaryManager {
  private static instance: Go2rtcBinaryManager | null = null;

  /** go2rtc child process. */
  private process: ChildProcess | null = null;

  /** Whether process is currently starting. */
  private isStarting = false;

  /** Process exit promise for graceful shutdown. */
  private exitPromise: Promise<void> | null = null;

  /** Path to runtime config file. */
  private configPath: string | null = null;

  /** API port. */
  private readonly apiPort = 1984;

  /** WebRTC port. */
  private readonly webrtcPort = 8555;

  /** Timeout for graceful shutdown. */
  private readonly shutdownTimeoutMs = 5000;

  /** Startup bind errors emitted by the managed process. */
  private readonly startupListenErrors: string[] = [];

  /** Environment service for packaged/runtime paths. */
  private readonly environmentService = getEnvironmentService();

  private constructor() {}

  /**
   * Get the singleton instance.
   */
  public static getInstance(): Go2rtcBinaryManager {
    if (!Go2rtcBinaryManager.instance) {
      Go2rtcBinaryManager.instance = new Go2rtcBinaryManager();
    }
    return Go2rtcBinaryManager.instance;
  }

  /**
   * Get binary information for the current platform.
   */
  public getBinaryInfo(): Go2rtcBinaryInfo {
    const executablePath = this.environmentService.isPackaged()
      ? this.getRuntimeBinaryPath()
      : this.getBundledBinaryPath();

    return {
      path: executablePath,
      platform: process.platform,
      arch: process.arch,
      exists: fs.existsSync(executablePath),
    };
  }

  /**
   * Get the API URL for go2rtc.
   */
  public getApiUrl(): string {
    return `http://127.0.0.1:${this.apiPort}`;
  }

  /**
   * Get the API port.
   */
  public getApiPort(): number {
    return this.apiPort;
  }

  /**
   * Get the WebRTC port.
   */
  public getWebRtcPort(): number {
    return this.webrtcPort;
  }

  /**
   * Check if go2rtc process is running.
   */
  public isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }

  /**
   * Get the process ID if running.
   */
  public getPid(): number | undefined {
    return this.process?.pid;
  }

  /**
   * Start the go2rtc process.
   */
  public async start(): Promise<void> {
    if (this.isRunning()) {
      console.log('[Go2rtcBinaryManager] Already running');
      return;
    }

    if (this.isStarting) {
      while (this.isStarting) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return;
    }

    this.isStarting = true;

    try {
      await this.assertRequiredPortsAvailable();

      const executablePath = await this.ensureExecutableBinaryPath();
      this.configPath = await this.generateConfig();
      this.startupListenErrors.length = 0;

      console.log(`[Go2rtcBinaryManager] Starting: ${executablePath}`);
      console.log(`[Go2rtcBinaryManager] Config: ${this.configPath}`);

      this.process = spawn(executablePath, ['-config', this.configPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      this.exitPromise = new Promise<void>((resolve) => {
        this.process?.on('exit', (code, signal) => {
          console.log(`[Go2rtcBinaryManager] Process exited: code=${code}, signal=${signal}`);
          this.process = null;
          resolve();
        });
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleProcessOutput(data, false);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        this.handleProcessOutput(data, true);
      });

      this.process.on('error', (error) => {
        console.error('[Go2rtcBinaryManager] Process error:', error);
        this.process = null;
      });

      await this.waitForReady();
      await this.assertNoStartupBindErrors();

      console.log(`[Go2rtcBinaryManager] Started successfully on port ${this.apiPort}`);
    } catch (error) {
      await this.stop();
      throw error;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Stop the go2rtc process gracefully.
   */
  public async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    console.log('[Go2rtcBinaryManager] Stopping...');

    const pid = this.process.pid;

    if (process.platform === 'win32') {
      this.process.kill();
    } else {
      this.process.kill('SIGTERM');
    }

    if (this.exitPromise) {
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          if (this.process) {
            console.log('[Go2rtcBinaryManager] Force killing...');
            this.process.kill('SIGKILL');
          }
          resolve();
        }, this.shutdownTimeoutMs);
      });

      await Promise.race([this.exitPromise, timeoutPromise]);
    }

    this.process = null;
    this.exitPromise = null;
    this.startupListenErrors.length = 0;

    console.log(`[Go2rtcBinaryManager] Stopped (was pid=${pid})`);
  }

  /**
   * Handle go2rtc stdout/stderr and capture fatal startup bind errors.
   */
  private handleProcessOutput(data: Buffer, isErrorStream: boolean): void {
    const lines = data.toString().trim().split('\n');

    for (const line of lines) {
      if (!line) {
        continue;
      }

      if (line.includes('[api] listen error=') || line.includes('[webrtc] listen error=')) {
        this.startupListenErrors.push(line);
      }

      if (isErrorStream) {
        console.error(`[go2rtc] ${line}`);
      } else {
        console.log(`[go2rtc] ${line}`);
      }
    }
  }

  /**
   * Resolve the packaged entrypoint directory when running under pkg.
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
   * Resolve the platform-arch directory used for bundled binaries.
   */
  private getPlatformArch(): string {
    const { platform, arch } = process;

    if (platform === 'win32' && (arch === 'x64' || arch === 'arm64')) {
      return `${platform}-${arch}`;
    }

    if (platform === 'darwin' && (arch === 'x64' || arch === 'arm64')) {
      return `${platform}-${arch}`;
    }

    if (platform === 'linux' && (arch === 'x64' || arch === 'arm64' || arch === 'arm')) {
      return `${platform}-${arch}`;
    }

    throw new Error(`Unsupported platform/arch for go2rtc: ${platform}-${arch}`);
  }

  /**
   * Get the expected binary file name for the current platform.
   */
  private getBinaryName(): string {
    return process.platform === 'win32' ? 'go2rtc.exe' : 'go2rtc';
  }

  /**
   * Resolve candidate locations for the bundled binary asset.
   */
  private getBundledBinaryPathCandidates(): string[] {
    const platformArch = this.getPlatformArch();
    const binaryName = this.getBinaryName();

    if (this.environmentService.isPackaged()) {
      const entrypointDir = this.getPackagedEntrypointDir();
      return [
        path.join(entrypointDir, '..', 'resources', 'bin', platformArch, binaryName),
        path.join(entrypointDir, 'resources', 'bin', platformArch, binaryName),
      ];
    }

    return [
      path.join(this.environmentService.getAppRootPath(), 'resources', 'bin', platformArch, binaryName),
      path.join(__dirname, '..', 'resources', 'bin', platformArch, binaryName),
      path.join(__dirname, '..', '..', 'resources', 'bin', platformArch, binaryName),
    ];
  }

  /**
   * Resolve the bundled binary path, preferring an existing candidate.
   */
  private getBundledBinaryPath(): string {
    const candidates = this.getBundledBinaryPathCandidates();
    const existingPath = candidates.find((candidatePath) => fs.existsSync(candidatePath));
    return existingPath ?? candidates[0];
  }

  /**
   * Resolve the extracted runtime binary path for pkg builds.
   */
  private getRuntimeBinaryPath(): string {
    return path.join(
      this.environmentService.getDataPath(),
      'runtime',
      'go2rtc',
      GO2RTC_VERSION,
      this.getPlatformArch(),
      this.getBinaryName()
    );
  }

  /**
   * Ensure the binary exists at an executable path on the real filesystem.
   */
  private async ensureExecutableBinaryPath(): Promise<string> {
    const bundledBinaryPath = this.getBundledBinaryPath();

    if (!fs.existsSync(bundledBinaryPath)) {
      throw new Error(
        `go2rtc binary not found at ${bundledBinaryPath}. Run "npm run download:go2rtc" to download binaries.`
      );
    }

    if (!this.environmentService.isPackaged()) {
      return bundledBinaryPath;
    }

    return this.extractBundledBinary(bundledBinaryPath);
  }

  /**
   * Extract the bundled binary from the pkg snapshot to a writable runtime path.
   */
  private async extractBundledBinary(bundledBinaryPath: string): Promise<string> {
    const runtimeBinaryPath = this.getRuntimeBinaryPath();
    const runtimeDir = path.dirname(runtimeBinaryPath);

    await fs.promises.mkdir(runtimeDir, { recursive: true });

    if (await this.extractedBinaryMatchesSource(bundledBinaryPath, runtimeBinaryPath)) {
      return runtimeBinaryPath;
    }

    const temporaryPath = `${runtimeBinaryPath}.tmp-${process.pid}`;

    try {
      await pipeline(
        fs.createReadStream(bundledBinaryPath),
        fs.createWriteStream(temporaryPath)
      );

      if (process.platform !== 'win32') {
        await fs.promises.chmod(temporaryPath, 0o755);
      }

      if (fs.existsSync(runtimeBinaryPath)) {
        await fs.promises.rm(runtimeBinaryPath, { force: true });
      }

      await fs.promises.rename(temporaryPath, runtimeBinaryPath);
      console.log(`[Go2rtcBinaryManager] Extracted binary: ${runtimeBinaryPath}`);
    } finally {
      if (fs.existsSync(temporaryPath)) {
        await fs.promises.rm(temporaryPath, { force: true });
      }
    }

    return runtimeBinaryPath;
  }

  /**
   * Ensure the fixed go2rtc ports are free before spawning a new instance.
   */
  private async assertRequiredPortsAvailable(): Promise<void> {
    const requiredPorts = [
      { port: this.apiPort, label: 'go2rtc API' },
      { port: this.webrtcPort, label: 'go2rtc WebRTC' },
    ];

    for (const { port, label } of requiredPorts) {
      const isAvailable = await this.isPortAvailable(port);
      if (!isAvailable) {
        throw new Error(
          `Port ${port} required for ${label} is already in use. Stop the other FlashForgeWebUI/go2rtc instance and try again.`
        );
      }
    }
  }

  /**
   * Check whether a TCP port is currently available on the local machine.
   */
  private async isPortAvailable(port: number): Promise<boolean> {
    const hosts = ['127.0.0.1', '::1'];

    for (const host of hosts) {
      const inUse = await this.isPortInUseOnHost(port, host);
      if (inUse) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check whether a port is already accepting local connections on a specific host.
   */
  private async isPortInUseOnHost(port: number, host: string): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ port, host });

      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.once('error', (error: NodeJS.ErrnoException) => {
        socket.destroy();

        if (
          error.code === 'ECONNREFUSED' ||
          error.code === 'EHOSTUNREACH' ||
          error.code === 'ENETUNREACH' ||
          error.code === 'EADDRNOTAVAIL' ||
          error.code === 'EINVAL'
        ) {
          resolve(false);
          return;
        }

        resolve(true);
      });
    });
  }

  /**
   * Give go2rtc a brief moment to emit any delayed bind errors before marking startup successful.
   */
  private async assertNoStartupBindErrors(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (this.startupListenErrors.length > 0) {
      throw new Error(
        `go2rtc failed to bind required ports: ${this.startupListenErrors.join(' | ')}`
      );
    }
  }

  /**
   * Compare the existing extracted binary against the bundled source.
   */
  private async extractedBinaryMatchesSource(
    bundledBinaryPath: string,
    runtimeBinaryPath: string
  ): Promise<boolean> {
    try {
      const [bundledStats, runtimeStats] = await Promise.all([
        fs.promises.stat(bundledBinaryPath),
        fs.promises.stat(runtimeBinaryPath),
      ]);
      return bundledStats.size === runtimeStats.size;
    } catch {
      return false;
    }
  }

  /**
   * Generate and write the go2rtc configuration file.
   */
  private async generateConfig(): Promise<string> {
    const config: Go2rtcConfig = {
      api: {
        listen: `:${this.apiPort}`,
      },
      webrtc: {
        listen: `:${this.webrtcPort}/tcp`,
        ice_servers: [{ urls: ['stun:stun.l.google.com:19302'] }],
      },
      streams: {},
      log: {
        format: 'text',
        level: 'info',
      },
    };

    const runtimeDir = path.join(this.environmentService.getDataPath(), 'runtime', 'go2rtc');
    await fs.promises.mkdir(runtimeDir, { recursive: true });

    const configPath = path.join(runtimeDir, 'go2rtc.yaml');
    const configContent = this.serializeConfig(config);

    await fs.promises.writeFile(configPath, configContent, 'utf8');
    console.log(`[Go2rtcBinaryManager] Generated config: ${configPath}`);

    return configPath;
  }

  /**
   * Serialize config object to YAML format.
   */
  private serializeConfig(config: Go2rtcConfig): string {
    const lines: string[] = [];

    if (config.api) {
      lines.push('api:');
      if (config.api.listen) {
        lines.push(`  listen: "${config.api.listen}"`);
      }
      lines.push('  origin: "*"');
    }

    if (config.webrtc) {
      lines.push('');
      lines.push('webrtc:');
      if (config.webrtc.listen) {
        lines.push(`  listen: "${config.webrtc.listen}"`);
      }
      if (config.webrtc.ice_servers && config.webrtc.ice_servers.length > 0) {
        lines.push('  ice_servers:');
        for (const server of config.webrtc.ice_servers) {
          lines.push(`    - urls: [${server.urls.map((url) => `"${url}"`).join(', ')}]`);
        }
      }
    }

    lines.push('');
    lines.push('streams:');

    if (config.log) {
      lines.push('');
      lines.push('log:');
      if (config.log.format) {
        lines.push(`  format: "${config.log.format}"`);
      }
      if (config.log.level) {
        lines.push(`  level: "${config.log.level}"`);
      }
    }

    return `${lines.join('\n')}\n`;
  }

  /**
   * Wait for go2rtc API to be ready.
   */
  private async waitForReady(timeoutMs = 10000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (this.startupListenErrors.length > 0) {
        throw new Error(
          `go2rtc failed to bind required ports: ${this.startupListenErrors.join(' | ')}`
        );
      }

      if (!this.isRunning()) {
        throw new Error('go2rtc process exited during startup');
      }

      try {
        const response = await fetch(`${this.getApiUrl()}/api`);
        if (response.ok) {
          return;
        }
      } catch {
        // Continue waiting for the API to come online.
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`go2rtc failed to start within ${timeoutMs}ms`);
  }
}

/**
 * Get the singleton Go2rtcBinaryManager instance.
 */
export function getGo2rtcBinaryManager(): Go2rtcBinaryManager {
  return Go2rtcBinaryManager.getInstance();
}
