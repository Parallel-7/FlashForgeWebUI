# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Playwright E2E testing framework with dual configuration:
  - Fixture-based E2E tests (`e2e/`) for fast WebUI validation with a stub HTTP+WebSocket server
  - Emulator-backed E2E tests (`e2e-emulator/`) for full lifecycle testing with `flashforge-emulator-v2` printer emulator
  - Fixture specs: WebUI smoke tests (asset versioning, context switching) and authentication flow (login, token persistence, logout)
  - Emulator specs: direct connection for all 5 printer models, network discovery flow, multi-printer context switching
  - Test helpers: emulator harness, standalone server harness, lifecycle runner, scenario definitions, WebUI page object model
  - `tsconfig.e2e.json` for E2E TypeScript type checking
- Comprehensive npm test scripts for all test suites:
  - `test:e2e`, `test:e2e:smoke`, `test:e2e:auth` for fixture E2E subsets
  - `test:e2e:emulator`, `test:e2e:emulator:direct`, `test:e2e:emulator:discovery`, `test:e2e:emulator:multi` for emulator E2E subsets
  - `test:e2e:all` for all Playwright suites and `test:all` for Jest + Playwright combined
  - `test:e2e:install` for Chromium browser installation
- `@playwright/test` (^1.58.2) as dev dependency for E2E browser automation
- go2rtc-based camera streaming with:
  - bundled platform binaries in `resources/bin/`
  - `scripts/download-go2rtc.cjs` postinstall download flow
  - `Go2rtcService` and `Go2rtcBinaryManager` for stream and process lifecycle management
  - bundled `video-rtc` frontend player for WebRTC, MSE, and MJPEG playback
- Discord webhook notifications for the standalone WebUI with:
  - Global config keys in `config.json`: `DiscordSync`, `WebhookUrl`, `DiscordUpdateIntervalMinutes`
  - Multi-printer periodic status updates using a single shared timer
  - Event-driven notifications for print completion, printer cooled, and idle transitions
  - Status embeds using precise elapsed seconds and firmware ETA when available
- Focused Discord notification service tests covering timer behavior, multi-context sends, and payload formatting
- Backend bundling via `scripts/build-backend.ts` for pkg-compatible CommonJS output from the TypeScript source tree
- Wrapped platform build entrypoints via `scripts/platform-build-wrapper.ts`
- `docs:check` and `docs:check:debug` npm scripts backed by `scripts/check-fileoverview.go`
- Packaged favicon asset for the standalone WebUI

### Changed

- `type-check` script now runs both `type-check:app` and `type-check:e2e` for full TypeScript validation
- Camera streaming migrated from the legacy proxy/RTSP stack to go2rtc-managed per-context streams
- Frontend camera playback now uses the bundled `video-rtc` player instead of the previous streaming path
- Backend build pipeline now bundles `src/index.ts` before pkg packaging, while leaving runtime packages external for compatibility
- Legacy per-printer settings in `config.json` are now treated as stale keys only and stripped on save
- Printer connection and backend selection now use per-printer `forceLegacyMode` instead of the removed global `ForceLegacyAPI`
- Camera configuration resolution now uses only per-printer settings from saved printer details
- Static asset copying now includes the packaged favicon and updated browser assets
- Project documentation was refreshed to match the go2rtc migration, Discord webhook support, and current build tooling

### Removed

- Legacy camera streaming components: `CameraProxyService`, `RtspStreamService`, `PortAllocator`, and old stream type shims
- Legacy global config ownership for `CustomCamera`, `CustomCameraUrl`, `CustomLeds`, `ForceLegacyAPI`, and `CameraProxyPort`

## [1.0.2] - 2026-01-31

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
- **Lint configuration** - Split configuration for backend (CommonJS) and frontend (ES modules) with appropriate tsconfig references
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

[Unreleased]: https://github.com/Parallel-7/FlashForgeWebUI/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/Parallel-7/FlashForgeWebUI/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Parallel-7/FlashForgeWebUI/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Parallel-7/FlashForgeWebUI/releases/tag/v1.0.0
