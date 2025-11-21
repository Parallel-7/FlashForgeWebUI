/**
 * @fileoverview Logging utilities for verbose debug output
 *
 * Provides centralized logging with namespace support for debugging
 */

/**
 * Log verbose debug message with namespace
 */
export function logVerbose(namespace: string, message: string, ...args: unknown[]): void {
  if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
    console.debug(`[${namespace}]`, message, ...args);
  }
}

/**
 * Log info message with namespace
 */
export function logInfo(namespace: string, message: string, ...args: unknown[]): void {
  console.info(`[${namespace}]`, message, ...args);
}

/**
 * Log warning message with namespace
 */
export function logWarning(namespace: string, message: string, ...args: unknown[]): void {
  console.warn(`[${namespace}]`, message, ...args);
}

/**
 * Log error message with namespace
 */
export function logError(namespace: string, message: string, ...args: unknown[]): void {
  console.error(`[${namespace}]`, message, ...args);
}
