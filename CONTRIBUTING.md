# Contributing to FlashForge WebUI

Thanks for helping out. This guide covers how the branches work, how to get a working dev setup, what to check before you open a pull request, and how releases are cut.

## Branches: always work from `alpha`

| Branch | What it is |
| --- | --- |
| `alpha` | Where all development happens. Every alpha pre-release is cut from here. |
| `main` | The stable branch. It only changes when a finished alpha cycle is merged in for a stable release. Its README is the one most users see. |

**Branch from `alpha` and open your pull request against `alpha`.** A pull request against `main` will be asked to retarget, because `main` only receives the release merge described below.

```bash
git clone https://github.com/<your-username>/FlashForgeWebUI.git
cd FlashForgeWebUI
git checkout alpha
git checkout -b fix/short-description
```

Before you start, and again before you open the pull request, bring your branch up to date with `alpha`:

```bash
git remote add upstream https://github.com/Parallel-7/FlashForgeWebUI.git   # once
git fetch upstream
git rebase upstream/alpha
```

## How a release happens

1. Work lands on `alpha` through pull requests.
2. When a set of changes is ready for testers, an **alpha pre-release** (`vX.Y.Z-alpha.N`) is cut from `alpha`.
3. When the alpha cycle is stable, `alpha` is merged into `main` through a pull request.
4. The **stable release** (`vX.Y.Z`) is cut from `main`.
5. `alpha` is fast-forwarded to `main`, and the next alpha number starts there.

Contributors only take part in step 1. The rest is done by maintainers and is written down at the end of this file.

## Setting up

You need:

- **Node.js 20 or newer**
- **pnpm 10.23.0.** The version is pinned in `package.json`. The easiest way to get the right one is `corepack enable`. Do not use npm or yarn, and do not commit a `package-lock.json` or `yarn.lock`.
- **Go** (optional). Only `pnpm run docs:check` needs it.

Every dependency is on public npm. You do not need a GitHub token or an `.npmrc`.

```bash
pnpm install            # also downloads the go2rtc camera binary into resources/bin/
pnpm run build
pnpm start -- --no-printers
```

Open `http://localhost:3000`. The default password is `changeme`.

For day-to-day work, `pnpm run dev` rebuilds the backend and frontend on change and restarts the server.

Runtime state (config, saved printers, the thumbnail cache) is written to `data/`, which git ignores. Never commit anything from it: `data/printer_details.json` holds printer check codes, which are the printers' LAN passwords.

### No printer? Use the emulator

