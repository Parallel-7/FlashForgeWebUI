# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlashForgeWebUI is a standalone web-based interface for controlling and monitoring FlashForge 3D printers. It provides a lightweight deployment option for low-spec devices like Raspberry Pi, without Electron dependencies.

**Current Status**: Production-ready. Core functionality tested and working including multi-printer support, Spoolman integration, Discord webhook notifications, go2rtc-based camera streaming, and cross-platform binary distribution.

## Build & Development Commands

### Development
```bash
npm run dev              # Build and watch with hot reload (concurrent backend + webui + server)
npm run build            # Full production build (backend + webui)
npm run build:watch      # Watch backend and frontend builds without starting the server
npm run start            # Run the built application
npm run start:dev        # Run with nodemon (watches for changes)
```

### Build Components
```bash
npm run build:backend           # Bundle backend with esbuild (scripts/build-backend.ts)
npm run build:backend:watch     # Watch backend files
npm run build:webui             # Compile frontend TS + copy static assets
npm run build:webui:watch       # Watch frontend files
npm run build:webui:copy        # Copy HTML/CSS and vendor libraries to dist
```

### Platform-Specific Builds
```bash
npm run build:linux             # Linux x64 executable (using pkg)
npm run build:linux-arm         # Linux ARM64 executable
npm run build:linux-armv7       # Linux ARMv7 executable
npm run build:win               # Windows x64 executable
npm run build:mac               # macOS x64 executable
npm run build:mac-arm           # macOS ARM64 executable
npm run build:all               # Build for all platforms
npm run build:wrapper           # Run the platform build wrapper directly
npm run build:win:wrapped       # Windows x64 build via wrapper
npm run build:linux:wrapped     # Linux x64 build via wrapper
npm run build:linux-arm:wrapped # Linux ARM64 build via wrapper
npm run build:linux-armv7:wrapped # Linux ARMv7 build via wrapper
npm run build:mac:wrapped       # macOS x64 build via wrapper
npm run build:mac-arm:wrapped   # macOS ARM64 build via wrapper
npm run build:all:wrapped       # All wrapped platform builds
```

### Code Quality
```bash
npm run lint              # Run Biome lint checks
npm run lint:fix          # Auto-fix Biome lint issues
npm run format            # Preview Biome formatting changes
npm run format:fix        # Apply Biome formatting changes
npm run check             # Run Biome check (lint + format combined)
npm run check:fix         # Auto-fix Biome check issues
npm run type-check        # TypeScript type checking
npm run type-check:app    # Type check main application
npm run docs:check        # Validate @fileoverview coverage in source files
npm run docs:check:debug  # Debug fileoverview validation output
npm run clean             # Remove dist directory
npm run download:go2rtc   # Manually download go2rtc binary
```

### Testing
```bash
# Jest unit/integration tests
npm test                            # Run all Jest tests
npm run test:watch                  # Jest watch mode
npm run test:coverage               # Jest with coverage
npm run test:verbose                # Jest verbose output

# TypeScript checks
npm run type-check                  # Type check the application (tsc --noEmit)

# Passthrough: append extra args after --
# npm test -- --testPathPattern=Config
```

## Runtime Modes

The application supports multiple startup modes via CLI arguments:

```bash
# Connect to last used printer
node dist/index.js --last-used

# Connect to all saved printers
node dist/index.js --all-saved-printers

# Connect to specific printers
node dist/index.js --printers="192.168.1.100:new:12345678,192.168.1.101:legacy"

# Start without printer connections (WebUI only)
node dist/index.js --no-printers

# Override WebUI settings
node dist/index.js --last-used --webui-port=3001 --webui-password=mypassword
```

Printer spec format: `IP:TYPE[:CHECKCODE[:SERIAL]]` where TYPE is `new`, `legacy`, `creator-5`, or `creator-5-pro`. The Creator tokens are required for the Creator 5 series because those printers are HTTP-only — the generic `new` token triggers a legacy TCP probe they cannot answer. SERIAL is required for the Creator series (their serial cannot be recovered by probing) and optional for dual-API models, which fall back to the serial reported by the TCP probe.

## Architecture

