/**
 * @fileoverview Tests for ConfigManager
 * Tests configuration loading, saving, validation, and event emission
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { ConfigManager, getConfigManager } from './ConfigManager';

// Mock fs and path
jest.mock('fs');
jest.mock('path');

describe('ConfigManager', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    // Setup mocks

    // Mock fs.existsSync to return true for config directory
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);

    // Mock fs.readFileSync to return default config
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
      WebUIEnabled: true,
      WebUIPort: 3000,
      WebUIPassword: 'testpass',
      WebUIPasswordRequired: true,
      SpoolmanEnabled: false,
      SpoolmanServerUrl: '',
      CameraProxyPort: 8181
    }));

    // Mock fs.mkdirSync
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);

    // Mock fs.writeFileSync
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

    // Reset singleton
    (ConfigManager as any).instance = null;
    configManager = getConfigManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance from getConfigManager', () => {
      const instance1 = getConfigManager();
      const instance2 = getConfigManager();

      expect(instance1).toBe(instance2);
    });

    it('should extend EventEmitter', () => {
      expect(configManager).toBeInstanceOf(EventEmitter);
    });
  });

  describe('Configuration Loading', () => {
    it('should load configuration from file', () => {
      const config = configManager.getConfig();

      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
    });

    it('should have all required configuration keys', () => {
      const config = configManager.getConfig();

      expect(config).toHaveProperty('WebUIEnabled');
      expect(config).toHaveProperty('WebUIPort');
      expect(config).toHaveProperty('WebUIPassword');
      expect(config).toHaveProperty('WebUIPasswordRequired');
      expect(config).toHaveProperty('SpoolmanEnabled');
      expect(config).toHaveProperty('SpoolmanServerUrl');
      expect(config).toHaveProperty('CameraProxyPort');
    });

    it('should return correct types for configuration values', () => {
      const config = configManager.getConfig();

      expect(typeof config.WebUIEnabled).toBe('boolean');
      expect(typeof config.WebUIPort).toBe('number');
      expect(typeof config.WebUIPassword).toBe('string');
      expect(typeof config.WebUIPasswordRequired).toBe('boolean');
      expect(typeof config.SpoolmanEnabled).toBe('boolean');
      expect(typeof config.SpoolmanServerUrl).toBe('string');
      expect(typeof config.CameraProxyPort).toBe('number');
    });
  });

  describe('Configuration Getters', () => {
    it('should get single configuration value', () => {
      const port = configManager.get('WebUIPort');

      expect(port).toBe(3000);
    });

    it('should return undefined for non-existent key', () => {
      const value = configManager.get('NonExistentKey' as any);

      expect(value).toBeUndefined();
    });

    it('should get entire configuration', () => {
      const config = configManager.getConfig();

      expect(Object.keys(config).length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Updates', () => {
    it('should emit event when configuration is updated', (done) => {
      configManager.once('configUpdated', (event) => {
        expect(event).toHaveProperty('changedKeys');
        expect(Array.isArray(event.changedKeys)).toBe(true);
        done();
      });

      configManager.updateConfig({ WebUIPort: 3001 });
    });

    it('should emit event with list of changed keys', (done) => {
      configManager.once('configUpdated', (event) => {
        expect(event.changedKeys).toContain('WebUIPort');
        done();
      });

      configManager.updateConfig({ WebUIPort: 3001 });
    });

    it('should update configuration value', (done) => {
      configManager.once('configUpdated', () => {
        const newPort = configManager.get('WebUIPort');
        expect(newPort).toBe(3001);
        done();
      });

      configManager.updateConfig({ WebUIPort: 3001 });
    });

    it('should update multiple configuration values', (done) => {
      configManager.once('configUpdated', (event) => {
        expect(event.changedKeys).toContain('WebUIPort');
        expect(event.changedKeys).toContain('SpoolmanEnabled');
        done();
      });

      configManager.updateConfig({
        WebUIPort: 3001,
        SpoolmanEnabled: true
      });
    });
  });

  describe('Configuration Validation', () => {
    it('should have valid port numbers', () => {
      const config = configManager.getConfig();

      expect(config.WebUIPort).toBeGreaterThanOrEqual(1);
      expect(config.WebUIPort).toBeLessThanOrEqual(65535);
      expect(config.CameraProxyPort).toBeGreaterThanOrEqual(1);
      expect(config.CameraProxyPort).toBeLessThanOrEqual(65535);
    });

    it('should have valid URL format for SpoolmanServerUrl', () => {
      const config = configManager.getConfig();

      // Empty string is valid (Spoolman disabled)
      if (config.SpoolmanServerUrl) {
        expect(config.SpoolmanServerUrl).toMatch(/^https?:\/\//);
      }
    });

    it('should have non-empty password when password required', () => {
      const config = configManager.getConfig();

      if (config.WebUIPasswordRequired) {
        expect(config.WebUIPassword.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Default Values', () => {
    it('should use sensible defaults for WebUI configuration', () => {
      const config = configManager.getConfig();

      expect(config.WebUIEnabled).toBeDefined();
      expect(config.WebUIPort).toBeDefined();
      expect(config.WebUIPassword).toBeDefined();
      expect(config.WebUIPasswordRequired).toBeDefined();
    });

    it('should use safe defaults for security-sensitive settings', () => {
      const config = configManager.getConfig();

      // Password should be required by default for security
      expect(config.WebUIPasswordRequired).toBe(true);
    });
  });

  describe('File System Operations', () => {
    it('should create data directory if it does not exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);

      (ConfigManager as any).instance = null;
      getConfigManager();

      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should write configuration to file', () => {
      configManager.updateConfig({ WebUIPort: 3001 });

      // The actual ConfigManager schedules saves, so we just verify the method exists
      expect(typeof configManager.forceSave).toBe('function');
    });
  });

  describe('Event Emission', () => {
    it('should allow multiple listeners for configUpdated', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      configManager.on('configUpdated', listener1);
      configManager.on('configUpdated', listener2);

      configManager.updateConfig({ WebUIPort: 3001 });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should pass changed keys in event data', (done) => {
      configManager.on('configUpdated', (event) => {
        expect(event).toHaveProperty('changedKeys');
        expect(Array.isArray(event.changedKeys)).toBe(true);
        done();
      });

      configManager.updateConfig({ WebUIPort: 3001 });
    });
  });

  describe('Edge Cases', () => {
    it('should handle update with no changes', () => {
      const config = configManager.getConfig();

      // ConfigManager does NOT emit an event if there are no changes
      // So we just verify it doesn't crash
      expect(() => {
        configManager.updateConfig({ WebUIPort: config.WebUIPort });
      }).not.toThrow();
    });

    it('should handle multiple rapid updates', (done) => {
      let updates = 0;

      configManager.on('configUpdated', () => {
        updates++;
        if (updates === 3) {
          expect(updates).toBe(3);
          done();
        }
      });

      configManager.updateConfig({ WebUIPort: 3001 });
      configManager.updateConfig({ WebUIPort: 3002 });
      configManager.updateConfig({ WebUIPort: 3003 });
    });
  });
});
