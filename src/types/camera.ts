/**
 * @fileoverview Camera type definitions for camera proxy system
 *
 * Provides type safety for camera configuration, proxy server management,
 * stream URL resolution, and client connection tracking.
 */

/**
 * Camera source types
 */
export type CameraSourceType = 'builtin' | 'custom' | 'none';

/**
 * Camera stream protocol types
 */
export type CameraStreamType = 'mjpeg' | 'rtsp';

/**
 * Camera proxy server configuration
 */
export interface CameraProxyConfig {
  /** Port number for the proxy HTTP server */
  readonly port: number;
  /** Fallback port if primary port is in use */
  readonly fallbackPort: number;
  /** Whether to auto-start the proxy server */
  readonly autoStart: boolean;
  /** Reconnection settings */
  readonly reconnection: {
    /** Enable automatic reconnection */
    readonly enabled: boolean;
    /** Maximum number of reconnection attempts */
    readonly maxRetries: number;
    /** Base delay between retries in milliseconds */
    readonly retryDelay: number;
    /** Use exponential backoff for retries */
    readonly exponentialBackoff: boolean;
  };
}

/**
 * Camera proxy client information
 */
export interface CameraProxyClient {
  /** Unique client ID */
  readonly id: string;
  /** Client connection timestamp */
  readonly connectedAt: Date;
  /** Client remote address */
  readonly remoteAddress: string;
  /** Whether client is still connected */
  readonly isConnected: boolean;
}

/**
 * Camera proxy status
 */
export interface CameraProxyStatus {
  /** Whether proxy server is running */
  readonly isRunning: boolean;
  /** Current proxy server port */
  readonly port: number;
  /** Proxy server URL */
  readonly proxyUrl: string;
  /** Whether connected to camera source */
  readonly isStreaming: boolean;
  /** Current camera source URL */
  readonly sourceUrl: string | null;
  /** Number of connected clients */
  readonly clientCount: number;
  /** List of connected clients */
  readonly clients: readonly CameraProxyClient[];
  /** Last error if any */
  readonly lastError: string | null;
  /** Connection statistics */
  readonly stats: {
    /** Total bytes received from source */
    readonly bytesReceived: number;
    /** Total bytes sent to clients */
    readonly bytesSent: number;
    /** Number of successful connections */
    readonly successfulConnections: number;
    /** Number of failed connections */
    readonly failedConnections: number;
    /** Current retry count */
    readonly currentRetryCount: number;
  };
}

/**
 * Camera proxy events
 */
export type CameraProxyEventType =
  | 'proxy-started'
  | 'proxy-stopped'
  | 'stream-connected'
  | 'stream-disconnected'
  | 'stream-error'
  | 'client-connected'
  | 'client-disconnected'
  | 'retry-attempt'
  | 'port-changed';

/**
 * Camera proxy event data
 */
export interface CameraProxyEvent {
  /** Context ID for the event */
  readonly contextId?: string;
  /** Event type */
  readonly type: CameraProxyEventType;
  /** Event timestamp */
  readonly timestamp: Date;
  /** Event-specific data */
  readonly data?: unknown;
  /** Error message if applicable */
  readonly error?: string;
}
