/**
 * @fileoverview Tests for error utilities
 * Tests AppError class, error factory functions, and error handling utilities
 */

import { describe, it, expect, jest } from '@jest/globals';
import { ZodError } from 'zod';
import {
  AppError,
  ErrorCode,
  fromZodError,
  networkError,
  timeoutError,
  printerError,
  backendError,
  fileError,
  isAppError,
  toAppError,
  withErrorHandling,
  createErrorResult,
  logError
} from './error.utils';

describe('ErrorCode', () => {
  it('should have all expected error codes', () => {
    // General errors
    expect(ErrorCode.UNKNOWN).toBe('UNKNOWN');
    expect(ErrorCode.VALIDATION).toBe('VALIDATION');
    expect(ErrorCode.NETWORK).toBe('NETWORK');
    expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');

    // Printer errors
    expect(ErrorCode.PRINTER_NOT_CONNECTED).toBe('PRINTER_NOT_CONNECTED');
    expect(ErrorCode.PRINTER_BUSY).toBe('PRINTER_BUSY');
    expect(ErrorCode.PRINTER_ERROR).toBe('PRINTER_ERROR');
    expect(ErrorCode.PRINTER_COMMUNICATION).toBe('PRINTER_COMMUNICATION');

    // Backend errors
    expect(ErrorCode.BACKEND_NOT_INITIALIZED).toBe('BACKEND_NOT_INITIALIZED');
    expect(ErrorCode.BACKEND_OPERATION_FAILED).toBe('BACKEND_OPERATION_FAILED');
    expect(ErrorCode.BACKEND_UNSUPPORTED).toBe('BACKEND_UNSUPPORTED');

    // File errors
    expect(ErrorCode.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND');
    expect(ErrorCode.FILE_TOO_LARGE).toBe('FILE_TOO_LARGE');
    expect(ErrorCode.FILE_INVALID_FORMAT).toBe('FILE_INVALID_FORMAT');
    expect(ErrorCode.FILE_UPLOAD_FAILED).toBe('FILE_UPLOAD_FAILED');

    // Configuration errors
    expect(ErrorCode.CONFIG_INVALID).toBe('CONFIG_INVALID');
    expect(ErrorCode.CONFIG_SAVE_FAILED).toBe('CONFIG_SAVE_FAILED');
    expect(ErrorCode.CONFIG_LOAD_FAILED).toBe('CONFIG_LOAD_FAILED');

    // IPC errors
    expect(ErrorCode.IPC_CHANNEL_INVALID).toBe('IPC_CHANNEL_INVALID');
    expect(ErrorCode.IPC_TIMEOUT).toBe('IPC_TIMEOUT');
    expect(ErrorCode.IPC_HANDLER_NOT_FOUND).toBe('IPC_HANDLER_NOT_FOUND');
  });
});

describe('AppError', () => {
  it('should create error with message and code', () => {
    const error = new AppError('Test error', ErrorCode.NETWORK);

    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ErrorCode.NETWORK);
    expect(error.name).toBe('AppError');
  });

  it('should create error with context', () => {
    const context = { port: 3000, host: 'localhost' };
    const error = new AppError('Test error', ErrorCode.NETWORK, context);

    expect(error.context).toEqual(context);
    expect(error.context?.port).toBe(3000);
    expect(error.context?.host).toBe('localhost');
  });

  it('should create error with original error', () => {
    const originalError = new Error('Original error');
    const error = new AppError('Wrapped error', ErrorCode.UNKNOWN, undefined, originalError);

    expect(error.originalError).toBe(originalError);
    expect(error.originalError?.message).toBe('Original error');
  });

  it('should have timestamp', () => {
    const before = new Date();
    const error = new AppError('Test error');
    const after = new Date();

    expect(error.timestamp).toBeInstanceOf(Date);
    expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(error.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should maintain stack trace', () => {
    const error = new AppError('Test error');

    expect(error.stack).toBeDefined();
    expect(typeof error.stack).toBe('string');
  });

  describe('toJSON', () => {
    it('should serialize to plain object', () => {
      const context = { test: 'value' };
      const error = new AppError('Test error', ErrorCode.NETWORK, context);

      const json = error.toJSON();

      expect(json).not.toBeInstanceOf(AppError);
      expect(json).toEqual({
        name: 'AppError',
        message: 'Test error',
        code: ErrorCode.NETWORK,
        context: { test: 'value' },
        timestamp: error.timestamp,
        stack: error.stack,
        originalError: undefined
      });
    });

    it('should serialize original error', () => {
      const originalError = new Error('Original');
      const error = new AppError('Test', ErrorCode.UNKNOWN, undefined, originalError);

      const json = error.toJSON();

      expect(json.originalError).toEqual({
        name: 'Error',
        message: 'Original',
        stack: originalError.stack
      });
    });

    it('should handle missing original error', () => {
      const error = new AppError('Test');
      const json = error.toJSON();

      expect(json.originalError).toBeUndefined();
    });
  });

  describe('getUserMessage', () => {
    it('should return user-friendly message for PRINTER_NOT_CONNECTED', () => {
      const error = new AppError('Technical message', ErrorCode.PRINTER_NOT_CONNECTED);
      expect(error.getUserMessage()).toBe('Please connect to a printer first');
    });

    it('should return user-friendly message for PRINTER_BUSY', () => {
      const error = new AppError('Technical message', ErrorCode.PRINTER_BUSY);
      expect(error.getUserMessage()).toBe('Printer is busy. Please wait for the current operation to complete');
    });

    it('should return user-friendly message for PRINTER_ERROR', () => {
      const error = new AppError('Technical message', ErrorCode.PRINTER_ERROR);
      expect(error.getUserMessage()).toBe('Printer reported an error. Please check the printer display');
    });

    it('should return user-friendly message for FILE_NOT_FOUND', () => {
      const error = new AppError('Technical message', ErrorCode.FILE_NOT_FOUND);
      expect(error.getUserMessage()).toBe('File not found. Please check the file path');
    });

    it('should return user-friendly message for NETWORK', () => {
      const error = new AppError('Technical message', ErrorCode.NETWORK);
      expect(error.getUserMessage()).toBe('Network error. Please check your connection');
    });

    it('should return user-friendly message for TIMEOUT', () => {
      const error = new AppError('Technical message', ErrorCode.TIMEOUT);
      expect(error.getUserMessage()).toBe('Operation timed out. Please try again');
    });

    it('should return original message for unknown error codes', () => {
      const error = new AppError('Custom error message', ErrorCode.UNKNOWN);
      expect(error.getUserMessage()).toBe('Custom error message');
    });
  });
});

describe('Error Factory Functions', () => {
  describe('fromZodError', () => {
    it('should create AppError from ZodError', () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['name'],
          message: 'Expected string, received number'
        } as any
      ]);

      const appError = fromZodError(zodError);

      expect(appError).toBeInstanceOf(AppError);
      expect(appError.code).toBe(ErrorCode.VALIDATION);
      expect(appError.message).toBe('Validation failed');
      expect(appError.context).toBeDefined();
      expect(appError.context?.issues).toEqual([
        {
          path: 'name',
          message: 'Expected string, received number',
          code: 'invalid_type'
        }
      ]);
    });

    it('should allow custom error code', () => {
      const zodError = new ZodError([]);
      const appError = fromZodError(zodError, ErrorCode.CONFIG_INVALID);

      expect(appError.code).toBe(ErrorCode.CONFIG_INVALID);
    });
  });

  describe('networkError', () => {
    it('should create network error', () => {
      const error = networkError('Connection failed');

      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(ErrorCode.NETWORK);
      expect(error.message).toBe('Connection failed');
    });

    it('should include context', () => {
      const error = networkError('Connection failed', { host: 'example.com', port: 80 });

      expect(error.context).toEqual({ host: 'example.com', port: 80 });
    });
  });

  describe('timeoutError', () => {
    it('should create timeout error', () => {
      const error = timeoutError('fetchData', 5000);

      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(ErrorCode.TIMEOUT);
      expect(error.message).toBe('Operation timed out after 5000ms');
      expect(error.context).toEqual({ operation: 'fetchData', timeoutMs: 5000 });
    });
  });

  describe('printerError', () => {
    it('should create printer error', () => {
      const error = printerError('Printer offline');

      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(ErrorCode.PRINTER_ERROR);
      expect(error.message).toBe('Printer offline');
    });

    it('should allow custom error code', () => {
      const error = printerError('Not connected', ErrorCode.PRINTER_NOT_CONNECTED);

      expect(error.code).toBe(ErrorCode.PRINTER_NOT_CONNECTED);
    });

    it('should include context', () => {
      const error = printerError('Error', ErrorCode.PRINTER_ERROR, { printerId: '123' });

      expect(error.context).toEqual({ printerId: '123' });
    });
  });

  describe('backendError', () => {
    it('should create backend error', () => {
      const error = backendError('Operation failed', 'getStatus');

      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(ErrorCode.BACKEND_OPERATION_FAILED);
      expect(error.message).toBe('Operation failed');
      expect(error.context).toEqual({ operation: 'getStatus' });
    });

    it('should merge additional context', () => {
      const error = backendError('Failed', 'getStatus', { attempt: 3 });

      expect(error.context).toEqual({ operation: 'getStatus', attempt: 3 });
    });
  });

  describe('fileError', () => {
    it('should create file error', () => {
      const error = fileError('Invalid format', 'test.gcode');

      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(ErrorCode.FILE_INVALID_FORMAT);
      expect(error.message).toBe('Invalid format');
      expect(error.context).toEqual({ fileName: 'test.gcode' });
    });

    it('should allow custom error code', () => {
      const error = fileError('Not found', 'test.gcode', ErrorCode.FILE_NOT_FOUND);

      expect(error.code).toBe(ErrorCode.FILE_NOT_FOUND);
    });
  });
});