### Core Architecture Pattern

The system is built on a **multi-context singleton architecture**:

1. **Singleton Managers**: Global coordinators for major subsystems.
2. **Multi-Context Design**: Support for simultaneous connections to multiple printers, each isolated in its own context.
3. **Event-Driven Communication**: EventEmitter-based communication between services and managers.
4. **Service-Oriented**: Clear separation between managers, backends, and runtime services.

### Key Layers

```text
src/index.ts                    # Entry point - initializes all singletons, connects printers, starts WebUI
|-- managers/                   # Singleton coordinators (ConfigManager, PrinterContextManager, etc.)
|-- printer-backends/           # Printer-specific API implementations
|-- services/                   # Background services (polling, camera, spoolman, monitoring)
|-- webui/                      # Web server and frontend
|   |-- server/                 # Express server, WebSocket, API routes, auth
|   `-- static/                 # Frontend TypeScript (separate tsconfig, compiled to ES modules)
|-- types/                      # TypeScript type definitions
`-- utils/                      # Shared utilities
```

### Critical Components

**Managers** (singleton coordinators):
- `ConfigManager` - Global configuration from `data/config.json`
- `PrinterContextManager` - Multi-printer context lifecycle (create, switch, remove contexts)
- `PrinterBackendManager` - Backend instantiation based on printer model and capabilities
- `ConnectionFlowManager` - Connection orchestration (discovery, pairing, reconnect, disconnect)
- `PrinterDetailsManager` - Persistent printer metadata and saved printer details

**Contexts**: Each connected printer gets a unique context containing:
- Unique ID and printer details
- Backend instance (`AD5XBackend`, `Adventurer5MBackend`, `GenericLegacyBackend`, etc.)
- Polling service instance
- Connection state
- Spoolman spool assignment

**Backends**: Abstraction layer over printer APIs (all extend `BasePrinterBackend`):
- `AD5XBackend` - Adventurer 5M X series (uses AD5X API)
- `Adventurer5MBackend` - Adventurer 5M (FiveMClient)
- `Adventurer5MProBackend` - Adventurer 5M Pro (FiveMClient)
- `Creator5Backend` - Creator 5 / Creator 5 Pro (HTTP-only connection flow; IFS Material Station support)
- `DualAPIBackend` - Base for printers supporting both FiveMClient and FlashForgeClient
- `GenericLegacyBackend` - Fallback for older printers (FlashForgeClient only)

**Services**:
- `MultiContextPollingCoordinator` - Manages per-context polling (3s for all contexts)
- `MultiContextPrintStateMonitor` - Tracks print progress and state transitions
- `MultiContextTemperatureMonitor` - Temperature anomaly detection
- `MultiContextSpoolmanTracker` - Filament usage tracking
- `MultiContextNotificationCoordinator` - Aggregates print notifications across contexts
- `Go2rtcService` - Unified camera streaming via go2rtc (WebRTC, MSE, MJPEG)
- `Go2rtcBinaryManager` - Manages go2rtc binary lifecycle (download, start, stop)
- `DiscordNotificationService` - Discord webhook notifications for print events and periodic status updates
- `SavedPrinterService` - Persistent printer storage in `data/printer_details.json`
- `SpoolmanIntegrationService` / `SpoolmanService` - Spoolman connectivity and synchronization
- `PrinterDiscoveryService` - Network printer discovery protocol
- `ConnectionEstablishmentService` - Connection establishment flow orchestration
- `ConnectionStateManager` - Tracks connection state per context
- `EnvironmentService` - Package detection, path resolution, environment state
- `PrinterPollingService` - Per-context status polling (used by `MultiContextPollingCoordinator`)
- `AutoConnectService` - Auto-reconnect logic for saved printers
- `PrinterDataTransformer` - Normalizes raw printer data to unified status format
- `ThumbnailRequestQueue` - Queued thumbnail fetching for print files

