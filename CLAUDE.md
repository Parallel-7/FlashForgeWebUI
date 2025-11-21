# Claude Code Setup Instructions for FlashForgeWebUI

## Project Overview

This is a standalone WebUI implementation for FlashForge 3D printers, ported from the FlashForgeUI-Electron project. Unlike the Electron-based desktop application, this is a pure Node.js server application that runs the WebUI in headless mode.

## Why Manual Dependencies Are Required

Two critical dependencies are hosted on GitHub Packages, which requires authentication:
- `@ghosttypes/ff-api` - FlashForge 5M/Pro printer API client
- `@parallel-7/slicer-meta` - Slicer file metadata parser

**The Issue:** GitHub Package authentication does not work reliably in this environment, so we manually download and build these dependencies from their GitHub releases.

## Setting Up Dependencies (Required for Every Session)

### Step 1: Download and Build ff-5mp-api-ts

```bash
cd /home/user/FlashForgeWebUI
mkdir -p .dependencies
cd .dependencies

# Download v1.0.0
curl -L -o ff-5mp-api-ts.zip https://github.com/GhostTypes/ff-5mp-api-ts/archive/refs/tags/1.0.0.zip
unzip -q ff-5mp-api-ts.zip
rm ff-5mp-api-ts.zip

# Build the library
cd ff-5mp-api-ts-1.0.0
npm install
npm run build
cd ..
```

### Step 2: Download and Build slicer-meta

```bash
# Still in .dependencies directory
curl -L -o slicer-meta.zip https://github.com/Parallel-7/slicer-meta/archive/refs/tags/v1.1.0.zip
unzip -q slicer-meta.zip
rm slicer-meta.zip

# Build the library
cd slicer-meta-1.1.0
npm install
npm run build
cd ../..
```

### Step 3: Link Dependencies in package.json

After downloading and building, your `package.json` should reference these local dependencies:

```json
{
  "dependencies": {
    "@ghosttypes/ff-api": "file:.dependencies/ff-5mp-api-ts-1.0.0",
    "@parallel-7/slicer-meta": "file:.dependencies/slicer-meta-1.1.0"
  }
}
```

### Step 4: Install Project Dependencies

```bash
cd /home/user/FlashForgeWebUI
npm install
```

## Verification

To verify the setup worked:

```bash
# Check that the dependencies are linked
ls -la node_modules/@ghosttypes/ff-api
ls -la node_modules/@parallel-7/slicer-meta

# Both should be symlinks pointing to .dependencies/
```

## Reference Repository

The source FlashForgeUI-Electron repository is cloned at:
```
/home/user/FlashForgeWebUI/FlashForgeUI-Electron
```

**Branch:** alpha

**DO NOT delete this directory** - it contains the source code we're porting from.

## Important Notes

1. **The `.dependencies/` folder is gitignored** - it must be rebuilt in every Claude Code session
2. **Library versions are pinned** - v1.0.0 for ff-api, v1.1.0 for slicer-meta
3. **Both libraries are TypeScript** - they require `npm run build` to generate dist/ folders
4. **npm install in main project** - must be run after setting up dependencies

## Troubleshooting

### "Cannot find module '@ghosttypes/ff-api'"

The dependency wasn't linked correctly. Ensure:
- You ran `npm run build` in each library folder
- The `dist/` folders exist in each library
- You ran `npm install` in the main project after setting up dependencies

### "ENOENT: no such file or directory"

The `.dependencies` folder structure is incorrect. Verify:
```bash
ls .dependencies/
# Should show:
# ff-5mp-api-ts-1.0.0/
# slicer-meta-1.1.0/
```

### Build Errors

If builds fail:
1. Delete `node_modules` in the library folder
2. Re-run `npm install`
3. Re-run `npm run build`

## Quick Setup Script

For convenience, you can run all setup commands at once:

```bash
#!/bin/bash
cd /home/user/FlashForgeWebUI

# Download and build ff-api
mkdir -p .dependencies && cd .dependencies
curl -L -o ff-5mp-api-ts.zip https://github.com/GhostTypes/ff-5mp-api-ts/archive/refs/tags/1.0.0.zip
unzip -q ff-5mp-api-ts.zip && rm ff-5mp-api-ts.zip
cd ff-5mp-api-ts-1.0.0 && npm install && npm run build && cd ..

# Download and build slicer-meta
curl -L -o slicer-meta.zip https://github.com/Parallel-7/slicer-meta/archive/refs/tags/v1.1.0.zip
unzip -q slicer-meta.zip && rm slicer-meta.zip
cd slicer-meta-1.1.0 && npm install && npm run build && cd ../..

# Install main project dependencies
npm install

echo "✓ Dependencies setup complete"
```
