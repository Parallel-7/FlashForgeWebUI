# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Modern printers are now identified from the USB product ID carried in the UDP discovery broadcast instead of an unauthenticated TCP `M115` probe. The probe was previously skipped only for the HTTP-only Creator 5 series; it is now skipped for every new-API model (5M, 5M Pro, AD5X, Creator 5, Creator 5 Pro), removing a redundant round trip from every modern connect. The same broadcast supplies the serial and name, and `FiveMClient.initialize()` supplies the authoritative capability flags and reachability, so the probe contributed nothing
- The TCP probe remains the fallback for anything without a product ID — genuine legacy printers, and manual connects that selected "Legacy"
- Manual connections now send a product ID hint for every modern model (previously Creator 5 / Creator 5 Pro only), so those connects skip the probe as well
- The manual-connect endpoint now requires a serial number for **all** modern printers, not just the Creator 5 series, since a named model is no longer probed for it. The Creator 5 series keeps its model-specific error message
- The material-station slot-config request schema (`/spoolman/slot-config`) was tightened to the correct rules — a required material name and a strict 6-digit hex color — matching the AD5X / Creator 5 fixed material and color palettes. The previously permissive 3/6/8-digit hex and nullable material (with the `currentMaterial` fallback) are gone, since the slot editor always sends a material resolved from the model's fixed palette

### Fixed

- Raw G-code availability is now reported per printer (`features.gcodeCommands`) and the Home Axes button is disabled on printers that don't support it. HTTP-only printers (Creator 5 series) have no TCP channel for raw G-code, so `~G28` could never have worked there
- `DualAPIBackend` no longer assumes a legacy TCP client exists: `executeGCodeCommand` returns a clear error instead of throwing, and the pause/resume/cancel legacy fallbacks are skipped on HTTP-only backends. Those fallbacks also now report the fallback's own error rather than masking it with the original

## [1.2.0-alpha.2] - 2026-07-05

### Added

- Thumbnail previews in the Recent/Local file dialog: each file now shows a lazily loaded preview image (with a "No Preview" fallback), backed by a persistent per-printer on-disk cache (`data/Thumbnails/{serial}/`) so re-opening the dialog is instant

### Fixed

- TVOC air-quality reading now displays on the filtration card for every printer that reports it (e.g. the Adventurer 5M Pro), instead of only the Creator 5 Pro. The Creator 5 Pro now shows the filtration card with its controls disabled rather than hiding it entirely

## [1.2.0-alpha.1] - 2026-07-04

### Added

- Creator 5 / Creator 5 Pro printer support via the new `Creator5Backend`, including model detection, an HTTP-only connection flow, and material station support
- Multi-tool temperature card for the Creator 5 series showing per-tool, bed, and chamber targets
- Read-only TVOC air-quality display for printers that report it
- `ifs-station` dashboard card — a real IFS Material Station grid (4 slots, material + color swatch) that refreshes from the printer's cached station status
- Manual IFS slot editor with a 14-material dropdown and 24-color swatch grid, pre-seeded from the slot's current state
- "Set from Spoolman" action that snaps a Spoolman spool's material/color to the AD5X fixed palette (CIEDE2000 color matching) before applying it to a slot
- `POST /spoolman/slot-config` route (zod-validated, material-station gated) that calls the library's `configureSlot` (`msConfig_cmd`)
- `ifs-palette` utility (`src/webui/static/shared/ifs-palette.ts`) with nearest-color and nearest-material resolution, plus Jest coverage
- Authenticated camera proxy (`CameraStreamProxy`) that tunnels authenticated WebUI clients to the local go2rtc API at `/api/camera/ws`, so browsers never reach the unauthenticated go2rtc port (1984). Auth mirrors `WebSocketManager.verifyClient` via a `?token=` query param; WebRTC signaling rides the same socket
- Test coverage for `CameraStreamProxy`, camera routes, and a shared `test-server.ts` Express fixture helper, plus additions to the `camera-utils` and `printerSettingsDefaults` suites
- URL-based printer context selection: the WebUI reads `?ip=` / `?serial=` query params to pick the active printer on load, so it stays in sync when embedded in tools like OrcaSlicer's Device tab (#16)