**WebUI**:
- `WebUIManager` - Express HTTP server and static file serving
- `WebSocketManager` - Real-time bidirectional communication with the frontend
- `AuthManager` - Optional password authentication
- `CameraStreamProxy` - Authenticated bridge between WebUI clients and the local go2rtc API at `/api/camera/ws`; browsers never reach the go2rtc port directly. `WebUIManager` owns a single HTTP `upgrade` router that dispatches by pathname: `/ws` → `WebSocketManager.handleUpgrade`, `/api/camera/ws` → `CameraStreamProxy.handleUpgrade`, else `socket.destroy()`.
- API routes organized by feature (context, printer-control, printer-status, printer-detection, printer-management, job, camera, temperature, filtration, spoolman, theme, discovery)
- Frontend uses GridStack for dashboard layout and the bundled `video-rtc` player for go2rtc-backed camera streaming

### Data Directory

The application stores runtime state in `data/` under the project working directory. In the current repo, only `data/runtime/` is ignored by `.gitignore`, so local edits to top-level files like `data/config.json` can appear in `git status`.

Key files:
- `data/config.json` - User settings (WebUI, Discord, Spoolman, theme, debug settings)
- `data/printer_details.json` - Saved printer details and printer-specific overrides used for reconnects and camera resolution

Default config values live in `src/types/config.ts` and are loaded through `ConfigManager`.

### Build System

**Backend Bundling** (`scripts/build-backend.ts`):
- Bundles `src/index.ts` to `dist/index.js` as a CommonJS entrypoint
- Uses `packages: 'external'` to keep `node_modules` separate for pkg compatibility
- `tsc` is still used for type checking via `npm run type-check`

**Frontend Compilation** (`src/webui/static/tsconfig.json`):
- Compiles frontend TypeScript to `dist/webui/static/` as browser ES modules

**Asset Pipeline** (`scripts/copy-webui-assets.js`):
- Copies `index.html`, `webui.css`, `gridstack-extra.min.css`, and `favicon.png` from `src/webui/static/`
- Copies vendor libraries from `node_modules/` including GridStack, Lucide, and `video-rtc`

**Documentation Validation** (`scripts/check-fileoverview.go`):
- Powers `npm run docs:check` and `npm run docs:check:debug`
- Verifies `@fileoverview` coverage across the source tree

**Wrapped Platform Builds** (`scripts/platform-build-wrapper.ts`):
- Provides wrapper entrypoints for the `build:*:wrapped` scripts

**go2rtc Binary** (`scripts/download-go2rtc.cjs`):
- Runs at `npm install` time via the `postinstall` hook
- Downloads the platform-specific go2rtc binary to `resources/bin/`

**pkg Bundling**:
- Production builds use `@yao-pkg/pkg` to create standalone executables
- Packaged assets include `dist/webui/**/*` and `resources/bin/**/*`

**Why `@yao-pkg/pkg` instead of official `pkg`?**
- The official `pkg` package is no longer maintained and lacks newer Node.js and ARMv7 support
- `@yao-pkg/pkg` supports `node20-linuxstatic-armv7`, which is required for Raspberry Pi 32-bit builds
- It remains compatible with the existing `pkg` configuration used by this project

**Why esbuild instead of tsc for the backend?**
- `pkg` expects a CJS-friendly backend bundle
- esbuild produces a single bundled entrypoint that packages reliably
- Keeping packages external lets `pkg` embed the needed runtime assets and scripts cleanly

## Dependencies

**Core**:
- `@ghosttypes/ff-api` - FlashForge printer API clients (`FiveMClient`, `FlashForgeClient`)
- `@parallel-7/slicer-meta` - Printer metadata and model detection
- `express` - HTTP server
- `ws` - WebSocket server
- `zod` - Schema validation
- `axios` - HTTP client for go2rtc API calls
- `form-data` - Multipart form handling

**Frontend**:
- `gridstack` - Dashboard layout system
- `lucide` - Icon library
- `video-rtc` - go2rtc video player bundled into static assets

**Dev**:
- TypeScript 5.7
- Biome 2 for linting and formatting
- `esbuild` for backend bundling
- `jest`, `ts-jest`, `supertest` for unit/integration testing
- `concurrently` for parallel build tasks
- `nodemon` for dev server reloads
- `tsx` for build scripts
- `@yao-pkg/pkg` for executable packaging

## Printer API Integration

