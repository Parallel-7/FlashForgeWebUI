/**
 * @fileoverview Jest setup hooks for node-side test runs.
 *
 * Installs shared console mocking and post-test cleanup before each Jest suite.
 */

import { afterEach, jest } from '@jest/globals';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Keep error logging for debugging test failures
  error: jest.fn(),
  warn: jest.fn(),
  // Silence info/debug logs in tests
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Clean up mocks after each test
afterEach(() => {
  jest.clearAllMocks();
});
