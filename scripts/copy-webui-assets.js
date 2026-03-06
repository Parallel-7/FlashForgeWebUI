#!/usr/bin/env node

/**
 * Copy WebUI static assets from source to build output directory.
 *
 * This script copies HTML, CSS, and other static files from src/webui/static/
 * to dist/webui/static/ as part of the webui build process.
 */

const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

// Configuration
const srcDir = 'src/webui/static';
const destDir = 'dist/webui/static';
const filesToCopy = ['index.html', 'webui.css', 'gridstack-extra.min.css', 'favicon.png'];

// Vendor library to copy from node_modules
const vendorLibraries = [
  {
    src: 'node_modules/gridstack/dist/gridstack-all.js',
    dest: 'gridstack-all.js',
  },
  {
    src: 'node_modules/gridstack/dist/gridstack.min.css',
    dest: 'gridstack.min.css',
  },
  {
    src: 'node_modules/lucide/dist/umd/lucide.min.js',
    dest: 'lucide.min.js',
  },
];

// Local lib files to copy
const libFiles = [
  {
    src: 'src/webui/static/lib/video-rtc.js',
    dest: 'lib/video-rtc.js',
  },
];

const GREEN = '\u001B[32m';
const YELLOW = '\u001B[33m';
const RED = '\u001B[31m';
const RESET = '\u001B[0m';
const GREEN_DOT = `${GREEN}•${RESET}`;
const YELLOW_DOT = `${YELLOW}•${RESET}`;
const RED_CROSS = `${RED}✖${RESET}`;

function logInfo(message) {
  console.log(`  ${GREEN_DOT} ${message}`);
}

function logWarn(message) {
  console.warn(`  ${YELLOW_DOT} ${message}`);
}

function logError(message) {
  console.error(`  ${RED_CROSS} ${message}`);
}

function createBuildId() {
  const version = packageJson.version || 'dev';
  return `${version}-${Date.now().toString(36)}`;
}

function isLocalAssetPath(assetPath) {
  return (
    !assetPath.startsWith('http://') &&
    !assetPath.startsWith('https://') &&
    !assetPath.startsWith('//') &&
    !assetPath.startsWith('data:')
  );
}

function appendVersion(assetPath, buildId) {
  const [pathWithQuery, hash = ''] = assetPath.split('#', 2);
  const [cleanPath] = pathWithQuery.split('?', 1);
  const versionedPath = `${cleanPath}?v=${buildId}`;

  return hash ? `${versionedPath}#${hash}` : versionedPath;
}