FlashForge printers have two API generations:

1. **Legacy API** (`FlashForgeClient`) - Older printers using a line-based TCP protocol
2. **New API** (`FiveMClient`) - Newer printers using structured commands with JSON responses

Some printers support **both** (dual API). The backend system abstracts these differences.

**Backend Selection** (in `PrinterBackendManager.createBackend()`):
- Adventurer 5M X -> `AD5XBackend`
- Adventurer 5M -> `Adventurer5MBackend`
- Adventurer 5M Pro -> `Adventurer5MProBackend`
- Creator 5 / Creator 5 Pro -> `Creator5Backend`
- Other new-API printers -> backend selected from discovery metadata and `clientType`
- Legacy printers -> `GenericLegacyBackend`

**Feature Detection**: Each backend declares supported features via `getBaseFeatures()`. The UI shows or hides controls based on those features, including LEDs, power toggle, material station support, and camera support.

**Model Detection (Discovery-PID-First, TCP Fallback)**:
- **Modern printers are typed from the discovery broadcast, not a TCP probe.** The UDP discovery response (276-byte modern packet) carries the USB product ID at `0x88`, the serial number at `0x92` and the name at `0x00`. `ConnectionEstablishmentService.createTemporaryConnection()` short-circuits on any product ID in `NEW_API_PRODUCT_IDS` (35 = 5M, 36 = 5M Pro, 38 = AD5X, 40 = Creator 5, 41 = Creator 5 Pro) and synthesizes the type info from that packet — **no TCP probe runs for any modern model**. This is safe because `establishDualAPIConnection` consumes none of the probe's output, capability flags come from `FiveMClient.initialize()` post-init, and reachability is covered by `initialize()` hitting authenticated `/detail`. (Verified against real hardware: a 5M Pro and an AD5X both return their serial at `0x92` and a correct PID at `0x88`.)
- **The TCP probe remains the fallback for anything with no product ID.** Genuine legacy printers, and manual/headless connects that named no model, still open an unauthenticated TCP `M115` via `tcpClient.getPrinterInfo()`; the resulting `TypeName` (firmware-controlled, e.g. `"FlashForge Adventurer 5M Pro"`) feeds `detectPrinterModelType` / `detectPrinterFamily` in `src/utils/PrinterUtils.ts`. `TypeName` is firmware-set and is NOT the same as the user-mutable `Name` field on `/detail`.
- **Manual connects supply what the broadcast would have.** Because a named model skips the probe, the manual connect form requires the serial number and check code, and sends a product ID hint (`MANUAL_PRODUCT_ID_HINTS` in `src/webui/static/features/printer-discovery.ts`, keys matching the type dropdown in `index.html`). Selecting `legacy` sends no product ID and is probed as before.
- **Once paired, trust the library.** After the check code is supplied and `FiveMClient.initialize()` succeeds, `client.isPro` / `client.isAD5X` / `info.Pid` (from `@ghosttypes/ff-api>=1.3.1`) are derived from the firmware `pid` (35 = 5M, 36 = 5M Pro, 38 = AD5X). Read those flags for capability gating; do not re-substring-match `info.Name` — that field is user-set via the LCD or cloud and changing it broke detection in pre-fix builds (`ff-5mp-hass#13`).
- **Don't manually overwrite `client.isAD5X`.** If you find yourself re-deriving capability flags that the library already sets, prefer fixing the library or the backend-selection input over mutating the FiveMClient instance from app code.

## Event Flow

1. **Startup** (`src/index.ts`)
   - Initialize data directory
   - Parse CLI arguments
   - Load config
   - Initialize go2rtc, Spoolman, Discord, and monitoring services
   - Connect printers and create contexts/backends
   - Start the WebUI server
   - Forward polling updates to WebSocket clients and Discord status tracking
   - Reconcile camera streams per context
   - Register signal handlers for graceful shutdown

2. **Polling Lifecycle**
   - `MultiContextPollingCoordinator` creates a `PrinterPollingService` per context
   - Each polling service calls `backend.getPrinterStatus()` every 3 seconds
   - Status data is emitted as a `polling-data` event with `contextId`
   - `WebUIManager` forwards polling data to `WebSocketManager`
   - `DiscordNotificationService` uses the same status stream for periodic updates

