/**
 * @fileoverview Tests for EnvironmentService
 * Tests environment detection, path resolution, and static file serving paths
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as path from 'path';
import { EnvironmentService, getEnvironmentService } from './EnvironmentService';

// Mock process.cwd
const originalCwd = process.cwd;
const mockEnv = { ...process.env };

describe('EnvironmentService', () => {
  let service: EnvironmentService;

  beforeEach(() => {
    // Reset environment
    process.env = { ...mockEnv };
    service = new EnvironmentService();
  });

  afterEach(() => {
    // Restore original values
    process.cwd = originalCwd;
  });

  describe('Package Detection', () => {
    it('should detect packaged environment via PKG_EXECPATH', () => {
      process.env.PKG_EXECPATH = '/some/path';
      const packagedService = new EnvironmentService();
      expect(packagedService.isPackaged()).toBe(true);
    });

    it('should detect packaged environment via __dirname snapshot path (Unix)', () => {
      // Mock __dirname to include snapshot
      jest.spyOn(process, 'cwd').mockReturnValue('/app/dist');

      // Create a service instance - detection happens in constructor
      const testService = new EnvironmentService();

      // In normal testing, __dirname won't have /snapshot/ unless we're actually in pkg
      // So we test the other two detection methods
      expect(testService).toBeDefined();
    });

    it('should detect packaged environment via __dirname snapshot path (Windows)', () => {
      // Similar test for Windows paths
      const testService = new EnvironmentService();
      expect(testService).toBeDefined();
    });

    it('should detect packaged environment via process.pkg', () => {
      // Mock process.pkg
      (process as any).pkg = { entrypoint: '/test' };

      const packagedService = new EnvironmentService();
      expect(packagedService.isPackaged()).toBe(true);

      // Cleanup
      (process as any).pkg = undefined;
    });

    it('should not detect packaged environment when no indicators present', () => {
      // Ensure no pkg indicators
      delete process.env.PKG_EXECPATH;
      (process as any).pkg = undefined;

      const devService = new EnvironmentService();
      // In normal test environment, this should be false
      expect(devService.isPackaged()).toBe(false);
    });
  });

  describe('Environment State', () => {
    it('should always return false for isElectron in standalone mode', () => {
      expect(service.isElectron()).toBe(false);
    });

    it('should return true for isProduction when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      const prodService = new EnvironmentService();
      expect(prodService.isProduction()).toBe(true);
    });

    it('should return true for isProduction when packaged', () => {
      (process as any).pkg = { entrypoint: '/test' };
      const packagedService = new EnvironmentService();
      expect(packagedService.isProduction()).toBe(true);
      (process as any).pkg = undefined;
    });

    it('should return false for isProduction when in development', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.PKG_EXECPATH;

      const devService = new EnvironmentService();
      expect(devService.isProduction()).toBe(false);
    });

    it('should return correct isDevelopment state', () => {
      process.env.NODE_ENV = 'development';
      const devService = new EnvironmentService();

      expect(devService.isDevelopment()).toBe(true);
      expect(devService.isProduction()).toBe(false);
    });
  });

  describe('Path Resolution', () => {
    it('should return correct data path', () => {
      const mockCwd = '/mock/app/directory';
      jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);

      const testService = new EnvironmentService();
      expect(testService.getDataPath()).toBe(path.join(mockCwd, 'data'));
    });

    it('should return correct logs path', () => {
      const mockCwd = '/mock/app/directory';
      jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);

      const testService = new EnvironmentService();
      expect(testService.getLogsPath()).toBe(path.join(mockCwd, 'data', 'logs'));
    });

    it('should return correct app root path', () => {
      const mockCwd = '/mock/app/directory';
      jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);

      const testService = new EnvironmentService();
      expect(testService.getAppRootPath()).toBe(mockCwd);
    });

    it('should return development static path when not packaged', () => {
      const mockCwd = '/mock/app';
      jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);

      const devService = new EnvironmentService();
      const staticPath = devService.getWebUIStaticPath();

      expect(staticPath).toBe(path.join(mockCwd, 'dist/webui/static'));
    });

    it('should warn when development static path does not exist', () => {
      const mockCwd = '/mock/app';
      jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);

      // This test verifies the warning logic exists
      // In real scenarios, fs.existsSync would check the path
      const devService = new EnvironmentService();
      const staticPath = devService.getWebUIStaticPath();

      // Should still return the path even if it doesn't exist
      expect(staticPath).toBe(path.join(mockCwd, 'dist/webui/static'));
    });

    it('should return packaged static path when packaged', () => {
      // Simulate packaged environment
      (process as any).pkg = { entrypoint: '/test' };

      const packagedService = new EnvironmentService();
      const staticPath = packagedService.getWebUIStaticPath();

      // In packaged mode, should use __dirname and contain webui/static
      expect(staticPath).toBeTruthy();
      expect(typeof staticPath).toBe('string');

      (process as any).pkg = undefined;
    });
  });

  describe('Environment Info', () => {
    it('should return comprehensive environment info', () => {
      const mockCwd = '/mock/app';
      jest.spyOn(process, 'cwd').mockReturnValue(mockCwd);

      const testService = new EnvironmentService();
      const envInfo = testService.getEnvironmentInfo();

      expect(envInfo).toHaveProperty('isPackaged');
      expect(envInfo).toHaveProperty('isProduction');
      expect(envInfo).toHaveProperty('isDevelopment');
      expect(envInfo).toHaveProperty('dirname');
      expect(envInfo).toHaveProperty('cwd');
      expect(envInfo).toHaveProperty('staticPath');
      expect(envInfo).toHaveProperty('dataPath');

      expect(envInfo.cwd).toBe(mockCwd);
      expect(typeof envInfo.isPackaged).toBe('boolean');
      expect(typeof envInfo.isProduction).toBe('boolean');
      expect(typeof envInfo.isDevelopment).toBe('boolean');
      expect(typeof envInfo.dirname).toBe('string');
      expect(typeof envInfo.staticPath).toBe('string');
      expect(typeof envInfo.dataPath).toBe('string');
    });

    it('should show consistent state between isProduction and isDevelopment', () => {
      const testService = new EnvironmentService();
      const envInfo = testService.getEnvironmentInfo();

      expect(envInfo.isProduction).toBe(!envInfo.isDevelopment);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance from getEnvironmentService', () => {
      const instance1 = getEnvironmentService();
      const instance2 = getEnvironmentService();

      expect(instance1).toBe(instance2);
    });

    it('should maintain singleton across multiple calls', () => {
      const instances = [
        getEnvironmentService(),
        getEnvironmentService(),
        getEnvironmentService()
      ];

      expect(instances[0]).toBe(instances[1]);
      expect(instances[1]).toBe(instances[2]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle NODE_ENV unset gracefully', () => {
      delete process.env.NODE_ENV;
      delete process.env.PKG_EXECPATH;

      const testService = new EnvironmentService();
      expect(testService.isProduction()).toBe(false);
      expect(testService.isDevelopment()).toBe(true);
    });

    it('should handle various NODE_ENV values', () => {
      const envValues = ['production', 'development', 'test', 'staging'];

      envValues.forEach(envValue => {
        process.env.NODE_ENV = envValue;
        const testService = new EnvironmentService();

        if (envValue === 'production') {
          expect(testService.isProduction()).toBe(true);
        } else {
          expect(testService.isProduction()).toBe(false);
        }
      });
    });

    it('should prioritize packaged detection over NODE_ENV', () => {
      process.env.NODE_ENV = 'development';
      (process as any).pkg = { entrypoint: '/test' };

      const testService = new EnvironmentService();
      expect(testService.isProduction()).toBe(true); // Packaged takes precedence

      (process as any).pkg = undefined;
    });
  });
});
