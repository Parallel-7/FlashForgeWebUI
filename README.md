<div align="center">
  <h1>FlashForge WebUI</h1>
  <p>Standalone WebUI for FlashForge 3D Printers</p>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20%2B-green?style=for-the-badge&logo=node.js&logoColor=white">
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge">
  <img src="https://img.shields.io/badge/Platforms-Win%20%7C%20macOS%20%7C%20Linux-blue?style=for-the-badge">
</p>

<div align="center">
  <h2>Overview</h2>
</div>

<div align="center">

FlashForge WebUI is a lightweight, standalone web interface for monitoring and controlling FlashForge 3D printers. Designed as a cross-platform alternative to desktop applications, it runs efficiently on low-spec hardware like the Raspberry Pi, making it perfect for dedicated print servers. It supports simultaneous connections to multiple printers, real-time camera streaming, and integrates seamlessly with Spoolman for filament management.

</div>

<div align="center">
  <h2>Core Features</h2>
</div>

<div align="center">
<table>
  <tr>
    <th>Feature</th>
    <th>Description</th>
  </tr>
  <tr>
    <td>Multi-Printer Support</td>
    <td>Connect to and manage multiple printers simultaneously with isolated contexts</td>
  </tr>
  <tr>
    <td>Live Monitoring</td>
    <td>Real-time tracking of temperatures, print progress, and printer status</td>
  </tr>
  <tr>
    <td>Camera Streaming</td>
    <td>Low-latency video monitoring with RTSP and MJPEG support</td>
  </tr>
  <tr>
    <td>Printer Control</td>
    <td>Full control over print jobs (pause, resume, stop) and printer settings</td>
  </tr>
  <tr>
    <td>Spoolman Integration</td>
    <td>Native integration for filament inventory and usage tracking</td>
  </tr>
  <tr>
    <td>Responsive Dashboard</td>
    <td>Customizable grid-based UI that works on desktop, tablet, and mobile</td>
  </tr>
  <tr>
    <td>Cross-Platform</td>
    <td>Native binaries for Windows, macOS, and Linux (x64, ARM64, ARMv7)</td>
  </tr>
</table>
</div>

<div align="center">
  <h2>Supported Printers</h2>
</div>

<div align="center">

FlashForge WebUI supports a wide range of FlashForge printers through its adaptable backend architecture.

</div>

<div align="center">
<table>
  <tr>
    <th>Series</th>
    <th>Models</th>
    <th>API Type</th>
  </tr>
  <tr>
    <td>Adventurer 5M</td>
    <td>Adventurer 5M, 5M Pro</td>
    <td>New (FiveMClient)</td>
  </tr>
  <tr>
    <td>AD5X</td>
    <td>Adventurer 5M X Series</td>
    <td>New (AD5X API)</td>
  </tr>
  <tr>
    <td>Legacy</td>
    <td>Older FlashForge Models</td>
    <td>Legacy (FlashForgeClient)</td>
  </tr>
</table>
</div>

<div align="center">
  <h2>Installation</h2>
</div>

<div align="center">

**Prerequisites**

</div>

*   Node.js 20.0.0 or higher (for source installation)
*   Network connection to your printer(s)

<div align="center">

**Running from Source**

</div>

```bash
# Clone the repository
git clone https://github.com/Parallel-7/flashforge-webui.git
cd flashforge-webui

# Install dependencies
npm install

# Build the application
npm run build

# Start the server
npm start
```

<div align="center">
  <h2>Configuration</h2>
</div>

<div align="center">

The application automatically creates a configuration file at `data/config.json` on first run. You can modify this file to customize your experience.

</div>

```json
{
  "WebUIEnabled": true,
  "WebUIPort": 3000,
  "WebUIPassword": "changeme",
  "WebUIPasswordRequired": true,
  "SpoolmanEnabled": false,
  "SpoolmanServerUrl": "http://your-spoolman-instance:7912",
  "CameraProxyPort": 8181
}
```

<div align="center">
  <h2>Development</h2>
</div>

```bash
# Start development server with hot-reload
npm run dev

# Build for specific platform
npm run build:linux
npm run build:win
npm run build:mac
```

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
<table>
  <tr>
    <th>Project</th>
    <th>Role</th>
  </tr>
  <tr>
    <td>@ghosttypes/ff-api</td>
    <td>FlashForge API Client Library</td>
  </tr>
  <tr>
    <td>FlashForgeUI-Electron</td>
    <td>Original Desktop Application</td>
  </tr>
  <tr>
    <td>Spoolman</td>
    <td>Filament Management</td>
  </tr>
</table>
</div>
