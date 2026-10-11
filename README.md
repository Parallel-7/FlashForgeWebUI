<div align="center">
  <h1>FlashForge WebUI</h1>
</div>

<div align="center">
  Standalone WebUI for FlashForge 3D Printers
</div>

<div align="center">
  <img src="https://img.shields.io/badge/Node.js-20%2B-green?style=for-the-badge&logo=node.js&logoColor=white">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge">
  <img src="https://img.shields.io/badge/Platforms-Win%20%7C%20macOS%20%7C%20Linux-blue?style=for-the-badge">
</div>

<div align="center">
  <h2>Overview</h2>
</div>

FlashForge WebUI is a lightweight, standalone web interface for monitoring and controlling FlashForge 3D printers. Designed as a cross-platform alternative to desktop applications, it runs efficiently on low-spec hardware like the Raspberry Pi, making it perfect for dedicated print servers. It supports simultaneous connections to multiple printers, real-time camera streaming, and integrates seamlessly with Spoolman for filament management.

<div align="center">
  <h2>Core Features</h2>
</div>

<div align="center">

| Feature | Description |
| --- | --- |
| **Multi-Printer Support** | Connect to and manage multiple printers simultaneously with isolated contexts • Select the active printer by URL (`?ip=` / `?serial=`) for embedding in tools like OrcaSlicer's Device tab |
| **Live Monitoring** | Real-time tracking of temperatures, print progress, ETA, and printer status • Per-tool, bed, and chamber temperatures on the Creator 5 series |
| **Camera Streaming** | Low-latency video through go2rtc (WebRTC, MSE, MJPEG) • Video is tunneled through the authenticated WebUI port, so remote access needs only one forwarded port |
| **Printer Control** | Pause, resume, and cancel jobs • Temperatures, LEDs, filtration, and homing where the printer supports them • Start recent and local jobs with thumbnail previews |
| **Upload Job** | Upload a `.gcode`, `.gx`, or `.3mf` from any browser, review its thumbnail and slicer metadata, and start it • Tool-to-slot material matching for material-station printers |
| **Material Station** | Live IFS slot view (material and color) with a manual slot editor for the AD5X and Creator 5 series |
| **SSH Tools** | File manager, calibration assistant, and remote reboot for the Adventurer 5M, 5M Pro, and AD5X • Requires SSH set up with [FlashForge-EasySSH](https://github.com/Parallel-7/FlashForge-EasySSH) |
| **Spoolman Integration** | Filament usage tracking: the active spool on single-extruder printers, and per-job, per-tool tracking on material-station printers |
| **Discord Notifications** | Webhook notifications for print events, plus periodic status updates with optional camera snapshots |
| **Responsive Dashboard** | Customizable grid-based UI that works on desktop, tablet, and mobile |
| **Cross-Platform** | Native binaries for Windows, macOS, and Linux (x64, ARM64, ARMv7) |

</div>

<div align="center">
  <h2>Supported Printers</h2>
</div>

FlashForge WebUI supports a wide range of FlashForge printers through its adaptable backend architecture.

<div align="center">

| Series | Models | API Type |
| --- | --- | --- |
| **Adventurer 5M** | Adventurer 5M, 5M Pro | New (HTTP API) |
| **AD5X** | AD5X | New (HTTP API) |
| **Creator 5** | Creator 5, Creator 5 Pro | New (HTTP API) |
| **Legacy** | Older FlashForge Models | Legacy (FlashForgeClient) |

</div>

<div align="center">
  <h2>Installation</h2>
</div>

<div align="center">
  <h3>Prerequisites</h3>
</div>

<div align="center">

| Requirement | Details |
| --- | --- |
| **Node.js** | Version 20.0.0 or higher (for source installation) |
| **pnpm** | Pinned at 10.23.0 via Corepack (`corepack enable`) or installed globally |
| **Network** | Connection to your printer(s) |

</div>

<div align="center">
  <h3>Pre-built Binaries</h3>
</div>

Download the appropriate binary for your platform from the [Releases](https://github.com/Parallel-7/FlashForgeWebUI/releases) page:

<div align="center">

| Platform | Binary | Notes |
| --- | --- | --- |
| **Windows x64** | `flashforge-webui-win-x64.exe` | Most Windows PCs |
| **macOS x64** | `flashforge-webui-macos-x64.bin` | Intel Macs |
| **macOS ARM** | `flashforge-webui-macos-arm64.bin` | Apple Silicon (M1/M2/M3) |
| **Linux x64** | `flashforge-webui-linux-x64.bin` | Most Linux PCs |
| **Linux ARM64** | `flashforge-webui-linux-arm64.bin` | Raspberry Pi 4/5 (64-bit OS) |
| **Linux ARMv7** | `flashforge-webui-linux-armv7.bin` | Raspberry Pi 3/4 (32-bit OS) |

</div>

**Raspberry Pi Users:** Use `flashforge-webui-linux-arm64.bin` for 64-bit Raspberry Pi OS, or `flashforge-webui-linux-armv7.bin` for 32-bit.

```bash
# Make the binary executable (Linux/macOS)
chmod +x flashforge-webui-linux-arm64.bin

# Run with auto-connect to last used printer
./flashforge-webui-linux-arm64.bin --last-used

# Run without auto-connect
./flashforge-webui-linux-arm64.bin --no-printers
```

<div align="center">
  <h3>Running from Source</h3>
</div>

All dependencies — including the `@ghosttypes` and `@parallel-7` scoped packages — are public on npm: no `.npmrc`, token, or GitHub Packages access is needed to build from source.

```bash
# Clone the repository
git clone https://github.com/Parallel-7/FlashForgeWebUI.git
cd FlashForgeWebUI

# Install dependencies
pnpm install

# Build the application (required before first run)
pnpm run build

# Start the server
pnpm start

# Or start with auto-connect to last used printer
pnpm start -- --last-used
```

**Development Mode:**
```bash
# Build and watch for changes with hot reload
pnpm run dev
```

<div align="center">
  <h2>Usage</h2>
</div>

After starting the server, open your browser and navigate to:

```
http://localhost:3000
```

Or if accessing from another device on your network:

```
http://<server-ip>:3000
```

**Checking Your Version:** Click the info button in the top bar to open the About window. It shows the running version and links to the [Releases](https://github.com/Parallel-7/FlashForgeWebUI/releases) page, so you can see whether an update is available.

**Default Login:** The default password is `changeme`. You should change this in the active config file (by default `data/config.json`, or the directory pointed to by `DATA_DIR`) or via the `--webui-password` flag.

**Remote Access / Port Forwarding:** Everything the WebUI needs - including live camera streams - is served over the single WebUI port (default `3000`). If you expose the WebUI outside your LAN, forward **only** that port. Camera video is tunneled through the authenticated WebUI server, so do **not** forward the internal go2rtc streaming port (`1984`); it has no authentication of its own and should never be reachable from outside your machine's network.

<div align="center">
  <h2>Command Line Options</h2>
</div>

<div align="center">

| Option | Description |
| --- | --- |
| **--last-used** | Connect to the last used printer on startup |
| **--all-saved-printers** | Connect to all saved printers on startup |
| **--printers="IP:TYPE[:CODE[:SERIAL]],..."** | Connect to specific printers (TYPE: "new", "legacy", "creator-5", or "creator-5-pro"). SERIAL is required for the Creator 5 series |
| **--no-printers** | Start WebUI only, without connecting to any printer |
| **--webui-port=PORT** | Override the WebUI port (default: 3000) |
| **--webui-password=PASS** | Override the WebUI password |

</div>

<div align="center">
  <h2>Configuration</h2>
</div>

The application automatically creates a configuration file in the active data directory on first run. By default this is `data/config.json`.

By default, runtime data is stored in `./data` under the working directory. Set `DATA_DIR` to move configuration, logs, and saved printer state elsewhere.

```bash
# Linux/macOS
DATA_DIR=/path/to/flashforge-data pnpm start

# PowerShell
$env:DATA_DIR = 'C:\FlashForgeWebUI\data'
pnpm start
```

<div align="center">

| Setting | Default | Description |
| --- | --- | --- |
| **WebUIEnabled** | `true` | Enable/disable the web interface |
| **WebUIPort** | `3000` | Port for the web server |
| **WebUIPassword** | `changeme` | Login password (change this!) |
| **WebUIPasswordRequired** | `true` | Require password to access |
| **SpoolmanEnabled** | `false` | Enable Spoolman integration |
| **SpoolmanServerUrl** | `""` | Your Spoolman server URL (e.g., `http://192.168.1.100:7912`) |
| **SpoolmanUpdateMode** | `"weight"` | Report filament usage to Spoolman by `"weight"` or `"length"` |
| **DiscordSync** | `false` | Enable Discord webhook notifications |
| **WebhookUrl** | `""` | Your Discord webhook URL |
| **DiscordUpdateIntervalMinutes** | `5` | Minutes between periodic status updates |
| **DiscordIncludeCameraSnapshots** | `false` | Attach camera snapshots to Discord notifications |
| **DebugMode** | `false` | Enable verbose debug logging |

</div>

A full example lives in [`data/config.example.json`](data/config.example.json). It is reference only and is never read by the app.

<div align="center">
  <h2>Testing</h2>
</div>

```bash
# Jest unit/integration tests
pnpm test
pnpm run test:watch      # watch mode
pnpm run test:coverage   # coverage report

# TypeScript checks
pnpm run type-check

# Lint/format
pnpm run check

# Browser E2E suite against emulated printers (no real printer needed)
FF_EMULATOR_ROOT=/path/to/flashforge-emulator-v2 pnpm run test:e2e
```

Unit tests live alongside the source under `src/` (`*.test.ts`) and run through Jest. The browser E2E suite under `tests/e2e/` builds the app and drives it with Playwright against [flashforge-emulator-v2](https://github.com/GhostTypes/flashforge-emulator-v2). CI runs both on every push and pull request to `main` and `alpha`.

<div align="center">
  <h2>Building from Source</h2>
</div>

```bash
# Build for specific platform
pnpm run build:linux        # Linux x64
pnpm run build:linux-arm    # Linux ARM64 (Raspberry Pi 4/5)
pnpm run build:linux-armv7  # Linux ARMv7 (Raspberry Pi 3)
pnpm run build:win          # Windows x64
pnpm run build:mac          # macOS x64
pnpm run build:mac-arm      # macOS ARM (Apple Silicon)
```

<div align="center">
  <h2>Troubleshooting</h2>
</div>

<div align="center">

| Issue | Solution |
| --- | --- |
| **"Cannot GET /" or blank page when accessing WebUI** | If running from source: Make sure you ran `pnpm run build` before `pnpm start`<br>If using a pre-1.0.2 binary: Update to version 1.0.2 or later (fixes static file serving bug) |
| **"Permission denied" when running binary** | Run `chmod +x flashforge-webui-linux-*.bin` to make executable |
| **Port already in use** | Change the port in the active config file (default `data/config.json`, or the directory pointed to by `DATA_DIR`) or use `--webui-port=3001` |
| **Cannot connect to printer** | Ensure your printer is on the same network as the device running WebUI<br>Check that the printer's IP address is correct<br>For legacy printers, ensure TCP port 8899 is accessible<br>When adding a modern printer by hand, enter both its serial number and check code |
| **Camera works locally but not remotely** | Forward only the WebUI port (default `3000`). Video is tunneled through it, so the go2rtc port (`1984`) should never be forwarded |
| **`401 Unauthorized` from `npm.pkg.github.com` when installing** | Older versions pulled some packages from GitHub Packages through `package-lock.json`. Since 1.2.0 every dependency is on public npm and the project uses pnpm: update your checkout and run `pnpm install`, not `npm install` |
| **Selecting the correct binary for your platform** | Windows: `flashforge-webui-win-x64.exe`<br>macOS Intel: `flashforge-webui-macos-x64.bin`<br>macOS Apple Silicon: `flashforge-webui-macos-arm64.bin`<br>Linux x64: `flashforge-webui-linux-x64.bin`<br>Raspberry Pi (64-bit OS): `flashforge-webui-linux-arm64.bin`<br>Raspberry Pi (32-bit OS): `flashforge-webui-linux-armv7.bin`<br>Check your architecture with `uname -m` (x86_64 = x64, aarch64 = ARM64, armv7l = ARMv7) |

</div>

<div align="center">
  <h2>Contributing</h2>
</div>

<div align="center">

All development happens on the `alpha` branch. Fork the repo, branch from `alpha`, and open your pull request against `alpha`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the setup, checks, and release flow.

</div>

<div align="center">
  <h2>License</h2>
</div>

<div align="center">
  MIT License
</div>

<div align="center">
  <h2>Acknowledgments</h2>
</div>

<div align="center">

| Project | Role |
| --- | --- |
| **[ff-5mp-api-ts](https://github.com/GhostTypes/ff-5mp-api-ts)** | FlashForge API Client Library |
| **[slicer-meta](https://github.com/Parallel-7/slicer-meta)** | Printer Metadata & Model Utilities |
| **[FlashForgeUI-Electron](https://github.com/Parallel-7/FlashForgeUI-Electron)** | Original Desktop Application |
| **[Spoolman](https://github.com/Donkie/Spoolman)** | Filament Management |
| **[go2rtc](https://github.com/AlexxIT/go2rtc)** | Camera Streaming |

</div>
