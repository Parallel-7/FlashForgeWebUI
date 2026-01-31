# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Comprehensive test suite with 118 passing tests covering core functionality:
  - EnvironmentService: Package detection, path resolution, environment state (23 tests)
  - ConfigManager: Configuration loading, updates, validation, events (23 tests)
  - Error utilities: All error codes, factories, handlers, serialization (68 tests)
  - WebUIManager integration: Static files, API routes, SPA routing, middleware (24 tests)
- End-to-end testing workflow for all binary platforms (Windows, macOS, Linux x64/ARM64/ARMv7)
- Production-ready shutdown timeout system with three-tier timeout strategy:
  - Hard deadline: 10s absolute maximum
  - Per-printer disconnect: 5s timeout with forced cleanup
  - WebUI server stop: 3s timeout with connection force-close
  - Parallel printer disconnection via `Promise.allSettled()`
- `ShutdownTimeout` utility module (`src/utils/ShutdownTimeout.ts`) with:
  - `TimeoutError` class for timeout failures
  - `withTimeout()` wrapper for promises with timeout enforcement
  - `createHardDeadline()` for absolute maximum shutdown time
- Test scripts: `npm test`, `npm run test:watch`, `npm run test:coverage`, `npm run test:verbose`
- Express.js skill documentation for Claude Code (4,574 lines of reference material)

### Fixed

- **Production-ready shutdown system** to prevent indefinite hangs during graceful shutdown:
  - Single printer: < 5s shutdown
  - Multiple printers: < 10s (parallelized)
  - Hard deadline: Always exits within 10s maximum
  - Preserved double Ctrl+C for immediate force exit
- **Express 5 wildcard route compatibility** - Changed unnamed wildcards to named wildcards (`/*splat`)
- **Local build scripts** - Corrected binary name from `yao-pkg` to `pkg`
- **Missing index.html error handling** - Returns proper 500 server error with debugging context instead of misleading 404
- **ESLint configuration** - Split configuration for backend (CommonJS) and frontend (ES modules) with appropriate tsconfig references
- **404 error reporting** - Fixed catch-all route to use `req.originalUrl` instead of `req.path`
- **Windows E2E process management**:
  - Use `taskkill /F /IM` and `tasklist /FI` for reliable process matching
  - Implemented cmd.exe wrapper with `-WindowStyle Hidden` for proper process detachment
  - Use `127.0.0.1` instead of `localhost` for health checks
  - Fixed PowerShell reserved variable `$pid` renamed to `$serverPid`
- **Platform-specific test failures**:
  - Fixed macOS stat command format (`-f%z` not `-f%`)
  - Skip ARMv7 execution tests on x64 runners (cross-compiled)
  - Fixed API test to check for `authRequired` field instead of `authenticated`
- **Windows readline import** - Replaced conditional `require()` with proper ES6 top-level import
- **E2E test triggers** - Updated workflow to run on all branches and PRs, not just main
- **Static file serving in packaged binaries** - Assets now properly embedded and served
- **Platform selection troubleshooting documentation**

### Changed

- **Shutdown logic** - Replaced sequential printer disconnection with parallel `Promise.allSettled()`
- **ConnectionFlowManager.disconnectContext()** - Added 5s configurable timeout with forced cleanup on timeout
- **WebUIManager.stop()** - Added 3s configurable timeout with `closeAllConnections()` force-close on timeout
- **Documentation - SPA fallback purpose** - Clarified that fallback supports page refreshes and direct URL access, not client-side routing
- **Documentation - Production-ready status** - Updated CLAUDE.md project status from "not fully tested" to "production-ready"
- **Documentation - README improvements**:
  - Added Usage section explaining WebUI access (localhost:3000)
  - Documented default password (`changeme`) and how to change it
  - Replaced JSON config block with clear settings table
  - Added descriptions for all configuration options
- **Build configuration** - Updated for proper asset packaging
- **tsconfig.json** - Added test files to include array

### Removed

- `TEST_SUMMARY.md` documentation file - Test information available in CI/CD workflows and test files
- Unnecessary E2E test workflow comments
- FlashForgeUI-Electron reference from Related Projects (internal reference)
- Redundant `withTimeout` wrapper from shutdown disconnect calls (now handled internally by ConnectionFlowManager)

### Security

- No security vulnerabilities addressed in this release

## [1.0.1] - 2026-01-20

### Added

- Multi-printer context switching
- Spoolman integration for filament tracking
- Platform-specific binary builds (Linux ARM, Linux x64, Windows, macOS)

## [1.0.0] - 2026-01-15

### Added

- Initial release of FlashForgeWebUI
- Web-based interface for controlling and monitoring FlashForge 3D printers
- Multi-printer support with isolated contexts
- Camera proxy service for MJPEG streaming
- RTSP stream management
- Temperature monitoring with anomaly detection
- Print state monitoring with progress tracking
- WebSocket-based real-time communication
- Optional password authentication
- Configuration persistence in `data/config.json`

[Unreleased]: https://github.com/Parallel-7/FlashForgeWebUI/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/Parallel-7/FlashForgeWebUI/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Parallel-7/FlashForgeWebUI/releases/tag/v1.0.0
