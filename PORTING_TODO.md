# Porting TODO — drift from FlashForgeUI-Electron

Last sync: 2026-07-10 — the **SSH feature set** was ported from FlashForgeUI-Electron
(`alpha` branch) in one pass. This file tracks what was ported and what has NOT
yet been brought over, so future syncs know where the two codebases still diverge.

## Ported in the 2026-07-10 SSH sync

- **Types**: `src/types/{calibration,ssh-settings,file-manager,printer-power}.ts`
- **Calibration engine**: `src/services/calibration/**` (engine, parsers, shaper,
  report, ssh) + its 8 Jest suites, `src/managers/CalibrationManager.ts`
- **SSH stack**: `SSHSettingsService` (per-serial credential store,
  `ssh-settings.json` in the data dir), `SSHConnectionManager`/`SCPFileTransfer`
  (under `services/calibration/ssh/`), `FileManagerService` (SFTP listing /
  delete / rename / thumbnails), `PrinterRebootService` (reboot + reconnect
  monitor, REBOOT_STATUS WebSocket broadcasts)
- **Routes** (registered in `api-routes.ts`): `calibration-routes`,
  `file-manager-routes`, `ssh-settings-routes`, `printer-power-routes`
- **Static client**: `features/{file-manager,calibration,reboot,ssh}.ts` +
  `features/calibration/` (canvas visualizers + local types), topbar buttons
  (folder / gauge / power, hidden for unsupported models), the calibration and
  file-manager modals, the reboot confirm modal + progress overlay, the
  Settings → SSH section, `REBOOT_STATUS` handling in `core/Transport.ts`
- **New deps**: `ssh2`, `pdf-lib`, `pngjs` (+ `@types/ssh2`, `@types/pngjs`)
- **Utils**: `SecureStorage` (see caveat below), `isRebootSupportedModel` in
  `PrinterUtils`

### Port-specific caveats

- **`SecureStorage` is base64-only here.** The desktop app encrypts SSH
  passwords with Electron `safeStorage` (`enc:` prefix); this Node/pkg build has
  no OS keychain, so passwords are stored `plain:`-prefixed base64. An
  `ssh-settings.json` copied from the desktop app with `enc:` passwords resolves
  those to the easy-SSH default.
- **Passwords are write-only over the REST surface** (`GET /api/ssh-settings`
  returns only a `passwordIsCustom` flag). Keep this invariant when touching the
  routes.
- SSH features target **Adventurer 5M / 5M Pro / AD5X only** (flashforge-easyssh
  provisioning, default `root`/`flashforge`). Creator 5 / 5 Pro are intentionally
  unsupported for now.

## NOT yet ported (known drift from FlashForgeUI-Electron)

1. **`ifs-station` → `material-station` rename.** FFUI renamed the grid
   component (with saved-layout auto-migration) and made the filament palette
   per-printer-family (AD5X vs Creator 5) with CIEDE2000 color snapping in a
   shared `material-station` card. This repo still uses
   `features/ifs-station.ts`, `shared/ifs-palette.ts`, and the
   `ifs-station` component id.
2. **Newer FFUI static client.** FFUI's WebUI has grown: theme *profiles*
   (save/load named themes) in settings, updated component registry entries
   (`creator5-temperature` behaviors), camera bootstrap fixes, icon-hydration
   fixes covered by its browser Playwright suite. Diff
   `src/main/webui/static/**` against `src/webui/static/**` when syncing.
3. **Server route drift.** FFUI has additional/updated route modules (material
   station slot config, debug routes, updated spoolman/camera routes). Only the
   four SSH-feature route files were synced.
4. **Shared-type drift.** FFUI's `@shared/types` have evolved (web-api types,
   material station, polling payloads). This repo duplicates them under
   `src/types/` and they are NOT auto-synced.
5. **slicer-meta / ff-api versions.** Check dependency versions against FFUI
   when syncing job-upload/discovery behavior.
6. **Pre-existing `npm audit` findings.** 16 vulnerabilities (3 critical)
   reported at install time, unrelated to the SSH port — needs its own pass.

## Validation commands

`pnpm run type-check` → `pnpm run build` → `pnpm run lint` → `pnpm test` →
`pnpm run docs:check` (all passing as of the 2026-07-10 sync).