3. **WebSocket Communication**
   - The frontend connects via WebSocket once the server starts
   - The server pushes printer status and notification updates
   - The client sends commands for printer control, job actions, and context switching
   - The API contract is defined in `src/webui/schemas/web-api.schemas.ts` and `src/webui/types/web-api.types.ts`

## Common Patterns

**Singleton Pattern**:
```typescript
type ManagerBrand = { readonly __brand: 'Manager' };
type ManagerInstance = Manager & ManagerBrand;

class Manager {
  private static instance: ManagerInstance | null = null;

  private constructor() {}

  static getInstance(): ManagerInstance {
    if (!this.instance) {
      this.instance = new Manager() as ManagerInstance;
    }
    return this.instance;
  }
}

export function getManager(): ManagerInstance {
  return Manager.getInstance();
}
```

**Context Access**:
```typescript
const contextManager = getPrinterContextManager();
const activeContextId = contextManager.getActiveContextId();
const context = contextManager.getContext(activeContextId);
const backend = context?.backend;
```

**Typed EventEmitter Usage**:
```typescript
interface EventMap extends Record<string, unknown[]> {
  'event-name': [arg1: Type1, arg2: Type2];
}

class Service extends EventEmitter<EventMap> {
  doSomething() {
    this.emit('event-name', arg1, arg2);
  }
}
```

## Gotchas

1. **Dual Build System**: Backend uses esbuild bundling, frontend uses a separate `tsconfig` for browser modules.
2. **Data Directory Tracking**: Runtime state lives in `<project>/data/`, but only `data/runtime/` is ignored by the current `.gitignore`.
3. **Camera Streams**: go2rtc manages camera streams per context, but browsers never reach the go2rtc port directly — video flows through an authenticated WebUI proxy at `/api/camera/ws` (see `CameraStreamProxy`). Only the WebUI port should be exposed/forwarded; the unauthenticated go2rtc port (default `1984`) must NOT be forwarded. There is no user-facing global `CameraProxyPort` setting.
4. **go2rtc Binary**: The binary is downloaded at `npm install` time and stored under `resources/bin/`. If download or packaging fails, camera streaming will not work.
5. **Polling Frequency**: All contexts poll every 3 seconds to avoid inactive-context TCP keep-alive failures.
6. **Context IDs**: IDs are UUID-based and generated at connection time; they are not tied to IP or serial number.
7. **Backend Lifecycle**: Backends are created per context and maintain their own TCP connections.
8. **Graceful Shutdown**: Shutdown stops polling, Discord, printer connections, go2rtc, and the WebUI with layered timeouts.
9. **Windows Compatibility**: Ctrl+C handling includes a readline bridge on Windows.
10. **ARMv7 Builds**: Raspberry Pi 32-bit builds target `node20-linuxstatic-armv7`, which depends on `@yao-pkg/pkg`.
11. **CRLF vs Biome LF**: The repo is checked out CRLF repo-wide, but `biome.json` sets `lineEnding: "lf"`. As a result `npm run check` (and `lint`/`format`) reports ~30+ format errors across nearly every source file regardless of what changed — this is pre-existing, not a regression from your edit. Only fix lint/format issues you actually introduced.

## Testing Notes

**Jest unit/integration tests** (`src/`):
- ConfigManager, EnvironmentService, DiscordNotificationService, error utilities, WebUIManager integration, `CameraStreamProxy`, and camera routes (via the `test-server.ts` Express fixture helper)

**Verified and tested**:
- Multi-printer context switching
- Spoolman integration
- Platform-specific binary builds (Linux ARM, Linux x64, Windows, macOS)
- WebUI authentication
- Static file serving in packaged binaries
- Discord notification service behavior

**Areas for continued testing**:
- go2rtc binary download and startup across all supported platforms
- Temperature anomaly detection edge cases
- Wrapped build flows and packaging verification

## Related Projects

- **@ghosttypes/ff-api**: FlashForge API client library
- **@parallel-7/slicer-meta**: Printer metadata and model utilities
