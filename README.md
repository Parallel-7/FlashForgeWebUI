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
| **Multi-Printer Support** | Connect to and manage multiple printers simultaneously with isolated contexts |
| **Live Monitoring** | Real-time tracking of temperatures, print progress, and printer status |
| **Camera Streaming** | Low-latency video monitoring with RTSP and MJPEG support |
| **Printer Control** | Full control over print jobs (pause, resume, stop) and printer settings |
| **Spoolman Integration** | Native integration for filament inventory and usage tracking |
| **Responsive Dashboard** | Customizable grid-based UI that works on desktop, tablet, and mobile |
| **Cross-Platform** | Native binaries for Windows, macOS, and Linux (x64, ARM64, ARMv7) |

</div>

<div align="center">
  <h2>Supported Printers</h2>
  <p>FlashForge WebUI supports a wide range of FlashForge printers through its adaptable backend architecture.</p>
</div>

<div align="center">

| Series | Models | API Type |
| --- | --- | --- |
| **Adventurer 5M** | Adventurer 5M, 5M Pro | New (HTTP API) |
| **AD5X** | AD5X | New (HTTP API) |
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
| **Network** | Connection to your printer(s) |

</div>

<div align="center">
  <h3>Pre-built Binaries</h3>
  <p>Download the appropriate binary for your platform from the <a href="https://github.com/Parallel-7/FlashForgeWebUI/releases">Releases</a> page:</p>
</div>

<div align="center">

| Platform | Binary | Notes |
| --- | --- | --- |
| **Windows x64** | `flashforge-webui-win-x64.exe` | Most Windows PCs |
| **macOS x64** | `flashforge-webui-macos-x64` | Intel Macs |
| **macOS ARM** | `flashforge-webui-macos-arm64` | Apple Silicon (M1/M2/M3) |
| **Linux x64** | `flashforge-webui-linux-x64` | Most Linux PCs |
| **Linux ARM64** | `flashforge-webui-linux-arm64` | Raspberry Pi 4/5 (64-bit OS) |
| **Linux ARMv7** | `flashforge-webui-linux-armv7` | Raspberry Pi 3/4 (32-bit OS) |

</div>

```bash
# Make the binary executable (Linux/macOS)
chmod +x flashforge-webui-linux-arm64

# Run with auto-connect to last used printer
./flashforge-webui-linux-arm64 --last-used

# Run without auto-connect
./flashforge-webui-linux-arm64 --no-printers
```

<div align="center">
  <h3>Running from Source</h3>
</div>

```bash
# Clone the repository
git clone https://github.com/Parallel-7/FlashForgeWebUI.git
cd FlashForgeWebUI

# Install dependencies
npm install

# Build the application (required before first run)
npm run build

# Start the server
npm start

# Or start with auto-connect to last used printer
npm start -- --last-used
```

<div align="center">
  <h3>Development Mode:</h3>
</div>

```bash
# Build and watch for changes with hot reload
npm run dev
```

<div align="center">
  <h2>Usage</h2>
  <p>After starting the server, open your browser and navigate to:</p>
</div>

```
http://localhost:3000
```
<div align="center">
  <p>Or if accessing from another device on your network:</p>
</div>

```
http://<server-ip>:3000
```

**Default Login:** The default password is `changeme`. You should change this in `data/config.json` or via the `--webui-password` flag.

<div align="center">
  <h2>Command Line Options</h2>
</div>

<div align="center">

| Option | Description |
| --- | --- |
| **--last-used** | Connect to the last used printer on startup |
| **--all-saved-printers** | Connect to all saved printers on startup |
| **--printers="IP:TYPE:CODE,..."** | Connect to specific printers (TYPE: "new" or "legacy") |
| **--no-printers** | Start WebUI only, without connecting to any printer |
| **--webui-port=PORT** | Override the WebUI port (default: 3000) |
| **--webui-password=PASS** | Override the WebUI password |

</div>

<div align="center">
  <h2>Configuration</h2>
  <p>The application automatically creates a configuration file at data/config.json on first run.</p>
</div>


<div align="center">

| Setting | Default | Description |
| --- | --- | --- |
| **WebUIEnabled** | `true` | Enable/disable the web interface |
| **WebUIPort** | `3000` | Port for the web server |
| **WebUIPassword** | `changeme` | Login password (change this!) |
| **WebUIPasswordRequired** | `true` | Require password to access |
| **SpoolmanEnabled** | `false` | Enable Spoolman integration |
| **SpoolmanServerUrl** | `""` | Your Spoolman server URL (e.g., `http://192.168.1.100:7912`) |
| **CameraProxyPort** | `8181` | Starting port for camera proxies |

</div>

<div align="center">
  <h2>Building from Source</h2>
</div>

```bash
# Build for specific platform
npm run build:linux        # Linux x64
npm run build:linux-arm    # Linux ARM64 (Raspberry Pi 4/5)
npm run build:linux-armv7  # Linux ARMv7 (Raspberry Pi 3)
npm run build:win          # Windows x64
npm run build:mac          # macOS x64
npm run build:mac-arm      # macOS ARM (Apple Silicon)
```

<div align="center">
  <h2>Troubleshooting</h2>
</div>

<div align="center">

| Issue | Solution |
| --- | --- |
| **"Cannot GET /" or blank page when accessing WebUI** | If running from source: Make sure you ran `npm run build` before `npm start`<br>If using a pre-1.0.2 binary: Update to version 1.0.2 or later (fixes static file serving bug) |
| **"Permission denied" when running binary** | Run `chmod +x flashforge-webui-linux-*` to make executable |
| **Port already in use** | Change the port in `data/config.json` or use `--webui-port=3001` |
| **Cannot connect to printer** | Ensure your printer is on the same network as the device running WebUI<br>Check that the printer's IP address is correct<br>For legacy printers, ensure TCP port 8899 is accessible |
| **Selecting the correct binary for your platform** | Windows: `flashforge-webui-win-x64.exe`<br>macOS Intel: `flashforge-webui-macos-x64`<br>macOS Apple Silicon: `flashforge-webui-macos-arm64`<br>Linux x64: `flashforge-webui-linux-x64`<br>Raspberry Pi (64-bit OS): `flashforge-webui-linux-arm64`<br>Raspberry Pi (32-bit OS): `flashforge-webui-linux-armv7`<br>Check your architecture with `uname -m` (x86_64 = x64, aarch64 = ARM64, armv7l = ARMv7) |

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
| [**Spoolman**](https://github.com/Donkie/Spoolman) | Filament Management |

</div>
