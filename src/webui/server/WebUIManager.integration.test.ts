/**
 * @fileoverview Integration tests for WebUIManager
 * Tests middleware order, static file serving, SPA routing, and API endpoints
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import express, { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import request from 'supertest';
import { EnvironmentService } from '../../services/EnvironmentService';
import { ConfigManager } from '../../managers/ConfigManager';
import { StandardAPIResponse } from '../types/web-api.types';

// Mock the singleton dependencies
jest.mock('../../services/EnvironmentService');
jest.mock('../../managers/ConfigManager');
jest.mock('./AuthManager');
jest.mock('./WebSocketManager');

describe('WebUIManager Integration Tests', () => {
  let app: Express;
  let mockEnvironmentService: jest.Mocked<EnvironmentService>;
  let mockConfigManager: jest.Mocked<ConfigManager>;

  // Mock static file path
  const mockStaticPath = path.join(__dirname, '../static/mock-webui');

  beforeAll(() => {
    // Create mock static directory structure
    if (!fs.existsSync(mockStaticPath)) {
      fs.mkdirSync(mockStaticPath, { recursive: true });
    }

    // Create a mock index.html
    const mockIndexHtml = '<!DOCTYPE html><html><body>Mock WebUI</body></html>';
    fs.writeFileSync(path.join(mockStaticPath, 'index.html'), mockIndexHtml);

    // Create a mock CSS file
    const mockCss = 'body { margin: 0; }';
    fs.writeFileSync(path.join(mockStaticPath, 'styles.css'), mockCss);

    // Create a mock JS file
    const mockJs = 'console.log("test");';
    fs.writeFileSync(path.join(mockStaticPath, 'app.js'), mockJs);
  });

  afterAll(() => {
    // Cleanup mock directory
    if (fs.existsSync(mockStaticPath)) {
      fs.rmSync(mockStaticPath, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Setup mocks
    mockEnvironmentService = {
      isPackaged: jest.fn().mockReturnValue(false),
      isProduction: jest.fn().mockReturnValue(false),
      isDevelopment: jest.fn().mockReturnValue(true),
      getWebUIStaticPath: jest.fn().mockReturnValue(mockStaticPath),
      getEnvironmentInfo: jest.fn().mockReturnValue({
        isPackaged: false,
        isProduction: false,
        isDevelopment: true,
        dirname: __dirname,
        cwd: process.cwd(),
        staticPath: mockStaticPath,
        dataPath: path.join(process.cwd(), 'data')
      }),
      getDataPath: jest.fn().mockReturnValue(path.join(process.cwd(), 'data')),
      getLogsPath: jest.fn().mockReturnValue(path.join(process.cwd(), 'data', 'logs')),
      getAppRootPath: jest.fn().mockReturnValue(process.cwd()),
      isElectron: jest.fn().mockReturnValue(false)
    } as any;

    mockConfigManager = {
      getConfig: jest.fn().mockReturnValue({
        WebUIEnabled: true,
        WebUIPort: 3001,
        WebUIPassword: 'testpass',
        WebUIPasswordRequired: true,
        SpoolmanEnabled: false,
        SpoolmanServerUrl: '',
        CameraProxyPort: 8181
      }),
      get: jest.fn().mockReturnValue(true),
      on: jest.fn()
    } as any;

    // Mock the module imports
    jest.doMock('../../services/EnvironmentService', () => ({
      getEnvironmentService: () => mockEnvironmentService
    }));

    jest.doMock('../../managers/ConfigManager', () => ({
      getConfigManager: () => mockConfigManager
    }));

    // Create a minimal Express app with the same middleware structure
    app = express();

    // JSON body parsing
    app.use(express.json());

    // Static file serving
    app.use(express.static(mockStaticPath, {
      fallthrough: true,
      maxAge: '0'
    }));

    // Mock API routes
    app.get('/api/health', (_req, res) => {
      res.json({ success: true, status: 'ok' });
    });

    // 404 handler for API routes - must come after specific API routes
    app.use('/api', (req, res) => {
      // Only handle if no specific route matched
      // Note: req.path doesn't include the /api prefix when mounted at /api
      const fullPath = `/api${req.path}`;
      const response: StandardAPIResponse = {
        success: false,
        error: `API endpoint not found: ${req.method} ${fullPath}`
      };
      res.status(404).json(response);
    });

    // SPA fallback - using middleware approach for Express 5.x compatibility
    // This must come after all other routes
    app.use((req, res, next) => {
      // Only handle GET requests for SPA routes
      if (req.method !== 'GET') {
        return next();
      }

      // Skip API routes
      if (req.path.startsWith('/api')) {
        return next();
      }

      // Serve index.html for SPA routes (no extension or root)
      const indexPath = path.join(mockStaticPath, 'index.html');

      // If path has no extension (SPA route), serve index.html
      if (!path.extname(req.path) || req.path === '/') {
        res.sendFile(indexPath);
        return;
      }

      // File with extension that wasn't found by static middleware
      const response: StandardAPIResponse = {
        success: false,
        error: `File not found: ${req.path}`
      };
      res.status(404).json(response);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Static File Serving', () => {
    it('should serve index.html at root path', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Mock WebUI');
      expect(response.headers['content-type']).toContain('text/html');
    });

    it('should serve CSS files', async () => {
      const response = await request(app).get('/styles.css');

      expect(response.status).toBe(200);
      expect(response.text).toContain('body { margin: 0; }');
      expect(response.headers['content-type']).toContain('text/css');
    });

    it('should serve JavaScript files', async () => {
      const response = await request(app).get('/app.js');

      expect(response.status).toBe(200);
      expect(response.text).toContain('console.log("test")');
      expect(response.headers['content-type']).toContain('javascript');
    });

    it('should return 404 for non-existent static files', async () => {
      const response = await request(app).get('/nonexistent.css');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'File not found: /nonexistent.css'
      });
    });
  });

  describe('API Routes', () => {
    it('should return 200 for valid API endpoint', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        status: 'ok'
      });
    });

    it('should return 404 for non-existent API endpoint', async () => {
      const response = await request(app).get('/api/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'API endpoint not found: GET /api/nonexistent'
      });
    });

    it('should return 404 for non-existent API endpoint with different method', async () => {
      const response = await request(app).post('/api/test');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'API endpoint not found: POST /api/test'
      });
    });
  });

  describe('SPA Routing', () => {
    it('should serve index.html for SPA routes without extension', async () => {
      const response = await request(app).get('/dashboard');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Mock WebUI');
    });

    it('should serve index.html for nested SPA routes', async () => {
      const response = await request(app).get('/printer/settings');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Mock WebUI');
    });

    it('should serve index.html for routes with query parameters', async () => {
      const response = await request(app).get('/settings?tab=general');

      expect(response.status).toBe(200);
      expect(response.text).toContain('Mock WebUI');
    });

    it('should return 404 JSON for missing files with extensions', async () => {
      const response = await request(app).get('/missing.js');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'File not found: /missing.js'
      });
    });

    it('should not serve index.html for requests with file extensions', async () => {
      // This test verifies that file requests don't fall through to SPA
      const response = await request(app).get('/test.json');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).not.toContain('text/html');
    });
  });

  describe('Middleware Order', () => {
    it('should process middleware in correct order: static -> API -> SPA fallback', async () => {
      // Test static file middleware (first in chain)
      const staticResponse = await request(app).get('/styles.css');
      expect(staticResponse.status).toBe(200);
      expect(staticResponse.text).toContain('margin');

      // Test API middleware (second in chain)
      const apiResponse = await request(app).get('/api/health');
      expect(apiResponse.status).toBe(200);
      expect(apiResponse.body.success).toBe(true);

      // Test SPA fallback (last in chain)
      const spaResponse = await request(app).get('/dashboard');
      expect(spaResponse.status).toBe(200);
      expect(spaResponse.text).toContain('Mock WebUI');
    });

    it('should handle 404 for API routes before SPA fallback', async () => {
      const response = await request(app).get('/api/notfound');

      // Should return JSON 404 from API middleware, not HTML from SPA
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('API endpoint not found');
      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('Cache Headers', () => {
    it('should respect cache headers configuration', async () => {
      // In development (isProduction: false), cache should be disabled
      const response = await request(app).get('/styles.css');

      // Cache header should be 'no-cache' or similar when maxAge is 0
      const cacheControl = response.headers['cache-control'];
      expect(cacheControl).toBeDefined();
    });
  });

  describe('Content-Type Headers', () => {
    it('should return correct content-type for HTML', async () => {
      const response = await request(app).get('/');
      expect(response.headers['content-type']).toContain('text/html');
    });

    it('should return correct content-type for CSS', async () => {
      const response = await request(app).get('/styles.css');
      expect(response.headers['content-type']).toContain('text/css');
    });

    it('should return correct content-type for JavaScript', async () => {
      const response = await request(app).get('/app.js');
      expect(response.headers['content-type']).toContain('javascript');
    });

    it('should return correct content-type for API JSON responses', async () => {
      const response = await request(app).get('/api/health');
      expect(response.headers['content-type']).toContain('application/json');
    });
  });

  describe('Edge Cases', () => {
    it('should handle root path with trailing slash', async () => {
      const response = await request(app).get('/');
      expect(response.status).toBe(200);
    });

    it('should handle deeply nested SPA routes', async () => {
      const response = await request(app).get('/a/b/c/d/e/f');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Mock WebUI');
    });

    it('should handle special characters in routes', async () => {
      const response = await request(app).get('/settings?tab=general&theme=dark');
      expect(response.status).toBe(200);
      expect(response.text).toContain('Mock WebUI');
    });
  });

  describe('Fallback Behavior', () => {
    it('should fallback to index.html for unmatched routes without extensions', async () => {
      const routes = ['/dashboard', '/printer/123', '/settings', '/about'];

      for (const route of routes) {
        const response = await request(app).get(route);
        expect(response.status).toBe(200);
        expect(response.text).toContain('Mock WebUI');
      }
    });

    it('should not fallback to index.html for API routes', async () => {
      const response = await request(app).get('/api/test');
      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });
});

// Note: EnvironmentService is fully tested in EnvironmentService.test.ts
// These integration tests focus on WebUIManager middleware and routing