describe('Error Handling Utilities', () => {
  describe('isAppError', () => {
    it('should return true for AppError instances', () => {
      const error = new AppError('Test', ErrorCode.NETWORK);
      expect(isAppError(error)).toBe(true);
    });

    it('should return false for regular errors', () => {
      const error = new Error('Test');
      expect(isAppError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isAppError('string')).toBe(false);
      expect(isAppError(null)).toBe(false);
      expect(isAppError(undefined)).toBe(false);
      expect(isAppError({})).toBe(false);
    });
  });

  describe('toAppError', () => {
    it('should return AppError as-is', () => {
      const original = new AppError('Test', ErrorCode.NETWORK);
      const converted = toAppError(original);

      expect(converted).toBe(original);
    });

    it('should convert ZodError to AppError', () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['test'],
          message: 'Test error'
        } as any
      ]);

      const converted = toAppError(zodError);

      expect(converted).toBeInstanceOf(AppError);
      expect(converted.code).toBe(ErrorCode.VALIDATION);
      expect(converted.context?.issues).toBeDefined();
    });

    it('should convert Error to AppError', () => {
      const original = new Error('Test error');
      const converted = toAppError(original);

      expect(converted).toBeInstanceOf(AppError);
      expect(converted.message).toBe('Test error');
      expect(converted.originalError).toBe(original);
    });

    it('should convert string to AppError', () => {
      const converted = toAppError('String error');

      expect(converted).toBeInstanceOf(AppError);
      expect(converted.message).toBe('String error');
    });

    it('should convert unknown value to AppError', () => {
      const converted = toAppError({ custom: 'object' });

      expect(converted).toBeInstanceOf(AppError);
      expect(converted.message).toBe('An unknown error occurred');
      expect(converted.context).toEqual({ error: { custom: 'object' } });
    });

    it('should use default error code', () => {
      const original = new Error('Test');
      const converted = toAppError(original, ErrorCode.TIMEOUT);

      expect(converted.code).toBe(ErrorCode.TIMEOUT);
    });
  });

  describe('withErrorHandling', () => {
    it('should return result when function succeeds', async () => {
      const result = await withErrorHandling(async () => 'success');

      expect(result).toBe('success');
    });

    it('should return null when function throws', async () => {
      const result = await withErrorHandling(async () => {
        throw new Error('Test error');
      });

      expect(result).toBeNull();
    });

    it('should call error handler when function throws', async () => {
      const errorHandler = jest.fn();
      const error = new Error('Test error');

      await withErrorHandling(
        async () => {
          throw error;
        },
        errorHandler
      );

      expect(errorHandler).toHaveBeenCalledWith(expect.any(AppError));
      expect(errorHandler.mock.calls[0][0] as AppError).toBeInstanceOf(AppError);
      expect((errorHandler.mock.calls[0][0] as AppError).originalError).toBe(error);
    });

    it('should log error when no handler provided', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      await withErrorHandling(async () => {
        throw new Error('Test');
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('createErrorResult', () => {
    it('should create error result from AppError', () => {
      const error = new AppError('Technical message', ErrorCode.PRINTER_NOT_CONNECTED);
      const result = createErrorResult(error);

      expect(result).toEqual({
        success: false,
        error: 'Please connect to a printer first'
      });
    });

    it('should create error result from regular error', () => {
      const error = new Error('Test error');
      const result = createErrorResult(error);

      expect(result).toEqual({
        success: false,
        error: 'Test error'
      });
    });

    it('should create error result from string', () => {
      const result = createErrorResult('String error');

      expect(result).toEqual({
        success: false,
        error: 'String error'
      });
    });

    it('should create error result from ZodError', () => {
      const zodError = new ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['test'],
          message: 'Validation failed'
        } as any
      ]);

      const result = createErrorResult(zodError);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Validation failed');
    });
  });

  describe('logError', () => {
    it('should log error with context', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new AppError('Test', ErrorCode.NETWORK, { port: 3000 });
      const additionalContext = { operation: 'connect' };

      logError(error, additionalContext);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error occurred:',
        expect.objectContaining({
          name: 'AppError',
          message: 'Test',
          code: ErrorCode.NETWORK,
          additionalContext: { operation: 'connect' }
        })
      );

      consoleErrorSpy.mockRestore();
    });

    it('should log regular errors', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Regular error');

      logError(error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(consoleErrorSpy.mock.calls[0][1].message).toBe('Regular error');

      consoleErrorSpy.mockRestore();
    });

    it('should work without additional context', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const error = new AppError('Test', ErrorCode.NETWORK);

      logError(error);

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });
});
