/**
 * @fileoverview GCode command types and result structures
 */

/**
 * GCode command execution result
 */
export interface GCodeCommandResult {
  readonly success: boolean;
  readonly output?: string;
  readonly error?: string;
}
