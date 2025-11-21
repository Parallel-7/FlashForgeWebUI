/**
 * @fileoverview Data directory setup and initialization utilities
 *
 * Ensures the data directory exists and is properly initialized before
 * the application starts. The data directory stores:
 * - config.json: Application configuration
 * - printer_details.json: Saved printer details and last connected info
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Get the data directory path
 * Can be overridden by DATA_DIR environment variable
 *
 * @returns Absolute path to data directory
 */
export function getDataPath(): string {
  const customPath = process.env.DATA_DIR;
  if (customPath) {
    return path.resolve(customPath);
  }
  return path.join(process.cwd(), 'data');
}

/**
 * Ensure the data directory exists
 * Creates it if it doesn't exist
 *
 * @returns The data directory path
 */
export function ensureDataDirectory(): string {
  const dataPath = getDataPath();

  if (!fs.existsSync(dataPath)) {
    console.log(`Creating data directory: ${dataPath}`);
    fs.mkdirSync(dataPath, { recursive: true });
  }

  return dataPath;
}

/**
 * Check if the data directory is writable
 *
 * @returns True if writable, false otherwise
 */
export function isDataDirectoryWritable(): boolean {
  try {
    const dataPath = ensureDataDirectory();
    const testFile = path.join(dataPath, '.write-test');

    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);

    return true;
  } catch (error) {
    console.error('Data directory is not writable:', error);
    return false;
  }
}

/**
 * Initialize the data directory on application startup
 * Ensures directory exists and is writable
 *
 * @throws Error if data directory cannot be created or is not writable
 */
export function initializeDataDirectory(): void {
  const dataPath = ensureDataDirectory();

  if (!isDataDirectoryWritable()) {
    throw new Error(`Data directory is not writable: ${dataPath}`);
  }

  console.log(`Data directory initialized: ${dataPath}`);
}