function rewriteHtmlAssetUrls(content, buildId) {
  const assetAttributePattern = /(\b(?:href|src)=["'])([^"']+\.(?:css|js|png))(?:\?[^"']*)?(["'])/g;
  const inlineModulePattern =
    /((?:import|export)\s+(?:[^'"]*?\s+from\s+)?["'])(\.{1,2}\/[^"']+\.js)(?:\?[^"']*)?(["'])/g;

  const withVersionedAttributes = content.replace(
    assetAttributePattern,
    (match, prefix, assetPath, suffix) => {
      if (!isLocalAssetPath(assetPath)) {
        return match;
      }

      return `${prefix}${appendVersion(assetPath, buildId)}${suffix}`;
    }
  );

  return withVersionedAttributes.replace(
    inlineModulePattern,
    (_match, prefix, assetPath, suffix) => {
      return `${prefix}${appendVersion(assetPath, buildId)}${suffix}`;
    }
  );
}

function rewriteModuleImports(content, buildId) {
  const staticImportPattern =
    /((?:import|export)\s+(?:[^'"]*?\s+from\s+)?["'])(\.{1,2}\/[^"']+\.js)(?:\?[^"']*)?(["'])/g;
  const dynamicImportPattern =
    /(\bimport\s*\(\s*["'])(\.{1,2}\/[^"']+\.js)(?:\?[^"']*)?(["']\s*\))/g;

  const withStaticImports = content.replace(
    staticImportPattern,
    (_match, prefix, assetPath, suffix) => {
      return `${prefix}${appendVersion(assetPath, buildId)}${suffix}`;
    }
  );

  return withStaticImports.replace(dynamicImportPattern, (_match, prefix, assetPath, suffix) => {
    return `${prefix}${appendVersion(assetPath, buildId)}${suffix}`;
  });
}

function getModuleFiles(rootDir) {
  const moduleDirectories = ['core', 'features', 'grid', 'shared', 'ui'];
  const moduleFiles = [path.join(rootDir, 'app.js')];

  for (const directory of moduleDirectories) {
    const directoryPath = path.join(rootDir, directory);
    if (!fs.existsSync(directoryPath)) {
      continue;
    }

    const pendingPaths = [directoryPath];
    while (pendingPaths.length > 0) {
      const currentPath = pendingPaths.pop();
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          pendingPaths.push(entryPath);
          continue;
        }

        if (entry.isFile() && entry.name.endsWith('.js')) {
          moduleFiles.push(entryPath);
        }
      }
    }
  }

  return moduleFiles;
}

function applyBuildStamp(rootDir) {
  const buildId = createBuildId();
  const indexPath = path.join(rootDir, 'index.html');

  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    fs.writeFileSync(indexPath, rewriteHtmlAssetUrls(indexContent, buildId), 'utf8');
  }

  for (const modulePath of getModuleFiles(rootDir)) {
    const moduleContent = fs.readFileSync(modulePath, 'utf8');
    fs.writeFileSync(modulePath, rewriteModuleImports(moduleContent, buildId), 'utf8');
  }

  logInfo(`applied webui build stamp ${buildId}`);
}

// Main function
function copyWebUIAssets() {
  try {
    // Ensure destination directory exists
    fs.mkdirSync(destDir, { recursive: true });
    logInfo(`created directory ${destDir}`);

    // Copy each file
    let copiedCount = 0;
    for (const fileName of filesToCopy) {
      const srcPath = path.join(srcDir, fileName);
      const destPath = path.join(destDir, fileName);

      // Check if source file exists
      if (!fs.existsSync(srcPath)) {
        logWarn(`source file missing ${srcPath}`);
        continue;
      }

      // Copy the file
      fs.copyFileSync(srcPath, destPath);
      logInfo(`copied ${fileName}`);
      copiedCount++;
    }

    logInfo(`webui asset copy complete ${copiedCount}/${filesToCopy.length}`);

    // Copy vendor libraries
    let vendorCount = 0;
    for (const vendor of vendorLibraries) {
      const srcPath = vendor.src;
      const destPath = path.join(destDir, vendor.dest);

      // Check if source file exists
      if (!fs.existsSync(srcPath)) {
        logWarn(`vendor library missing ${srcPath}`);
        continue;
      }

      // Copy the vendor library
      fs.copyFileSync(srcPath, destPath);
      logInfo(`copied vendor library ${vendor.dest}`);
      vendorCount++;
    }

    logInfo(`vendor library copy complete ${vendorCount}/${vendorLibraries.length}`);

    // Copy lib files
    let libCount = 0;
    for (const lib of libFiles) {
      const srcPath = lib.src;
      const destPath = path.join(destDir, lib.dest);

      // Ensure lib subdirectory exists
      const libDir = path.dirname(destPath);
      fs.mkdirSync(libDir, { recursive: true });

      // Check if source file exists
      if (!fs.existsSync(srcPath)) {
        logWarn(`lib file missing ${srcPath}`);
        continue;
      }

      // Copy the lib file
      fs.copyFileSync(srcPath, destPath);
      logInfo(`copied lib file ${lib.dest}`);
      libCount++;
    }

    logInfo(`lib file copy complete ${libCount}/${libFiles.length}`);
    applyBuildStamp(destDir);
  } catch (error) {
    logError(`error copying WebUI assets: ${error.message}`);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  copyWebUIAssets();
}

module.exports = { copyWebUIAssets };
