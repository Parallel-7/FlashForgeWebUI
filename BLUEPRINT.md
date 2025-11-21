# FlashForgeWebUI Implementation Blueprint

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Phase 1: Core Infrastructure](#phase-1-core-infrastructure)
4. [Phase 2: Backend Services](#phase-2-backend-services)
5. [Phase 3: WebUI Server](#phase-3-webui-server)
6. [Phase 4: Frontend Implementation](#phase-4-frontend-implementation)
7. [Phase 5: Integration & Testing](#phase-5-integration--testing)
8. [Phase 6: Build & Deployment](#phase-6-build--deployment)
9. [File Structure](#file-structure)
10. [Implementation Details](#implementation-details)

---

## Project Overview

### Goal

Create a standalone, headless WebUI server for FlashForge 3D printers by porting the WebUI functionality from FlashForgeUI-Electron. This will be a pure Node.js application (no Electron) that provides the same WebUI experience with multi-printer support, camera streaming, Spoolman integration, and GridStack layout customization.

### Key Requirements

- **1:1 WebUI Port**: Exact same UI, features, and functionality as FlashForgeUI-Electron WebUI
- **Multi-Printer Support**: Full context-based architecture for managing multiple printers
- **Camera Streaming**: Both MJPEG proxy and RTSP streaming support
- **Spoolman Integration**: Filament tracking with per-printer spool management
- **GridStack Editor**: Customizable dashboard with theme engine
- **Config System**: Global settings + per-printer overrides
- **Cross-Platform Builds**: Support for x64, ARM64, ARMv7 on Linux/Windows/macOS

### What NOT to Port

- Electron desktop UI (renderer process)
- Desktop window management (BrowserWindow, etc.)
- Desktop notifications (native OS notifications)
- IPC handlers (Electron IPC)
- Auto-updater (Electron updater)
- Discord integration (optional - can be added later if desired)

---

## Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────┐
│                   Browser Client                    │
│  (HTML/CSS/TypeScript - GridStack, WebSockets)     │
└────────────────────┬────────────────────────────────┘
                     │
                     │ HTTP/WebSocket
                     │
┌────────────────────▼────────────────────────────────┐
│              Express WebUI Server                   │
│  (Authentication, REST API, WebSocket Manager)     │
└────────────────────┬────────────────────────────────┘
                     │
         ┌───────────┴──────────┬──────────────┐
         │                      │              │
┌────────▼────────┐  ┌─────────▼──────┐  ┌───▼──────┐
│ Context Manager │  │ Config Manager │  │ Services │
│                 │  │                │  │          │
│ - Printer Ctxs  │  │ - AppConfig    │  │ - Polling│
│ - Multi-printer │  │ - Per-printer  │  │ - Camera │
└────────┬────────┘  └────────────────┘  │ - Spoolman│
         │                                └──────────┘
         │
┌────────▼────────────────────────────────────────────┐
│           Printer Backend Abstraction               │
│  (Legacy, Adventurer 5M/Pro, AD5X, Dual API)       │
└────────────────────┬────────────────────────────────┘
                     │
                     │ TCP/HTTP
                     │
┌────────────────────▼────────────────────────────────┐
│              FlashForge Printers                    │
│         (Multiple printer instances)                │
└─────────────────────────────────────────────────────┘
```

### Core Concepts

#### Contexts

A **context** represents a single printer connection with its own:
- Backend instance (printer API client)
- Polling service
- Camera proxy
- State monitors
- Notification coordinator
- Active spool tracking

Contexts are managed by `PrinterContextManager` and identified by unique IDs like `context-1-1234567890`.

#### Serial Number Linking

Printers are identified by their serial numbers, which link to:
- Saved printer details (`printer_details.json`)
- Browser localStorage layouts (`flashforge-webui-layout-{serial}`)
- Browser localStorage settings (`flashforge-webui-settings-{serial}`)

---

## Phase 1: Core Infrastructure

### 1.1 Type Definitions

**Source Reference:** `FlashForgeUI-Electron/src/types/`

**Create:** `src/types/`

#### config.ts

Port the config types with simplifications:

```typescript
interface AppConfig {
  // WebUI Server
  WebUIEnabled: boolean;
  WebUIPort: number;
  WebUIPassword: string;
  WebUIPasswordRequired: boolean;

  // Spoolman
  SpoolmanEnabled: boolean;
  SpoolmanServerUrl: string;
  SpoolmanUpdateMode: 'length' | 'weight';

  // Camera
  CustomCamera: boolean;
  CustomCameraUrl: string;
  CameraProxyPort: number;

  // Advanced
  CustomLeds: boolean;
  ForceLegacyAPI: boolean;
  DebugMode: boolean;

  // Theme
  WebUITheme: ThemeColors;
}

interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
}

const DEFAULT_CONFIG: AppConfig = {
  WebUIEnabled: true,  // Always true in standalone
  WebUIPort: 3000,
  WebUIPassword: 'changeme',
  WebUIPasswordRequired: true,
  SpoolmanEnabled: false,
  SpoolmanServerUrl: '',
  SpoolmanUpdateMode: 'weight',
  CustomCamera: false,
  CustomCameraUrl: '',
  CameraProxyPort: 8181,
  CustomLeds: false,
  ForceLegacyAPI: false,
  DebugMode: false,
  WebUITheme: {
    primary: '#4285f4',
    secondary: '#357abd',
    background: '#121212',
    surface: '#1e1e1e',
    text: '#e0e0e0'
  }
};
```

**Key Changes:**
- Remove: `DesktopTheme`, `AlertWhenComplete`, `AlertWhenCooled`, `AudioAlerts`, `VisualAlerts`, `AlwaysOnTop`, `RoundedUI`, `CheckForUpdatesOnLaunch`, `UpdateChannel`, `AutoDownloadUpdates`, `DiscordSync`, `WebhookUrl`, `DiscordUpdateIntervalMinutes`
- Keep: All WebUI-related, Spoolman, and camera settings
- Add validation functions: `isValidConfig()`, `sanitizeConfig()`

#### printer.ts

Port printer types exactly as-is:

```typescript
interface PrinterDetails {
  Name: string;
  IPAddress: string;
  SerialNumber: string;
  CheckCode: string;
  ClientType: 'legacy' | 'new';
  printerModel: string;
  modelType?: PrinterModelType;

  // Per-printer overrides
  customCameraEnabled?: boolean;
  customCameraUrl?: string;
  customLedsEnabled?: boolean;
  forceLegacyMode?: boolean;
  webUIEnabled?: boolean;
  rtspFrameRate?: number;
  rtspQuality?: number;
  activeSpoolData?: ActiveSpoolData | null;
}

interface StoredPrinterDetails extends PrinterDetails {
  lastConnected: string;  // ISO date
}

interface MultiPrinterConfig {
  lastUsedPrinterSerial: string | null;
  printers: Record<string, StoredPrinterDetails>;
}

type PrinterModelType =
  | 'Adventurer5M'
  | 'Adventurer5MPro'
  | 'Adventurer5MProLegacy'
  | 'AD5X'
  | 'GenericLegacy'
  | 'Unknown';

enum ContextConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error'
}
```

**Source:** `FlashForgeUI-Electron/src/types/printer.ts`

#### spoolman.ts

Port Spoolman types exactly:

```typescript
interface ActiveSpoolData {
  id: number;
  name: string;
  vendor: string | null;
  material: string | null;
  colorHex: string;
  remainingWeight: number;
  remainingLength: number;
  lastUpdated: string;
}

interface SpoolResponse {
  id: number;
  filament: {
    name: string;
    vendor: { name: string } | null;
    material: string | null;
    color_hex: string;
  };
  remaining_weight: number;
  remaining_length: number;
  // ... other fields
}
```

**Source:** `FlashForgeUI-Electron/src/types/spoolman.ts`

#### webui.ts

Port WebUI-specific types:

```typescript
interface PrinterStatus {
  // Status fields from polling data
}

interface WebSocketMessage {
  type: 'AUTH_SUCCESS' | 'STATUS_UPDATE' | 'SPOOLMAN_UPDATE' | 'COMMAND_RESULT' | 'ERROR' | 'PONG';
  data?: any;
  error?: string;
}

interface AuthToken {
  token: string;
  expiresAt: number;
}
```

### 1.2 Managers

#### ConfigManager

**Source:** `FlashForgeUI-Electron/src/managers/ConfigManager.ts` (lines 46-454)

**Create:** `src/managers/ConfigManager.ts`

**Key Features:**
- Load/save `config.json` to data directory
- Debounced saves (100ms)
- Config validation and sanitization
- Event emitter for config changes
- File locking to prevent concurrent writes

**Implementation Notes:**
- Use `process.cwd() + '/data'` instead of `app.getPath('userData')`
- Keep full structure from source
- Test edge cases: missing file, corrupted JSON, invalid values

**Critical Methods:**
```typescript
get(key: keyof AppConfig): any
set(key: keyof AppConfig, value: any): void
updateConfig(updates: Partial<AppConfig>): void
getConfig(): Readonly<AppConfig>
forceSave(): Promise<void>
```

#### PrinterDetailsManager

**Source:** `FlashForgeUI-Electron/src/managers/PrinterDetailsManager.ts` (lines 44-610)

**Create:** `src/managers/PrinterDetailsManager.ts`

**Key Features:**
- Load/save `printer_details.json`
- Manage per-printer settings
- Track last connected printer (global and per-context)
- Serial number lookup
- Validation of printer details

**Implementation Notes:**
- Store file in data directory: `data/printer_details.json`
- Maintain context-to-serial mapping (runtime only)
- Auto-update `lastConnected` timestamps

**Critical Methods:**
```typescript
getAllSavedPrinters(): StoredPrinterDetails[]
getSavedPrinter(serial: string): StoredPrinterDetails | null
savePrinter(details: PrinterDetails, contextId?: string, options?: SaveOptions): Promise<void>
removePrinter(serial: string): Promise<void>
getLastUsedPrinter(contextId?: string): StoredPrinterDetails | null
```

#### PrinterContextManager

**Source:** `FlashForgeUI-Electron/src/managers/PrinterContextManager.ts` (lines 57-337)

**Create:** `src/managers/PrinterContextManager.ts`

**Key Features:**
- Create/manage printer contexts
- Track active context
- Generate unique context IDs
- Emit events for lifecycle changes

**Context Structure:**
```typescript
interface PrinterContext {
  id: string;
  name: string;
  printerDetails: PrinterDetails;
  backend: BasePrinterBackend | null;
  connectionState: ContextConnectionState;
  pollingService: PrinterPollingService | null;
  notificationCoordinator: PrinterNotificationCoordinator | null;
  cameraProxyPort: number | null;
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
  activeSpoolId: number | null;
  activeSpoolData: ActiveSpoolData | null;
}
```

**Critical Methods:**
```typescript
createContext(details: PrinterDetails, options?: ContextOptions): string
getContext(contextId: string): PrinterContext | undefined
removeContext(contextId: string): void
getActiveContext(): PrinterContext | null
setActiveContext(contextId: string): void
getAllContexts(): PrinterContext[]
```

### 1.3 Printer Backends

**Source:** `FlashForgeUI-Electron/src/printer-backends/`

**Create:** `src/backends/`

Port all backend implementations:

1. **BasePrinterBackend.ts** - Abstract base class
2. **GenericLegacyBackend.ts** - Legacy printers
3. **Adventurer5MBackend.ts** - A5M specific
4. **Adventurer5MProBackend.ts** - A5M Pro specific
5. **AD5XBackend.ts** - AD5X series
6. **DualAPIBackend.ts** - Hybrid printers

**Key Implementation:**
- All backends use `@ghosttypes/ff-api` for printer communication
- Each backend implements printer-specific commands
- Backends emit events for status changes
- Handle connection errors gracefully

**No changes needed** - port 1:1 from source.

### 1.4 Environment Service

**Source:** `FlashForgeUI-Electron/src/services/EnvironmentService.ts`

**Create:** `src/services/EnvironmentService.ts`

**Changes Needed:**
```typescript
class EnvironmentService {
  isElectron(): boolean {
    return false;  // Always false in standalone
  }

  isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  getDataPath(): string {
    return path.join(process.cwd(), 'data');
  }

  getWebUIStaticPath(): string {
    if (this.isProduction()) {
      return path.join(__dirname, '../webui/static');
    }
    return path.join(process.cwd(), 'dist/webui/static');
  }
}
```

---

## Phase 2: Backend Services

### 2.1 Polling Services

#### PrinterPollingService

**Source:** `FlashForgeUI-Electron/src/services/PrinterPollingService.ts`

**Create:** `src/services/PrinterPollingService.ts`

**Key Features:**
- Poll printer backend at regular intervals (3 seconds)
- Emit polling data events
- Handle errors gracefully
- Support pause/resume

**Port exactly** - no changes needed.

#### MultiContextPollingCoordinator

**Source:** `FlashForgeUI-Electron/src/services/MultiContextPollingCoordinator.ts`

**Create:** `src/services/MultiContextPollingCoordinator.ts`

**Key Features:**
- Create polling service per context
- Adjust polling frequency based on active/inactive state
- Forward polling events with context ID
- Clean up on context removal

**Port exactly** - no changes needed.

### 2.2 State Monitors

#### MultiContextPrintStateMonitor

**Source:** `FlashForgeUI-Electron/src/services/MultiContextPrintStateMonitor.ts`

**Create:** `src/services/MultiContextPrintStateMonitor.ts`

**Key Features:**
- Track print state per context (idle, printing, paused, complete)
- Detect state transitions
- Emit events for state changes
- Used by Spoolman tracker and notifications

**Port exactly** - no changes needed.

#### MultiContextTemperatureMonitor

**Source:** `FlashForgeUI-Electron/src/services/MultiContextTemperatureMonitor.ts`

**Create:** `src/services/MultiContextTemperatureMonitor.ts`

**Key Features:**
- Monitor temperature per context
- Track cooling state
- Emit temperature events

**Port exactly** - no changes needed.

### 2.3 Camera Services

#### CameraProxyService

**Source:** `FlashForgeUI-Electron/src/services/CameraProxyService.ts` (lines 47-433)

**Create:** `src/services/CameraProxyService.ts`

**Key Features:**
- MJPEG camera proxy per context
- Port allocation (8181-8191)
- Multiple client support
- Auto-reconnection with exponential backoff
- 5-second grace period after last client disconnect

**Port exactly** - critical for camera streaming.

#### RtspStreamService

**Source:** `FlashForgeUI-Electron/src/services/RtspStreamService.ts` (lines 41-473)

**Create:** `src/services/RtspStreamService.ts`

**Key Features:**
- RTSP to MPEG1 transcoding via ffmpeg
- WebSocket streaming (ports 9000-9009)
- Platform-specific ffmpeg detection
- Stream cleanup on client disconnect

**Implementation Notes:**
- Detect ffmpeg in PATH on startup
- Handle missing ffmpeg gracefully (disable RTSP feature)
- Log clear error messages if ffmpeg not found

### 2.4 Spoolman Integration

#### SpoolmanService

**Source:** `FlashForgeUI-Electron/src/services/SpoolmanService.ts` (lines 31-218)

**Create:** `src/services/SpoolmanService.ts`

**Key Features:**
- REST API client for Spoolman server
- Search spools
- Get spool by ID
- Update usage (weight or length)
- Test connection

**Port exactly** - no changes needed.

#### SpoolmanIntegrationService

**Source:** `FlashForgeUI-Electron/src/services/SpoolmanIntegrationService.ts` (lines 45-474)

**Create:** `src/services/SpoolmanIntegrationService.ts`

**Key Features:**
- Manage active spool per context
- Persist spool data to printer details
- Detect AD5X printers (disable Spoolman)
- Emit events for spool changes

**Port exactly** - no changes needed.

#### SpoolmanUsageTracker

**Source:** `FlashForgeUI-Electron/src/services/SpoolmanUsageTracker.ts` (lines 52-269)

**Create:** `src/services/SpoolmanUsageTracker.ts`

**Key Features:**
- Listen for print-completed events
- Calculate usage from job metadata
- Update Spoolman server
- Prevent duplicate updates

**Port exactly** - no changes needed.

#### MultiContextSpoolmanTracker

**Source:** `FlashForgeUI-Electron/src/services/MultiContextSpoolmanTracker.ts` (lines 45-237)

**Create:** `src/services/MultiContextSpoolmanTracker.ts`

**Key Features:**
- Create usage tracker per context
- Wire to print state monitor
- Clean up on context removal

**Port exactly** - no changes needed.

### 2.5 Notification Services

#### MultiContextNotificationCoordinator

**Source:** `FlashForgeUI-Electron/src/services/MultiContextNotificationCoordinator.ts`

**Create:** `src/services/MultiContextNotificationCoordinator.ts`

**Key Features:**
- Coordinate notifications per context
- Listen to state monitors
- Emit notification events

**Changes Needed:**
- Remove desktop notification code (OS dialogs)
- Keep event emission for potential future use
- Simplify to only emit events, no actual notifications

**Optional:** Add Discord webhook support if desired (copy from `DiscordNotificationService`)

---

## Phase 3: WebUI Server

### 3.1 Express Server Setup

#### WebUIManager

**Source:** `FlashForgeUI-Electron/src/webui/server/WebUIManager.ts` (lines 79-738)

**Create:** `src/webui/WebUIManager.ts`

**Key Features:**
- Express app initialization
- Static file serving
- Route registration
- Admin privilege check (Windows)
- Server startup/shutdown
- Port binding (0.0.0.0)
- IP address detection

**Implementation Notes:**
- Keep authentication middleware
- Keep static file serving from `dist/webui/static`
- Keep IP detection logic (prefer 192.168.x.x)
- Handle EADDRINUSE and EACCES errors

**Startup Flow:**
1. Check admin privileges (Windows only)
2. Initialize Express app
3. Setup middleware (JSON, logging)
4. Serve static files
5. Register routes
6. Initialize WebSocket server
7. Start listening on configured port
8. Log access URL

### 3.2 Authentication

#### AuthService

**Source:** `FlashForgeUI-Electron/src/webui/server/AuthService.ts` (lines 28-158)

**Create:** `src/webui/AuthService.ts`

**Key Features:**
- Token generation (random 64-char hex)
- Token validation
- Token expiration (7 days)
- Token revocation
- Rate limiting (5 attempts in 15 minutes)

**Port exactly** - security is critical.

**Token Storage:**
- In-memory Map: `token -> { expiresAt: number }`
- No database needed

### 3.3 WebSocket Manager

#### WebSocketManager

**Source:** `FlashForgeUI-Electron/src/webui/server/WebSocketManager.ts` (lines 78-617)

**Create:** `src/webui/WebSocketManager.ts`

**Key Features:**
- WebSocket server on HTTP server
- Token authentication during upgrade
- Keep-alive ping/pong (30 seconds)
- Multi-tab support (multiple connections per token)
- Broadcast status updates to all clients
- Command execution (EXECUTE_GCODE, REQUEST_STATUS)

**Message Types:**
```typescript
// Client -> Server
{ type: 'REQUEST_STATUS' }
{ type: 'EXECUTE_GCODE', data: { command: 'M114' } }
{ type: 'PING' }

// Server -> Client
{ type: 'AUTH_SUCCESS' }
{ type: 'STATUS_UPDATE', data: <polling_data> }
{ type: 'SPOOLMAN_UPDATE', data: <spool_data> }
{ type: 'COMMAND_RESULT', data: { success: boolean, result?: any } }
{ type: 'ERROR', error: <message> }
{ type: 'PONG' }
```

**Port exactly** - critical for real-time updates.

### 3.4 REST API Routes

**Source:** `FlashForgeUI-Electron/src/webui/server/routes/`

**Create:** `src/webui/routes/`

Port all route files:

#### api-routes.ts

Master router that registers all sub-routes.

**Routes to Port:**
1. `printer-status-routes.ts` - GET status, features, material station
2. `printer-control-routes.ts` - POST pause/resume/cancel, LED, home
3. `temperature-routes.ts` - POST set temperatures
4. `filtration-routes.ts` - POST filtration control
5. `job-routes.ts` - GET jobs, POST start job
6. `camera-routes.ts` - GET camera status, proxy config
7. `context-routes.ts` - GET contexts, POST switch context
8. `theme-routes.ts` - GET/POST theme (public GET, protected POST)
9. `spoolman-routes.ts` - GET config/spools, POST select/clear

**Implementation Notes:**
- All routes except `/api/auth/*` and `/api/webui/theme` (GET) require authentication
- Use middleware: `requireAuth` from AuthService
- Validate request bodies with Zod schemas
- Return consistent error format: `{ error: string, details?: any }`

**Port exactly** - these are the API the frontend depends on.

---

## Phase 4: Frontend Implementation

### 4.1 Static File Structure

**Source:** `FlashForgeUI-Electron/src/webui/static/`

**Create:** `src/webui/static/`

**Files to Port:**

```
static/
├── index.html          # Main HTML file
├── webui.css          # Main stylesheet (31KB)
├── app.ts             # Entry point
├── tsconfig.json      # Frontend TS config
├── core/
│   ├── AppState.ts    # Central state management
│   └── Transport.ts   # HTTP/WebSocket client
├── features/
│   ├── authentication.ts
│   ├── camera.ts
│   ├── context-switching.ts
│   ├── job-control.ts
│   ├── layout-theme.ts
│   ├── material-matching.ts
│   └── spoolman.ts
├── ui/
│   ├── dialogs.ts
│   ├── header.ts
│   └── panels.ts
├── grid/
│   ├── WebUIGridManager.ts
│   ├── WebUILayoutPersistence.ts
│   ├── WebUIComponentRegistry.ts
│   ├── WebUIMobileLayoutManager.ts
│   └── types.ts
└── shared/
    ├── dom.ts
    ├── formatting.ts
    └── icons.ts
```

### 4.2 HTML Structure

**Source:** `FlashForgeUI-Electron/src/webui/static/index.html`

**Port exactly** - this is the UI structure.

**Key Elements:**
- Login screen (initially visible)
- Main UI (initially hidden)
- Header with printer selector, edit mode toggle, settings button
- Desktop GridStack container (`#webui-grid-desktop`)
- Mobile static container (`#webui-grid-mobile`)
- Modals: Settings, File Selection, Material Matching, Spoolman, Temperature

**External Dependencies (loaded via CDN or bundled):**
```html
<link rel="stylesheet" href="gridstack.min.css">
<link rel="stylesheet" href="gridstack-extra.min.css">
<link rel="stylesheet" href="webui.css">
<script src="lucide.min.js"></script>
<script src="jsmpeg.min.js"></script>
<script src="gridstack-all.js"></script>
<script type="module" src="app.js"></script>
```

### 4.3 CSS Styling

**Source:** `FlashForgeUI-Electron/src/webui/static/webui.css`

**Port exactly** - this defines the entire look and feel.

**Key Features:**
- Dark theme with CSS variables
- GridStack customizations
- Component panel styles
- Modal styles
- Mobile responsive (768px breakpoint)
- Theme color application via CSS variables

**CSS Variables:**
```css
:root {
  --theme-primary: <dynamic>;
  --theme-secondary: <dynamic>;
  --theme-background: <dynamic>;
  --theme-surface: <dynamic>;
  --theme-text: <dynamic>;
  --theme-primary-hover: <computed>;
  --theme-secondary-hover: <computed>;
}
```

### 4.4 TypeScript Modules

#### Core Modules

**AppState.ts** (lines 32-203)
- Central state management
- Track current context
- Track printer serial
- Track connection state
- Emit state change events

**Port exactly** - this is the frontend's source of truth.

**Transport.ts** (lines 28-189)
- HTTP client for REST API
- WebSocket client for real-time updates
- Auto-reconnection logic
- Event forwarding

**Port exactly** - critical for client-server communication.

#### Features

**authentication.ts** (lines 25-149)
- Login form handling
- Token storage (localStorage)
- Remember me functionality
- Logout functionality
- Auto-login on page load if token exists

**Port exactly.**

**camera.ts** (lines 32-246)
- Camera stream initialization
- MJPEG stream via img src
- RTSP stream via JSMpeg
- Handle camera unavailable
- Refresh stream button

**Port exactly.**

**context-switching.ts** (lines 27-131)
- Load all contexts from API
- Populate printer selector dropdown
- Handle context switch
- Update UI when context changes

**Port exactly.**

**job-control.ts** (lines 34-387)
- Pause/Resume/Cancel buttons
- File selection modal
- Local/Recent jobs API
- Start print with options (auto-level, start now)
- Material matching dialog (AD5X only)

**Port exactly.**

**layout-theme.ts** (lines 112-645)
- GridStack initialization
- Edit mode toggle
- Layout save/load from localStorage
- Theme application
- Theme save/load from API
- Mobile layout handling
- Settings modal

**Port exactly** - this is core to the customizable dashboard.

**material-matching.ts** (lines 29-341)
- Material station slot mapping
- Job requirements vs available slots
- Drag-and-drop or click-to-select mapping
- Validation (material types must match)
- Send mapping to API on print start

**Port exactly.**

**spoolman.ts** (lines 28-320)
- Load Spoolman config
- Fetch active spool
- Spool selection modal
- Search spools (debounced)
- Spool color indicators
- Clear active spool

**Port exactly.**

#### UI Modules

**dialogs.ts** (lines 22-184)
- Show/hide modals
- Toast notifications
- Temperature input dialog
- Generic dialog utilities

**Port exactly.**

**header.ts** (lines 26-127)
- Edit mode toggle button
- Settings button
- Connection indicator
- Logout button

**Port exactly.**

**panels.ts** (lines 38-512)
- Update panel content from polling data
- Camera panel
- Controls panel
- Printer state panel
- Temperature panel
- Filtration panel
- Job progress panel
- Model preview panel
- Spoolman panel

**Port exactly.**

#### Grid Modules

**WebUIGridManager.ts** (lines 37-320)
- GridStack wrapper
- Initialize with config
- Add/remove components
- Enable/disable edit mode
- Get current layout
- Load layout
- Clear grid

**Port exactly** - critical for layout management.

**WebUILayoutPersistence.ts** (lines 15-155)
- Save layout to localStorage (debounced 1000ms)
- Load layout from localStorage
- Save settings (hidden components)
- Load settings
- Validate layout structure
- Handle corrupted data

**Port exactly** - critical for persistence.

**WebUIComponentRegistry.ts** (lines 11-390)
- Define all 9 components
- Default sizes and positions
- HTML templates for each component
- Create component elements
- Get default layout

**Port exactly** - defines all UI components.

**WebUIMobileLayoutManager.ts** (lines 8-78)
- Predefined mobile component order
- Apply mobile layout (vertical stack)
- Clear mobile layout
- Component visibility handling

**Port exactly.**

#### Shared Modules

**dom.ts** (lines 14-83)
- DOM query helpers
- Safe element selection
- Event listener helpers

**Port exactly.**

**formatting.ts** (lines 11-68)
- Format numbers (decimals, percentages)
- Format time (seconds to HH:MM:SS)
- Format file sizes

**Port exactly.**

**icons.ts** (lines 27-77)
- Lucide icon hydration
- Convert icon names to PascalCase
- Initialize global icons (settings, lock, package, search, circle)

**Port exactly** - required for Lucide to work.

### 4.5 Build Process

#### TypeScript Configuration (WebUI)

**Create:** `src/webui/static/tsconfig.json`

```json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "outDir": "../../../dist/webui/static",
    "rootDir": ".",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules"]
}
```

#### Asset Copy Script

**Create:** `scripts/copy-webui-assets.js`

**Source:** `FlashForgeUI-Electron/scripts/copy-webui-assets.js`

**Function:**
- Copy `index.html`, `webui.css`, `gridstack-extra.min.css` to dist
- Copy vendor libraries from node_modules:
  - `gridstack/dist/gridstack-all.js`
  - `gridstack/dist/gridstack.min.css`
  - `lucide/dist/umd/lucide.min.js`
  - `@cycjimmy/jsmpeg-player/dist/jsmpeg-player.umd.min.js`

**Port exactly.**

---

## Phase 5: Integration & Testing

### 5.1 Main Entry Point

**Create:** `src/index.ts`

**Structure:**

```typescript
import { ConfigManager } from './managers/ConfigManager';
import { PrinterDetailsManager } from './managers/PrinterDetailsManager';
import { PrinterContextManager } from './managers/PrinterContextManager';
import { WebUIManager } from './webui/WebUIManager';
import { MultiContextPollingCoordinator } from './services/MultiContextPollingCoordinator';
import { CameraProxyService } from './services/CameraProxyService';
import { RtspStreamService } from './services/RtspStreamService';
import { SpoolmanIntegrationService } from './services/SpoolmanIntegrationService';
import { parseHeadlessArguments } from './utils/HeadlessArguments';
import { connectPrinter } from './utils/connection';

async function main() {
  // 1. Parse CLI arguments
  const args = parseHeadlessArguments();

  // 2. Initialize managers
  const configManager = new ConfigManager();
  const printerDetailsManager = new PrinterDetailsManager();
  const contextManager = new PrinterContextManager();

  // 3. Apply CLI overrides to config
  if (args.webuiPort) {
    configManager.set('WebUIPort', args.webuiPort);
  }
  if (args.webuiPassword) {
    configManager.set('WebUIPassword', args.webuiPassword);
  }
  configManager.set('WebUIEnabled', true);

  // 4. Initialize services
  const pollingCoordinator = new MultiContextPollingCoordinator(contextManager);
  const cameraProxy = new CameraProxyService();
  const rtspStream = new RtspStreamService();
  await rtspStream.initialize();

  const spoolmanService = new SpoolmanIntegrationService(
    contextManager,
    printerDetailsManager,
    configManager
  );

  // 5. Connect to printers
  await connectPrinters(args, printerDetailsManager, contextManager);

  // 6. Start WebUI server
  const webui = new WebUIManager(
    configManager,
    contextManager,
    printerDetailsManager,
    pollingCoordinator,
    cameraProxy,
    rtspStream,
    spoolmanService
  );

  await webui.start();

  // 7. Setup signal handlers
  setupGracefulShutdown(webui, contextManager, pollingCoordinator);

  console.log('FlashForgeWebUI started successfully');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

**Key Implementation:**
- Parse command line arguments (--webui-port, --webui-password, printer connection modes)
- Initialize all managers and services in correct order
- Connect to printers based on CLI args (last-used, all-saved, explicit IPs)
- Start WebUI server
- Handle SIGINT/SIGTERM for graceful shutdown

### 5.2 CLI Argument Parsing

**Source:** `FlashForgeUI-Electron/src/utils/HeadlessArguments.ts`

**Create:** `src/utils/HeadlessArguments.ts`

**Arguments:**
```
--webui-port=<port>              # Override WebUI port (default: 3000)
--webui-password=<password>      # Override WebUI password
--last-used                      # Connect to last used printer
--all-saved-printers             # Connect to all saved printers
--printers="IP:TYPE:CODE,..."    # Connect to specific printers
```

**Examples:**
```bash
node dist/index.js --webui-port=8080 --last-used
node dist/index.js --all-saved-printers
node dist/index.js --printers="192.168.1.100:new:12345678,192.168.1.101:legacy"
```

**Port exactly** - validates and parses arguments.

### 5.3 Connection Utilities

**Source:** `FlashForgeUI-Electron/src/utils/connection.ts` (if exists) or `index.ts` (lines 467-581)

**Create:** `src/utils/connection.ts`

**Functions:**

```typescript
async function connectPrinters(
  args: HeadlessConfig,
  printerDetailsManager: PrinterDetailsManager,
  contextManager: PrinterContextManager
): Promise<void>

async function connectToLastUsed(...): Promise<void>
async function connectToAllSaved(...): Promise<void>
async function connectToExplicitPrinters(...): Promise<void>
```

**Implementation:**
- Load printer details
- Create backend for each printer
- Create context for each printer
- Initialize polling, cameras, Spoolman trackers
- Handle connection errors gracefully

### 5.4 Data Directory Setup

**Create:** `src/utils/setup.ts`

**Function:**
```typescript
export function ensureDataDirectory(): void {
  const dataPath = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
}
```

**Call on startup** - ensure data directory exists before managers load config.

### 5.5 Testing Checklist

Manual testing tasks:

#### Backend Tests
- [ ] ConfigManager loads/saves config.json correctly
- [ ] ConfigManager validates and sanitizes invalid values
- [ ] PrinterDetailsManager loads/saves printer_details.json correctly
- [ ] PrinterContextManager creates contexts with unique IDs
- [ ] Backends connect to printers successfully
- [ ] Polling services emit data at correct intervals
- [ ] Camera proxy streams MJPEG correctly
- [ ] RTSP streaming works (if ffmpeg available)
- [ ] Spoolman integration fetches and updates spools correctly

#### WebUI Tests
- [ ] Server starts on configured port
- [ ] Login with correct password succeeds
- [ ] Login with incorrect password fails (rate limited after 5 attempts)
- [ ] Token authentication works
- [ ] WebSocket connection establishes after login
- [ ] Status updates received via WebSocket
- [ ] REST API endpoints return correct data
- [ ] Context switching works
- [ ] Printer controls (pause/resume/cancel) work
- [ ] Temperature controls work
- [ ] Job start works
- [ ] Camera stream displays correctly
- [ ] Spoolman spool selection works
- [ ] GridStack edit mode works
- [ ] Layout persistence works across page reload
- [ ] Theme changes apply correctly
- [ ] Mobile layout activates below 768px
- [ ] Multi-tab support works (multiple browser tabs)

#### Error Handling Tests
- [ ] Missing ffmpeg disables RTSP gracefully
- [ ] Network errors don't crash server
- [ ] Invalid config values are sanitized
- [ ] Corrupted localStorage is reset to defaults
- [ ] Printer connection failures are handled
- [ ] Port already in use error is clear
- [ ] Missing permissions error is clear (Windows)

---

## Phase 6: Build & Deployment

### 6.1 Build Targets

Use `pkg` to create standalone executables:

```json
{
  "scripts": {
    "build:linux": "npm run build && pkg . --targets node20-linux-x64 --output dist/flashforge-webui-linux-x64",
    "build:linux-arm": "npm run build && pkg . --targets node20-linux-arm64 --output dist/flashforge-webui-linux-arm64",
    "build:linux-armv7": "npm run build && pkg . --targets node20-linux-armv7 --output dist/flashforge-webui-linux-armv7",
    "build:win": "npm run build && pkg . --targets node20-win-x64 --output dist/flashforge-webui-win-x64.exe",
    "build:mac": "npm run build && pkg . --targets node20-macos-x64 --output dist/flashforge-webui-macos-x64",
    "build:mac-arm": "npm run build && pkg . --targets node20-macos-arm64 --output dist/flashforge-webui-macos-arm64"
  }
}
```

**Targets:**
- Linux x64
- Linux ARM64 (Raspberry Pi 4/5, Jetson Nano, etc.)
- Linux ARMv7 (Raspberry Pi Zero 2 W, Pi 3)
- Windows x64
- macOS x64
- macOS ARM64 (Apple Silicon)

### 6.2 Package Configuration

**package.json `pkg` field:**

```json
{
  "pkg": {
    "assets": [
      "dist/webui/**/*"
    ],
    "outputPath": "dist"
  }
}
```

**Ensures:**
- WebUI static files are bundled into executable
- Data directory is created at runtime

### 6.3 Deployment Structure

**Release Package:**

```
flashforge-webui-{platform}/
├── flashforge-webui(.exe)    # Executable
├── data/                      # Created on first run
│   ├── config.json
│   └── printer_details.json
├── README.md                  # Usage instructions
└── LICENSE
```

### 6.4 Configuration File

**Create:** `data/config.json` (auto-generated with defaults on first run)

**Create:** `data/printer_details.json` (auto-generated empty on first run)

### 6.5 Documentation

**Create:** `README.md` (user-facing)

**Contents:**
- Project description
- Installation instructions
- Running the server
- CLI arguments
- Accessing the WebUI
- Adding printers
- Configuring Spoolman
- RTSP camera setup (ffmpeg requirement)
- Troubleshooting

**Create:** `CONTRIBUTING.md` (developer-facing)

**Contents:**
- Development setup
- Build instructions
- Testing guidelines
- Code style
- Pull request process

---

## File Structure

Complete project structure:

```
flashforge-webui/
├── .dependencies/               # Manual dependencies (gitignored)
│   ├── ff-5mp-api-ts-1.0.0/
│   └── slicer-meta-1.1.0/
├── FlashForgeUI-Electron/      # Source reference (not gitignored)
├── src/
│   ├── index.ts                # Main entry point
│   ├── types/
│   │   ├── config.ts
│   │   ├── printer.ts
│   │   ├── spoolman.ts
│   │   └── webui.ts
│   ├── managers/
│   │   ├── ConfigManager.ts
│   │   ├── PrinterDetailsManager.ts
│   │   └── PrinterContextManager.ts
│   ├── backends/
│   │   ├── BasePrinterBackend.ts
│   │   ├── GenericLegacyBackend.ts
│   │   ├── Adventurer5MBackend.ts
│   │   ├── Adventurer5MProBackend.ts
│   │   ├── AD5XBackend.ts
│   │   └── DualAPIBackend.ts
│   ├── services/
│   │   ├── EnvironmentService.ts
│   │   ├── PrinterPollingService.ts
│   │   ├── MultiContextPollingCoordinator.ts
│   │   ├── MultiContextPrintStateMonitor.ts
│   │   ├── MultiContextTemperatureMonitor.ts
│   │   ├── MultiContextNotificationCoordinator.ts
│   │   ├── CameraProxyService.ts
│   │   ├── RtspStreamService.ts
│   │   ├── SpoolmanService.ts
│   │   ├── SpoolmanIntegrationService.ts
│   │   ├── SpoolmanUsageTracker.ts
│   │   └── MultiContextSpoolmanTracker.ts
│   ├── utils/
│   │   ├── HeadlessArguments.ts
│   │   ├── connection.ts
│   │   └── setup.ts
│   └── webui/
│       ├── WebUIManager.ts
│       ├── AuthService.ts
│       ├── WebSocketManager.ts
│       ├── routes/
│       │   ├── api-routes.ts
│       │   ├── printer-status-routes.ts
│       │   ├── printer-control-routes.ts
│       │   ├── temperature-routes.ts
│       │   ├── filtration-routes.ts
│       │   ├── job-routes.ts
│       │   ├── camera-routes.ts
│       │   ├── context-routes.ts
│       │   ├── theme-routes.ts
│       │   └── spoolman-routes.ts
│       └── static/
│           ├── index.html
│           ├── webui.css
│           ├── gridstack-extra.min.css
│           ├── app.ts
│           ├── tsconfig.json
│           ├── core/
│           │   ├── AppState.ts
│           │   └── Transport.ts
│           ├── features/
│           │   ├── authentication.ts
│           │   ├── camera.ts
│           │   ├── context-switching.ts
│           │   ├── job-control.ts
│           │   ├── layout-theme.ts
│           │   ├── material-matching.ts
│           │   └── spoolman.ts
│           ├── ui/
│           │   ├── dialogs.ts
│           │   ├── header.ts
│           │   └── panels.ts
│           ├── grid/
│           │   ├── WebUIGridManager.ts
│           │   ├── WebUILayoutPersistence.ts
│           │   ├── WebUIComponentRegistry.ts
│           │   ├── WebUIMobileLayoutManager.ts
│           │   └── types.ts
│           └── shared/
│               ├── dom.ts
│               ├── formatting.ts
│               └── icons.ts
├── scripts/
│   └── copy-webui-assets.js
├── data/                        # Created at runtime
│   ├── config.json
│   └── printer_details.json
├── dist/                        # Build output (gitignored)
├── .gitignore
├── package.json
├── tsconfig.json
├── eslint.config.js
├── BLUEPRINT.md                 # This file
├── CLAUDE.md                    # Setup instructions
├── README.md                    # User documentation
└── LICENSE
```

---

## Implementation Details

### Port Mapping

| Electron File | Standalone File | Changes |
|---------------|-----------------|---------|
| `src/index.ts` (Electron main) | `src/index.ts` | Remove Electron, BrowserWindow, IPC. Add CLI arg parsing and headless init. |
| `src/managers/ConfigManager.ts` | `src/managers/ConfigManager.ts` | Change `app.getPath('userData')` to `process.cwd() + '/data'`. Simplify config schema. |
| `src/managers/PrinterDetailsManager.ts` | `src/managers/PrinterDetailsManager.ts` | No changes. |
| `src/managers/PrinterContextManager.ts` | `src/managers/PrinterContextManager.ts` | No changes. |
| `src/managers/HeadlessManager.ts` | `src/index.ts` | Inline headless logic into main entry point. |
| `src/printer-backends/*.ts` | `src/backends/*.ts` | No changes. |
| `src/services/*.ts` | `src/services/*.ts` | Remove desktop notification logic from NotificationCoordinator. Keep all other services. |
| `src/webui/server/WebUIManager.ts` | `src/webui/WebUIManager.ts` | No changes. |
| `src/webui/server/AuthService.ts` | `src/webui/AuthService.ts` | No changes. |
| `src/webui/server/WebSocketManager.ts` | `src/webui/WebSocketManager.ts` | No changes. |
| `src/webui/server/routes/*.ts` | `src/webui/routes/*.ts` | No changes. |
| `src/webui/static/**/*` | `src/webui/static/**/*` | No changes. |
| `src/types/*.ts` | `src/types/*.ts` | Simplify config.ts (remove desktop-only fields). Keep all other types. |
| `src/utils/HeadlessArguments.ts` | `src/utils/HeadlessArguments.ts` | No changes. |

### Critical Dependencies

**Production:**
- `express` - HTTP server
- `ws` - WebSocket server
- `axios` - HTTP client (for Spoolman)
- `zod` - Schema validation
- `gridstack` - Grid layout library
- `lucide` - Icon library
- `@cycjimmy/jsmpeg-player` - RTSP video player
- `node-rtsp-stream` - RTSP to WebSocket streaming
- `@ghosttypes/ff-api` - FlashForge printer API
- `@parallel-7/slicer-meta` - Slicer metadata parser

**Development:**
- `typescript` - TypeScript compiler
- `eslint` - Linter
- `@typescript-eslint/*` - TypeScript ESLint plugins
- `concurrently` - Run multiple commands
- `rimraf` - Cross-platform rm -rf
- `pkg` - Package Node.js app into executable

### Build Steps

1. **Install dependencies:**
   ```bash
   # Setup manual dependencies (see CLAUDE.md)
   npm install
   ```

2. **Build backend:**
   ```bash
   npm run build:backend
   ```
   - Compiles `src/**/*.ts` to `dist/**/*.js`
   - Excludes `src/webui/static/**/*`

3. **Build frontend:**
   ```bash
   npm run build:webui
   ```
   - Compiles `src/webui/static/**/*.ts` to `dist/webui/static/**/*.js`
   - Copies HTML, CSS, and vendor libraries to `dist/webui/static/`

4. **Create executable:**
   ```bash
   npm run build:linux
   ```
   - Bundles dist/ into standalone executable
   - Includes Node.js runtime
   - No external dependencies needed (except ffmpeg for RTSP)

### Environment Variables

**Supported:**
- `NODE_ENV` - 'production' or 'development'
- `PORT` - Override WebUI port (overridden by CLI arg)
- `DATA_DIR` - Override data directory (default: `./data`)

**Example:**
```bash
NODE_ENV=production DATA_DIR=/var/lib/flashforge-webui ./flashforge-webui
```

### Logging Strategy

**Console Logging:**
- Startup messages (port, IP address, printers connected)
- Connection events (printer connected/disconnected)
- Error messages (config issues, connection failures)
- Debug logs (if `DebugMode` enabled in config)

**Future:** Add file logging with rotation (not in MVP).

### Security Considerations

1. **Authentication:** JWT-style tokens with 7-day expiration
2. **Rate Limiting:** 5 login attempts per 15 minutes per IP
3. **HTTPS:** Not implemented - users should use reverse proxy (nginx, Caddy)
4. **CORS:** Not implemented - WebUI served from same origin
5. **Input Validation:** All API endpoints validate inputs with Zod
6. **Token Storage:** In-memory only (lost on restart)

### Performance Optimizations

1. **Debounced Saves:** Config (100ms), Layout (1000ms)
2. **Efficient Polling:** 3-second intervals, stop when no clients connected
3. **WebSocket Compression:** Use `ws` permessage-deflate
4. **Static File Caching:** Enable HTTP caching headers
5. **Lazy Loading:** Vendor libraries loaded on demand

### Browser Compatibility

**Target Browsers:**
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

**Key Features Used:**
- ES2020 features
- CSS Grid
- CSS Custom Properties
- WebSockets
- Fetch API
- LocalStorage

---

## Development Workflow

### Initial Setup

1. Clone repository
2. Run dependency setup script (see CLAUDE.md)
3. Run `npm install`
4. Run `npm run build`
5. Run `npm start` or `npm run dev`

### Development Mode

```bash
npm run dev
```

**What it does:**
- Watches backend TypeScript files
- Watches frontend TypeScript files
- Auto-restarts server on changes
- Serves latest build

### Adding a New Feature

1. Add types to `src/types/`
2. Implement backend logic in `src/services/` or `src/managers/`
3. Add API routes in `src/webui/routes/`
4. Add frontend logic in `src/webui/static/features/`
5. Update UI in `src/webui/static/ui/`
6. Test manually
7. Update BLUEPRINT.md and README.md

### Code Style

- Use TypeScript strict mode
- Use `async/await` over callbacks
- Use ESLint recommended rules
- Use 2-space indentation
- Use single quotes for strings
- Add JSDoc comments for public APIs
- Use descriptive variable names
- Avoid `any` type (use `unknown` if needed)

---

## Future Enhancements

**Not in MVP, but consider for future:**

1. **User Management:** Multiple users, per-user layouts
2. **Printer Groups:** Organize printers into groups
3. **Print Queue:** Queue multiple jobs per printer
4. **File Management:** Upload .gcode files to server
5. **Timelapse:** Capture timelapse videos
6. **Notifications:** Web push notifications, email, SMS
7. **Webhooks:** Custom webhooks for events
8. **Plugins:** Plugin system for extensibility
9. **Mobile App:** Native iOS/Android app
10. **Cloud Sync:** Sync settings across devices
11. **HTTPS:** Built-in HTTPS support
12. **Docker:** Official Docker image
13. **Database:** PostgreSQL/SQLite for persistence
14. **Metrics:** Prometheus metrics endpoint
15. **Multi-Language:** i18n support

---

## Success Criteria

The implementation is complete when:

1. ✅ Server starts and listens on configured port
2. ✅ WebUI accessible in browser (login works)
3. ✅ Can connect to FlashForge printers (all supported models)
4. ✅ Polling data updates in real-time (WebSocket)
5. ✅ Printer controls work (pause, resume, cancel, temperatures)
6. ✅ Camera streaming works (MJPEG and RTSP)
7. ✅ Multi-printer support works (switch between printers)
8. ✅ GridStack layout editor works (drag, resize, save, load)
9. ✅ Theme customization works (colors, persistence)
10. ✅ Mobile layout works (responsive below 768px)
11. ✅ Spoolman integration works (select, track, update)
12. ✅ Job start works (with material matching for AD5X)
13. ✅ Config persistence works (reload after restart)
14. ✅ Per-printer settings work (custom cameras, etc.)
15. ✅ All features from FlashForgeUI-Electron WebUI work identically
16. ✅ No Electron dependencies in code
17. ✅ Builds for all target platforms (Linux x64/ARM, Windows, macOS)
18. ✅ No regressions from original implementation
19. ✅ No runtime errors in browser console
20. ✅ Documentation complete (README, CLAUDE.md, BLUEPRINT.md)

---

**END OF BLUEPRINT**

This blueprint provides comprehensive guidance for implementing the standalone FlashForgeWebUI. Follow the phases sequentially, referencing the source files in `FlashForgeUI-Electron/` for exact implementation details. Port code 1:1 wherever possible to minimize regressions.
