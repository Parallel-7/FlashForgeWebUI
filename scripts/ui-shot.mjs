/**
 * @fileoverview Screenshot a WebUI screen headlessly, without running the app.
 *
 * Serves the built static WebUI over a throwaway HTTP server, opens one page in
 * headless Chromium, runs a fixture that fills the DOM with representative data,
 * and writes a PNG. No printer, no backend, no visible window - the point is to
 * see a layout change in seconds instead of building, launching and clicking
 * through the app to reach the screen.
 *
 * Usage:
 *   npm run build:webui            # fixtures render the built output
 *   node scripts/ui-shot.mjs upload
 *   node scripts/ui-shot.mjs matching --width 420 --height 900
 *   node scripts/ui-shot.mjs --all
 *
 * Add a screen by dropping a fixture in scripts/ui-shot-fixtures/ and listing it
 * in TARGETS below.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const staticRoot = path.join(repoRoot, 'dist', 'webui', 'static');

/** Screens this harness knows how to render. */
const TARGETS = {
  upload: {
    root: staticRoot,
    page: 'index.html',
    fixture: 'upload.mjs',
    clip: '#job-upload-modal .modal-content',
  },
  matching: {
    root: staticRoot,
    page: 'index.html',
    fixture: 'matching.mjs',
    clip: '#material-matching-modal .modal-content',
  },
};

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function parseArgs(argv) {
  const options = { targets: [], out: null, width: 1200, height: 1000 };

  let index = 0;

  while (index < argv.length) {
    const arg = argv[index];
    index += 1;

    if (arg === '--all') {
      options.targets = Object.keys(TARGETS);
    } else if (arg === '--out') {
      options.out = argv[index];
      index += 1;
    } else if (arg === '--width') {
      options.width = Number(argv[index]);
      index += 1;
    } else if (arg === '--height') {
      options.height = Number(argv[index]);
      index += 1;
    } else if (!arg.startsWith('-')) {
      options.targets.push(arg);
    }
  }

  return options;
}

/** Static file server, scoped to one directory. */
function serve(root) {
  const server = http.createServer((req, res) => {
    const relative = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.join(root, relative);

    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }

    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function shoot(name, options, browser) {
  const target = TARGETS[name];
  if (!target) {
    throw new Error(`Unknown target "${name}". Known: ${Object.keys(TARGETS).join(', ')}`);
  }
  if (!fs.existsSync(path.join(target.root, target.page))) {
    throw new Error(`${target.page} not found in ${target.root} - run "npm run build:webui" first.`);
  }

  const server = await serve(target.root);
  const { port } = server.address();
  const page = await browser.newPage({
    viewport: { width: options.width, height: options.height },
  });

  // The page's modules expect a live backend; their failures are irrelevant here
  // because the fixture puts the DOM into the state we want to look at.
  page.on('pageerror', () => {});

  try {
    await page.goto(`http://127.0.0.1:${port}/${target.page}`, { waitUntil: 'domcontentloaded' });

    const fixture = await import(
      pathToFileURL(path.join(scriptDir, 'ui-shot-fixtures', target.fixture)).href
    );
    await fixture.default(page);

    const outPath = options.out || path.join(repoRoot, '.ui-shots', `${name}.png`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const clip = target.clip ? page.locator(target.clip) : page;
    await clip.screenshot({ path: outPath });

    console.log(`${name} -> ${outPath}`);
  } finally {
    await page.close();
    server.close();
  }
}

const options = parseArgs(process.argv.slice(2));
if (options.targets.length === 0) {
  console.log(`Usage: node scripts/ui-shot.mjs <target|--all> [--out file] [--width n] [--height n]
Targets: ${Object.keys(TARGETS).join(', ')}`);
  process.exit(1);
}

const browser = await chromium.launch();
try {
  for (const name of options.targets) {
    await shoot(name, options, browser);
  }
} finally {
  await browser.close();
}
