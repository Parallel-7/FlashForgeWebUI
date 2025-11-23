# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FlashForgeWebUI is a standalone web-based interface for controlling and monitoring FlashForge 3D printers. It was ported from the FlashForgeUI-Electron project (located at `C:\Users\Cope\Documents\GitHub\FlashForgeUI-Electron`) to create a lightweight deployment option for low-spec devices like Raspberry Pi, without Electron dependencies.

**Current Status**: Initial porting is complete but not fully tested. Some bugs are expected.

## Build & Development Commands

### Development
```bash
npm run dev              # Build and watch with hot reload (concurrent backend + webui + server)
npm run build            # Full production build (backend + webui)
npm run start            # Run the built application
npm run start:dev        # Run with nodemon (watches for changes)
```

### Build Components
```bash
npm run build:backend           # Compile TypeScript backend (tsc)
npm run build:backend:watch     # Watch backend files
npm run build:webui             # Compile frontend TS + copy static assets
npm run build:webui:watch       # Watch frontend files
npm run build:webui:copy        # Copy HTML/CSS and vendor libraries to dist
```

### Platform-Specific Builds
```bash
npm run build:linux        # Linux x64 executable (using pkg)
npm run build:linux-arm    # Linux ARM64 executable
npm run build:linux-armv7  # Linux ARMv7 executable
npm run build:win          # Windows x64 executable
npm run build:mac          # macOS x64 executable
npm run build:mac-arm      # macOS ARM64 executable
npm run build:all          # Build for all platforms
```

### Code Quality
```bash
npm run lint           # Run ESLint on all TypeScript files
npm run lint:fix       # Auto-fix ESLint issues
npm run type-check     # TypeScript type checking without emit
npm test               # Tests (not yet implemented)
npm run clean          # Remove dist directory
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

Printer spec format: `IP:TYPE:CHECKCODE` where TYPE is "new" or "legacy"

## Architecture

### Core Architecture Pattern

The system is built on a **multi-context singleton architecture**:

1. **Singleton Managers** - Global coordinators for major subsystems (branded types enforce single instance)
2. **Multi-Context Design** - Support for simultaneous connections to multiple printers, each isolated in its own context
3. **Event-Driven Communication** - EventEmitter pattern for loose coupling between components
4. **Service-Oriented** - Clear separation between managers, backends, and services

### Key Layers

```
src/index.ts                    # Entry point - initializes all singletons, connects printers, starts WebUI
├── managers/                   # Singleton coordinators (ConfigManager, PrinterContextManager, etc.)
├── printer-backends/           # Printer-specific API implementations
├── services/                   # Background services (polling, camera, spoolman, monitoring)
├── webui/                      # Web server and frontend
│   ├── server/                 # Express server, WebSocket, API routes, auth
│   └── static/                 # Frontend TypeScript (separate tsconfig, compiled to ES modules)
├── types/                      # TypeScript type definitions
└── utils/                      # Shared utilities
```

### Critical Components

**Managers** (Singleton coordinators):
- `ConfigManager` - Global configuration (loads from `data/config.json`)
- `PrinterContextManager` - Multi-printer context lifecycle (create/switch/remove contexts)
- `PrinterBackendManager` - Backend instantiation based on printer model
- `ConnectionFlowManager` - Connection orchestration (discovery, pairing, reconnect)

**Contexts**: Each connected printer gets a unique context containing:
- Unique ID and printer details
- Backend instance (AD5XBackend, Adventurer5MBackend, GenericLegacyBackend, etc.)
- Polling service instance
- Connection state
- Camera proxy port
- Spoolman spool assignment

**Backends**: Abstraction layer over printer APIs (all extend `BasePrinterBackend`):
- `AD5XBackend` - Adventurer 5M X series (uses AD5X API)
- `Adventurer5MBackend` - Adventurer 5M (FiveMClient)
- `Adventurer5MProBackend` - Adventurer 5M Pro (FiveMClient)
- `DualAPIBackend` - Base for printers supporting both FiveMClient + FlashForgeClient
- `GenericLegacyBackend` - Fallback for older printers (FlashForgeClient only)

**Services**:
- `MultiContextPollingCoordinator` - Manages per-context polling (3s for all contexts)
- `MultiContextPrintStateMonitor` - Track print progress, emit notifications
- `MultiContextTemperatureMonitor` - Temperature anomaly detection
- `MultiContextSpoolmanTracker` - Filament usage tracking
- `CameraProxyService` - MJPEG camera proxying
- `RtspStreamService` - RTSP stream management
- `SavedPrinterService` - Persistent printer storage (`data/printer_details.json`)

**WebUI**:
- `WebUIManager` - Express HTTP server + static file serving
- `WebSocketManager` - Real-time bidirectional communication with frontend
- `AuthManager` - Optional password authentication
- API routes organized by feature (printer-control, job, camera, spoolman, etc.)
- Frontend uses GridStack for draggable dashboard, JSMpeg for video streaming

### Data Directory

The `data/` folder contains runtime configuration and is **not tracked in git** (will be added to `.gitignore`). You can still manually access it to read:
- `data/config.json` - User settings (WebUI port, password, camera URLs, Spoolman config, theme)
- `data/printer_details.json` - Saved printer details for auto-reconnect

Default config values are in `ConfigManager.ts`.

### Build System

**Dual TypeScript Compilation**:
1. **Backend** (`tsconfig.json`): Compiles `src/` → `dist/` as CommonJS (Node.js target)
2. **Frontend** (`src/webui/static/tsconfig.json`): Compiles frontend TS → `dist/webui/static/` as ES modules (browser target)

**Asset Pipeline** (`scripts/copy-webui-assets.js`):
- Copies `index.html`, `webui.css`, `gridstack-extra.min.css` from `src/webui/static/`
- Copies vendor libraries from `node_modules/` (jsmpeg, gridstack, lucide)

**pkg Bundling**: Production builds use `pkg` to create standalone executables with embedded assets (`dist/webui/**/*`)

## Dependencies

**Core**:
- `@ghosttypes/ff-api` - FlashForge printer API clients (FiveMClient, FlashForgeClient)
- `@parallel-7/slicer-meta` - Printer metadata and model detection
- `express` - HTTP server
- `ws` - WebSocket server
- `zod` - Schema validation

**Frontend**:
- `gridstack` - Dashboard layout system
- `@cycjimmy/jsmpeg-player` - Video streaming
- `lucide` - Icon library

**Dev**:
- TypeScript 5.7, ESLint 9 with TypeScript ESLint
- `concurrently` - Parallel build tasks
- `nodemon` - Dev server hot reload
- `pkg` - Executable packaging

## Printer API Integration

FlashForge printers have two API generations:

1. **Legacy API** (`FlashForgeClient`) - Older printers, line-based TCP protocol
2. **New API** (`FiveMClient`) - Newer printers (5M series), structured commands with JSON responses

Some printers support **both** (dual-API). The backend system abstracts these differences.

**Backend Selection** (in `PrinterBackendManager.createBackend()`):
- Adventurer 5M X → `AD5XBackend` (specialized AD5X API)
- Adventurer 5M → `Adventurer5MBackend`
- Adventurer 5M Pro → `Adventurer5MProBackend`
- Other new-API printers → Backend based on `clientType` from discovery
- Legacy printers → `GenericLegacyBackend`

**Feature Detection**: Each backend declares supported features via `getBaseFeatures()`. Features include LED control, material station, RTSP camera, power toggle, etc. The UI dynamically shows/hides controls based on feature availability.

## Event Flow

1. **Startup** (`src/index.ts`):
   - Initialize data directory
   - Parse CLI arguments
   - Load config
   - Initialize services (RTSP, Spoolman, monitoring)
   - Connect to printers (creates contexts + backends)
   - Start WebUI server
   - Setup event forwarding (polling data → WebUI)
   - Start polling for each context
   - Setup signal handlers for graceful shutdown

2. **Polling Lifecycle**:
   - `MultiContextPollingCoordinator` creates `PrinterPollingService` per context
   - Polling service calls `backend.getPrinterStatus()` every 3 seconds
   - Status data emitted as `polling-data` event with contextId
   - Event forwarded to `WebUIManager` → `WebSocketManager` → Browser clients

3. **WebSocket Communication**:
   - Frontend connects via WebSocket on server start
   - Server pushes status updates (polling data, notifications)
   - Client sends commands (job control, printer settings, context switching)
   - Bidirectional type-safe API defined in `web-api.schemas.ts` / `web-api.types.ts`

## Common Patterns

**Singleton Pattern**:
```typescript
// Branded type to enforce singleton
type ManagerBrand = { readonly __brand: 'Manager' };
type ManagerInstance = Manager & ManagerBrand;

