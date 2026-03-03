import { type BuildOptions, build, context } from 'esbuild';
import * as fs from 'fs/promises';
import * as path from 'path';

const DIST_DIR = path.join(process.cwd(), 'dist');
const OUTFILE = path.join(DIST_DIR, 'index.js');
const WATCH_FLAG = '--watch';

const buildOptions: BuildOptions = {
  entryPoints: ['src/index.ts'],
  outfile: OUTFILE,
  bundle: true,
  charset: 'utf8',
  format: 'cjs',
  keepNames: true,
  legalComments: 'none',
  logLevel: 'info',
  packages: 'external',
  platform: 'node',
  sourcemap: true,
  target: ['node20'],
  treeShaking: false,
  tsconfig: 'tsconfig.json',
};

async function ensureDistDirectory(): Promise<void> {
  await fs.mkdir(DIST_DIR, { recursive: true });
}

async function runBuild(): Promise<void> {
  await ensureDistDirectory();
  await build(buildOptions);
}

async function runWatch(): Promise<void> {
  await ensureDistDirectory();

  const buildContext = await context(buildOptions);

  const shutdown = async (): Promise<void> => {
    await buildContext.dispose();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });

  await buildContext.watch();
  process.stdout.write('[build-backend] Watching for backend changes...\n');

  await new Promise(() => {
    // Keep the process alive while esbuild runs in watch mode.
  });
}

async function main(): Promise<void> {
  if (process.argv.includes(WATCH_FLAG)) {
    await runWatch();
    return;
  }

  await runBuild();
}

void main().catch((error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
