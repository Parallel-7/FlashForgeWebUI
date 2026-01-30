/**
 * @fileoverview Timeout utilities for graceful shutdown operations.
 *
 * Provides timeout wrappers and deadline enforcement for async operations
 * during application shutdown. Prevents indefinite hangs from unresponsive
 * printers or stuck HTTP connections.
 *
 * Key exports:
 * - TimeoutError: Custom error class for timeout failures
 * - withTimeout(): Promise wrapper with timeout enforcement
 * - createHardDeadline(): Sets absolute maximum shutdown time with process.exit(1)
 */

/**
 * Custom error thrown when an operation exceeds its timeout
 */
export class TimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Timeout: ${operation} exceeded ${timeoutMs}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Wrap a promise with timeout enforcement
 *
 * Races the provided promise against a timeout. If the timeout fires first,
 * the promise is rejected with TimeoutError. Properly cleans up timeout
 * handle to prevent memory leaks.
 *
 * @template T - Promise result type
 * @param promise - The promise to wrap with timeout
 * @param options - Timeout configuration
 * @returns Promise that rejects on timeout
 *
 * @example
 * ```typescript
 * await withTimeout(
 *   disconnectContext(contextId),
 *   { timeoutMs: 5000, operation: 'disconnectContext' }
 * );
 * ```
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  options: { timeoutMs: number; operation: string; silent?: boolean }
): Promise<T> {
  const { timeoutMs, operation, silent = false } = options;

  let timeoutHandle: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      if (!silent) {
        console.warn(`[Shutdown] Timeout: ${operation} (${timeoutMs}ms)`);
      }
      reject(new TimeoutError(operation, timeoutMs));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);

    // Clear timeout if promise won the race
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    return result;
  } catch (error) {
    // Ensure timeout is cleared even on error
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    throw error;
  }
}

/**
 * Create a hard deadline that forces process termination
 *
 * Sets a timeout that calls process.exit(1) when elapsed. This is the
 * ultimate fallback to prevent the application from hanging indefinitely
 * during shutdown. Returns the timeout handle so the deadline can be
 * cleared if shutdown completes successfully.
 *
 * @param timeoutMs - Deadline duration in milliseconds
 * @returns NodeJS.Timeout handle for deadline cancellation
 *
 * @example
 * ```typescript
 * const deadline = createHardDeadline(10000);
 * try {
 *   await shutdown();
 *   clearTimeout(deadline); // Shutdown succeeded, cancel deadline
 * } catch (error) {
 *   // Error logged, deadline will fire if exceeded
 * }
 * ```
 */
export function createHardDeadline(timeoutMs: number): NodeJS.Timeout {
  return setTimeout(() => {
    console.error(`[Shutdown] HARD DEADLINE (${timeoutMs}ms) exceeded - forcing exit`);
    process.exit(1);
  }, timeoutMs);
}