class Manager {
  private static instance: ManagerInstance | null = null;

  private constructor() { /* ... */ }

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

**EventEmitter Usage**:
```typescript
// Typed events for safety
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

1. **Dual Build System**: Backend and frontend have separate `tsconfig.json` files with different module systems (CommonJS vs ES modules)
2. **Data Directory**: Not in git but can be manually accessed for debugging. Default location is `<project>/data/`
3. **Port Allocation**: Camera proxies dynamically allocate ports starting from config value (`CameraProxyPort`)
4. **Polling Frequency**: All contexts poll at 3 seconds (changed from 30s for inactive contexts to prevent TCP keep-alive failures)
5. **Context IDs**: UUID-based, generated during connection. Not tied to IP or serial number
6. **Backend Lifecycle**: Backends are created per context, not shared. Each context has its own TCP connection
7. **Graceful Shutdown**: SIGINT/SIGTERM handlers stop polling, disconnect contexts, and stop WebUI before exit
8. **Windows Compatibility**: Special handling for Ctrl+C via readline interface (see `index.ts`)

## Testing Notes

Initial porting is complete but **not fully tested**. Known areas to test:
- Multi-printer context switching
- Camera proxy stability under load
- RTSP streaming for supported printers
- Spoolman integration (filament tracking)
- Print state monitoring and notifications
- Temperature anomaly detection
- Different printer model backends (AD5X, 5M, 5M Pro, legacy)
- WebUI authentication
- Platform-specific builds (Linux ARM, Windows, macOS)

## Related Projects

- **FlashForgeUI-Electron**: Parent project with full Electron desktop app (`C:\Users\Cope\Documents\GitHub\FlashForgeUI-Electron`)
- **@ghosttypes/ff-api**: FlashForge API client library (public package)
- **@parallel-7/slicer-meta**: Printer metadata and model utilities (public package)
