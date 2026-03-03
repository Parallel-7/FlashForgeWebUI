#!/usr/bin/env node
/**
 * @fileoverview Downloads go2rtc binaries for all supported standalone targets.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VERSION = '1.9.13';
const BASE_URL = `https://github.com/AlexxIT/go2rtc/releases/download/v${VERSION}`;

const PLATFORMS = {
  'darwin-arm64': {
    filename: 'go2rtc_mac_arm64.zip',
    binary: 'go2rtc',
    isZip: true,
  },
  'darwin-x64': {
    filename: 'go2rtc_mac_amd64.zip',
    binary: 'go2rtc',
    isZip: true,
  },
  'linux-arm': {
    filename: 'go2rtc_linux_arm',
    binary: 'go2rtc',
    isZip: false,
  },
  'linux-arm64': {
    filename: 'go2rtc_linux_arm64',
    binary: 'go2rtc',
    isZip: false,
  },
  'linux-x64': {
    filename: 'go2rtc_linux_amd64',
    binary: 'go2rtc',
    isZip: false,
  },
  'win32-arm64': {
    filename: 'go2rtc_win_arm64.zip',
    binary: 'go2rtc.exe',
    isZip: true,
  },
  'win32-x64': {
    filename: 'go2rtc_win64.zip',
    binary: 'go2rtc.exe',
    isZip: true,
  },
};

function httpsGetWithRedirects(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const makeRequest = (currentUrl, redirectsLeft) => {
      const protocol = currentUrl.startsWith('https') ? https : http;

      protocol
        .get(currentUrl, { headers: { 'User-Agent': 'FlashForgeWebUI-Downloader' } }, (response) => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            if (redirectsLeft <= 0) {
              reject(new Error('Too many redirects'));
              return;
            }

            makeRequest(response.headers.location, redirectsLeft - 1);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode} for ${currentUrl}`));
            return;
          }

          resolve(response);
        })
        .on('error', reject);
    };

    makeRequest(url, maxRedirects);
  });
}

async function downloadFile(url, destinationPath) {
  console.log(`  Downloading: ${url}`);

  const response = await httpsGetWithRedirects(url);
  const totalBytes = Number.parseInt(response.headers['content-length'] || '0', 10);
  let downloadedBytes = 0;

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destinationPath);

    response.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      if (totalBytes > 0) {
        const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
        process.stdout.write(
          `\r  Progress: ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB)`
        );
      }
    });

    response.pipe(file);

    file.on('finish', () => {
      process.stdout.write('\n');
      file.close();
      resolve();
    });

    file.on('error', (error) => {
      fs.unlink(destinationPath, () => {});
      reject(error);
    });
  });
}

function extractZip(zipPath, destinationDir) {
  console.log(`  Extracting: ${zipPath}`);

  if (process.platform === 'win32') {
    execSync(
      `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destinationDir}' -Force"`,
      { stdio: 'inherit' }
    );
    return;
  }

  execSync(`unzip -o "${zipPath}" -d "${destinationDir}"`, { stdio: 'inherit' });
}

function makeExecutable(filePath) {
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
}

async function downloadPlatform(platformKey, config, resourcesDir) {
  console.log(`\n[${platformKey}]`);

  const platformDir = path.join(resourcesDir, 'bin', platformKey);
  const binaryPath = path.join(platformDir, config.binary);

  if (fs.existsSync(binaryPath)) {
    const stats = fs.statSync(binaryPath);
    console.log(
      `  Already exists: ${binaryPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`
    );
    return;
  }

  fs.mkdirSync(platformDir, { recursive: true });

  const downloadUrl = `${BASE_URL}/${config.filename}`;

  if (config.isZip) {
    const zipPath = path.join(platformDir, config.filename);
    await downloadFile(downloadUrl, zipPath);
    extractZip(zipPath, platformDir);
    fs.unlinkSync(zipPath);
  } else {
    await downloadFile(downloadUrl, binaryPath);
  }

  makeExecutable(binaryPath);

  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Binary not found after download: ${binaryPath}`);
  }

  const stats = fs.statSync(binaryPath);
  console.log(`  Success: ${binaryPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
}

async function main() {
  console.log('\n=== go2rtc Binary Downloader ===');
  console.log(`Version: v${VERSION}`);
  console.log(`Source: ${BASE_URL}`);

  const projectRoot = path.resolve(__dirname, '..');
  const resourcesDir = path.join(projectRoot, 'resources');

  console.log(`\nResources directory: ${resourcesDir}`);

  fs.mkdirSync(resourcesDir, { recursive: true });

  const platforms = Object.keys(PLATFORMS);
  let successCount = 0;
  let failureCount = 0;

  for (const platformKey of platforms) {
    try {
      await downloadPlatform(platformKey, PLATFORMS[platformKey], resourcesDir);
      successCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`  ERROR: ${message}`);
      failureCount += 1;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Downloaded: ${successCount}/${platforms.length}`);

  if (failureCount > 0) {
    console.log(`Failed: ${failureCount}`);
    process.exit(1);
    return;
  }

  console.log(`\ngo2rtc binaries are ready in: ${path.join(resourcesDir, 'bin')}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nFatal error: ${message}`);
  process.exit(1);
});