### Changed

- IFS Material Station and Spoolman cards are now feature-gated and added/positioned by the user through the Panel Visibility picker, replacing runtime auto-reveal to match desktop behaviour
- Replaced the previous "Edit IFS Slots" button and slot-list modal with the dedicated Material Station dashboard card
- `@ghosttypes/ff-api` bumped to `^1.3.2` for `configureSlot` / `SlotAction` support
- `jest.config.js` now maps `.js` ESM specifiers to `.ts` so `static/` module specs run under ts-jest
- `WebSocketManager` moved to `noServer` mode with a new `handleUpgrade(req, socket, head)` method (previously bound to the HTTP server with `path: '/ws'`)
- `WebUIManager` now owns a single shared HTTP upgrade router dispatching `/ws` → WebSocketManager, `/api/camera/ws` → `CameraStreamProxy`, else `socket.destroy()`
- Camera API contract: `camera-routes` now returns a relative `wsUrl` (`/api/camera/ws?src=<stream>`) and no longer returns `apiPort`; the frontend `CameraProxyConfigResponse` type dropped `apiPort`
- Frontend camera client appends the auth token to the relative WebSocket path, and the bundled `video-rtc` player resolves it against the page origin
- README: new "Remote Access / Port Forwarding" note — forward only the WebUI port (default 3000), never the unauthenticated go2rtc port (1984)
- Removed a dead chamber-temperature clamp (`Math.min(temperature, CHAMBER_MAX_TEMP)`) in `setTemperature` since the range check already rejects out-of-range values (behavior-neutral cleanup)

### Removed

- Unused Playwright E2E test suites (`e2e/` and `e2e-emulator/`), `tsconfig.e2e.json`, the associated npm test scripts, the Discord webhook relay helper, and the `e2e-routes` test endpoints
- Runtime auto-reveal of the Spoolman and IFS cards (now user-added via the picker)

### Fixed

- Release workflow now generates tag-based changelog comparison links in published GitHub releases
- Mobile dashboard rendered as a non-functional gray area — removed the redundant `hidden` class on `#webui-grid-mobile` in `index.html` (the global `.hidden{display:none}` rule outranked the 768px media query's `display:flex`)

## [1.1.0] - 2026-03-21

### Added

- `CameraStreamCoordinator` service to detect and register OEM camera streams from printer-reported stream URLs without manual configuration
- Intelligent OEM camera fallback detection that probes `http://<printer-ip>:8080/?action=stream` when firmware omits the camera stream URL
- `printerSettingsDefaults` utility for consistent per-printer settings initialization across backends
- Test coverage for `camera-utils`, `printerSettingsDefaults`, and OEM stream coordinator behavior
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

- Camera configuration resolution now uses `CameraStreamCoordinator` for OEM stream URL detection before falling back to per-printer overrides
- Camera configuration resolution now falls back to the known OEM MJPEG endpoint when firmware does not report a stream URL
- go2rtc camera stream reconciliation now handles OEM, custom, and intelligent fallback camera sources through the same managed stream path
- `@ghosttypes/ff-api` is now pinned to `^1.3.0` to use `FiveMClient.detectCameraStream()` for intelligent fallback detection
- All printer backends updated to expose the printer-reported OEM stream URL for coordinator use
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

[Unreleased]: https://github.com/Parallel-7/FlashForgeWebUI/compare/v1.2.0-alpha.2...HEAD
[1.2.0-alpha.2]: https://github.com/Parallel-7/FlashForgeWebUI/compare/v1.2.0-alpha.1...v1.2.0-alpha.2
[1.2.0-alpha.1]: https://github.com/Parallel-7/FlashForgeWebUI/compare/v1.1.0...v1.2.0-alpha.1
[1.1.0]: https://github.com/Parallel-7/FlashForgeWebUI/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/Parallel-7/FlashForgeWebUI/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/Parallel-7/FlashForgeWebUI/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/Parallel-7/FlashForgeWebUI/releases/tag/v1.0.0