[flashforge-emulator-v2](https://github.com/GhostTypes/flashforge-emulator-v2) emulates the Adventurer 5M Pro, AD5X, Creator 5, and Creator 5 Pro on your machine. The E2E suite uses it, and you can point the WebUI at it by hand to try a change without real hardware.

## Project layout

```text
src/index.ts              Entry point: loads config, connects printers, starts the WebUI
src/managers/             Singleton coordinators (config, printer contexts, backends, connections)
src/printer-backends/     One backend per printer family, all extending BasePrinterBackend
src/services/             Polling, camera (go2rtc), Spoolman, Discord, discovery, monitoring
src/webui/server/         Express server, WebSocket, auth, and the API routes
src/webui/static/         Browser code (separate tsconfig, compiled to ES modules)
src/types/, src/utils/    Shared types and helpers
tests/e2e/                Playwright browser suite run against the emulator
```

`CLAUDE.md` at the repo root has a deeper architecture tour, covering the multi-printer context model, how backends are selected, and the event flow.

## Before you open a pull request

Run these. CI runs the same checks on every pull request to `alpha` and `main`:

```bash
pnpm run type-check
pnpm run lint
pnpm test
pnpm run build
```

Also worth running:

- `pnpm run docs:check` if you added a source file. Every file needs a `@fileoverview` header comment.
- `FF_EMULATOR_ROOT=/path/to/flashforge-emulator-v2 pnpm run test:e2e` if you touched the connection flow, the WebUI server, or anything a printer model gates. CI runs this suite too, so you can also let CI do it.

A note on formatting: the repo is checked out with CRLF line endings, but Biome expects LF, so `pnpm run check` and `pnpm run format` report format errors in files you never touched. Only fix the issues your change introduced. `pnpm run lint` is the check CI enforces.

## Conventions

- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/): `feat(scope): ...`, `fix(scope): ...`, `docs: ...`, `test: ...`, `ci: ...`, `build: ...`, `chore: ...`. Keep the subject short and describe the change, not the process.
- **Changelog.** If users would notice your change, add an entry under `## [Unreleased]` in `CHANGELOG.md`. Write it for users: what was wrong or missing, and what happens now.
- **New config keys** go in both `DEFAULT_CONFIG` (`src/types/config.ts`) and `data/config.example.json`.
- **Printer capabilities.** Gate features on what the backend declares, and on the API library's model flags (`isPro`, `isAD5X`, the product ID). Do not gate on the printer's name, because users can change it.
- **Printer API bugs** usually belong in the API library, [ff-5mp-api-ts](https://github.com/GhostTypes/ff-5mp-api-ts), not in a workaround here. Open an issue there, or mention it in your pull request.
- **The desktop app.** Much of the WebUI is shared with [FlashForgeUI-Electron](https://github.com/Parallel-7/FlashForgeUI-Electron). If you fix a bug in shared WebUI code, say so in the pull request so the fix can land in both.

## Pull requests

- Keep each pull request to one change. Small pull requests are reviewed faster.
- Say what you changed and why, and link the issue if there is one.
- Say how you tested it, including which printer models (real or emulated) you tried. Changes that talk to printers should be tried on real hardware or the emulator before review.
- Add or update tests for behavior you change, where it is practical.

## Reporting bugs

Open an [issue](https://github.com/Parallel-7/FlashForgeWebUI/issues) and include:

- The WebUI version. Click the info button in the top bar to see it.
- How you run it: release binary (which platform), from source, or Docker.
- The printer model and firmware version.
- What you expected, what happened, and the server's console output around the problem.

## For maintainers: cutting releases

Releases are built and published by the **Build and Release** workflow (`.github/workflows/release.yml`), which you start by hand from the Actions tab. It builds all six binaries, creates the `vX.Y.Z` tag at the commit it ran on, and publishes the GitHub release. The release body is the matching `## [X.Y.Z]` section of `CHANGELOG.md`, so that section must already be pushed. **Never create release tags by hand.**

### Alpha pre-release (from `alpha`)

1. Move the `[Unreleased]` entries into a new `## [X.Y.Z-alpha.N] - YYYY-MM-DD` section, and update the compare links at the bottom of `CHANGELOG.md`.
2. `pnpm version X.Y.Z-alpha.N --no-git-tag-version`
3. Commit (`chore(release): prepare X.Y.Z-alpha.N`) and push to `alpha`.
4. Run the workflow on `alpha` with the version and **pre-release** checked.

### Stable release (from `main`)

1. On `alpha`, write the `## [X.Y.Z]` changelog section. It becomes the release page for people upgrading from the last stable version, so lead with a summary of the whole alpha cycle and any upgrade notes. Then run `pnpm version X.Y.Z --no-git-tag-version`, commit, and push.
2. Open a pull request from `alpha` to `main`. Wait for CI to pass, then merge it with a **merge commit**. A squash or rebase merge would leave `main` and `alpha` with different histories.
3. Run the workflow on `main` with the version and **pre-release** unchecked.
4. Fast-forward `alpha` to `main`, then start the next cycle:

   ```bash
   git checkout alpha
   git pull --ff-only origin main
   git push origin alpha
   ```

### After any release

Check that the tag points at the commit you released:

```bash
git fetch --tags
git rev-list -n1 vX.Y.Z      # must match the branch head you released from
```
