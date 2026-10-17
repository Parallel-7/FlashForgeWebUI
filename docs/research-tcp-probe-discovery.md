# Research: TCP-probe usage in the automatic discovery/connection path

**Scope:** Standalone FlashForgeWebUI (web UI server + headless CLI). Research only — no code changed.
**Question:** Can the TCP M115 probe be removed from the *automatic UDP-discovery → connect* path for modern printers, keeping it only for genuine legacy printers?

**Short answer:** **Yes, for modern printers.** The UDP broadcast already carries the two things the TCP probe is actually used for on modern printers — the USB product ID (authoritative model identity) and the serial number. The TCP probe is only *required* for genuine legacy printers (140-byte broadcast, no productId/serial), where the probe socket is also reused as the runtime control channel.

---

## 1. UDP broadcast vs TCP probe — what each provides

### UDP broadcast (`src/services/PrinterDiscoveryService.ts`, `parsePrinterResponse`)
- **Modern packet (≥276 bytes)** — `PrinterDiscoveryService.ts:257-273`:
  - `name` → `readNullTerminatedAscii(0x00, 132)` (L258)
  - `serialNumber` → `readNullTerminatedAscii(0x92, 130)` (L259)
  - `commandPort` → `readUInt16BE(0x84)` (L265)
  - `eventPort` → `readUInt16BE(0x8e)` (L266)
  - **`productId` → `readUInt16BE(0x88)`** (L269) — the USB product ID, authoritative for model identity
- **Legacy packet (140 ≤ len < 276)** — `PrinterDiscoveryService.ts:275-284`:
  - `name` → `readNullTerminatedAscii(0x00, 128)` (L275)
  - `commandPort` → `readUInt16BE(0x84)` (L281)
  - `serialNumber: ''` (hardcoded empty, L280) — **no serial, no productId, no eventPort**

### TCP M115 probe (`FlashForgeClient.getPrinterInfo()` → `PrinterInfo`)
Source of truth: `node_modules/@ghosttypes/ff-api/dist/tcpapi/replays/PrinterInfo.d.ts` and `FlashForgeClient.d.ts:195`.
Fields: `TypeName`, `Name`, `FirmwareVersion`, `SerialNumber`, `Dimensions`, `MacAddress`, `ToolCount`.

**Which of those the app actually consumes** (`createTemporaryConnection`, `ConnectionEstablishmentService.ts:129-308`): only `TypeName` (L228), `Name` (L233), `SerialNumber` (L234). `FirmwareVersion` is dead — it appears **only** in the type defs (`src/types/printer.ts:85,95`) and is never read for any branching decision (confirmed by grep). `Dimensions`/`MacAddress`/`ToolCount` are unused. The probe also returns a `_reuseableClient` (L248) — but **only in the legacy branch** (`!familyInfo.is5MFamily`, L241).

---

## 2. Table — TCP-probe outputs, consumers, alternatives, verdict

| TCP-probe output | Used by (file:line) | Non-TCP alternative | Verdict |
|---|---|---|---|
| **`TypeName`** (model identity) | detection route `detectPrinterFamily` (`printer-detection-routes.ts:88`); headless `detectPrinterModelType` (`ConnectionFlowManager.ts:597,1262`); backend selection via `printerModel` (`PrinterBackendManager.ts:185,269`) | UDP `productId`@0x88 → `NEW_API_PRODUCT_IDS` (`PrinterUtils.ts:132-138`); post-pairing `client.isPro`/`isAD5X`/`info.Pid` (per CLAUDE.md) | **Removable for modern printers** (productId covers 5M/5M Pro/AD5X/Creator 5/5 Pro). **Required for legacy** (no productId in legacy packet). |
| **`SerialNumber`** | FiveMClient auth `serial+checkCode` (`ConnectionEstablishmentService.ts:383-386`); saved-printer keying (`ConnectionFlowManager.ts:600-604,1260`); `/detect`→`/connect` handoff (`printer-detection-routes.ts:77-81`) | UDP `serialNumber`@0x92 (modern 276-byte packet only) | **Removable for modern** (broadcast carries it). **Required fallback** when broadcast serial is empty. |
| **`Name`** (user-assigned) | display name (`ConnectionFlowManager.ts:590-593`) | UDP `name`@0x00 | **Removable** (broadcast carries it). |
| **`FirmwareVersion`** | nothing | HTTP `/detail` after pairing | **Already removable** (dead code — unused). |
| `Dimensions` / `MacAddress` / `ToolCount` | nothing | n/a | **Already removable** (unused). |
| **`_reuseableClient`** (reusable TCP control socket) | `establishLegacyConnection` (`ConnectionEstablishmentService.ts:474-499`) | none — TCP **is** the legacy transport | **REQUIRED for legacy printers only.** |

---

## 3. The HTTP-only short-circuit (quoted verbatim)

`src/services/ConnectionEstablishmentService.ts:136-153`:

```ts
    // HTTP-only models (Creator 5 / 5 Pro) run no legacy TCP server, so the usual
    // TCP probe can't work. When discovery's USB product ID identifies such a model,
    // synthesize the type info from the discovery packet and skip the TCP probe.
    const idModelType = detectPrinterModelTypeFromId(printer.productId, '');
    if (isHttpOnlyModel(idModelType)) {
      const typeName = getModelDisplayName(idModelType);
      console.log(`[Connection] HTTP-only model detected via product ID: ${typeName}`);
      this.emit('printer-type-detected', { typeName, familyInfo: detectPrinterFamily(typeName) });
      return {
        success: true,
        typeName,
        printerInfo: {
          Name: printer.name,
          SerialNumber: printer.serialNumber,
          TypeName: typeName,
        } as unknown as ExtendedPrinterInfo,
      };
    }
```

**Logic:**
1. Compute `idModelType = detectPrinterModelTypeFromId(printer.productId, '')` — keyed **only** on productId (typeName arg is `''`).
2. If `isHttpOnlyModel(idModelType)` (i.e. `creator-5`/`creator-5-pro`, `PrinterUtils.ts:98-102`), skip the TCP probe.
3. Return synthesized result: `typeName` = display name (e.g. `"Creator 5"`); `Name` and `SerialNumber` copied straight from the discovery packet (`printer.name` / `printer.serialNumber` — the latter can be `''`).

The dual-API product IDs (5M/5M Pro/AD5X = 35/36/38) deliberately do **not** short-circuit — proven by `src/services/ConnectionEstablishmentService.test.ts:38-64` ("does not short-circuit for dual-API product IDs", productId 35). **This test is the exact line that a removal change would flip.**

---

## 4. Caller graph of the TCP probe (`createTemporaryConnection`)

Grep-confirmed consumers:
- `/api/printers/detect` — `printer-detection-routes.ts:68` (frontend detect step).
- `connectHeadlessDirect` — `ConnectionFlowManager.ts:1241` (the `/connect` route + `--printers=` CLI).
- `connectToPrinter` — `ConnectionFlowManager.ts:573` (interactive/Electron-era flow; **not invoked by any HTTP route or `src/index.ts`** — vestigial in the standalone WebUI).
- `establishLegacyConnection` — `ConnectionEstablishmentService.ts:478` (reached only for genuine legacy printers; reuses the probe socket).

**Startup path (`src/index.ts:124,159,177`) uses only `connectHeadlessFromSaved` / `connectHeadlessDirect`.** `connectHeadlessFromSaved → connectWithSavedDetails` calls `establishFinalConnection` directly (L944) — **no probe** for saved-printer reconnects. So the probe is *not* run at startup for already-saved printers; it only runs for the live discover/manual-direct path.

---

## 5. Creator 5 serial flow, end-to-end

### Case A — discovered Creator 5 **with** a serial in the broadcast (276-byte packet, serial@0x92 populated)
1. Discovery returns `DiscoveredPrinter{ productId:40|41, serialNumber:"<SN>", name, ports }`.
2. Frontend `connectToDiscoveredPrinter(ip, serial, …)` — `printer-discovery.ts:336`.
   - `POST /api/printers/detect` body `{ ipAddress, commandPort, httpPort, productId }` — **serial is NOT forwarded** (`printer-discovery.ts:361-366`).
   - detect route builds `mockPrinter.serialNumber = ''` (body has no serial, `printer-detection-routes.ts:60`); `createTemporaryConnection` short-circuits on productId; returns `SerialNumber: ''`.
   - detect route returns `serialNumber: ''` (`printer-detection-routes.ts:77-81,99`).
   - Frontend: `detectedSerial = serialNumber || serial` = `'' || "<SN>"` = `"<SN>"` (`printer-discovery.ts:375`). ✓
   - `POST /api/printers/connect` body includes `serialNumber:"<SN>"`, `productId:40` (`printer-discovery.ts:403-421`).
3. connect route: `serialNumber` is truthy → the http-only serial guard at `printer-management-routes.ts:66-76` passes → `connectHeadlessDirect([spec])`.
4. Headless: `createTemporaryConnection` (mock has productId+serial) short-circuits; `probedSerial = spec.serialNumber` (`ConnectionFlowManager.ts:1254-1260`); model refined from `primaryClient.model` (`ConnectionFlowManager.ts:1303-1310`); `establishDualAPIConnection(httpOnly=true)` creates the FiveMClient with serial+checkCode (`ConnectionEstablishmentService.ts:389,394`).
   - **→ One-click connect works today when the broadcast carries the serial.** ✓

### Case B — discovered Creator 5 **without** a serial (broadcast serial@0x92 empty/missing)
1. Discovery returns `serialNumber:''` (modern packet) or the legacy packet (no serial field at all).
2. `connectToDiscoveredPrinter(ip, serial='', …)`:
   - `/detect` returns `serialNumber:''`; frontend `detectedSerial = '' || '' = ''`.
   - `/connect` body: `serialNumber:''` → in the route:
     ```ts
     // printer-management-routes.ts:58-76
     const serialNumber =
       typeof body.serialNumber === 'string' && body.serialNumber.trim() !== ''
         ? body.serialNumber.trim()
         : undefined;
     if (
       typeof productId === 'number' &&
       isHttpOnlyModel(detectPrinterModelTypeFromId(productId, '')) &&
       !serialNumber
     ) {
       return sendErrorResponse(res, 400, 'Serial number is required for Creator 5 series printers');
     }
     ```
   - **→ 400 "Serial number is required for Creator 5 series printers".** ✗

The manual-connect path can never hit this 400, because `connectManually` requires a serial for any modern type (`printer-discovery.ts:480-489`) and supplies the productId hint (`MANUAL_PRODUCT_ID_HINTS`, `printer-discovery.ts:27-30,476`).

---

## 6. Recommendation

**TCP probing can be removed from the automatic discovery path for modern printers.** The minimal, low-risk change is to **generalize the existing HTTP-only short-circuit to all new-API product IDs**, keeping the TCP probe as the fallback for genuine-legacy/unknown cases:

1. **`src/services/ConnectionEstablishmentService.ts:139-153`** — widen the guard from `isHttpOnlyModel(idModelType)` to "productId present and resolves to a known new-API model", i.e. roughly:
   `if (printer.productId !== undefined && printer.productId in NEW_API_PRODUCT_IDS) { …synthesize from productId + broadcast name + broadcast serial… }`
   This single change removes the TCP probe from `/detect` and `connectHeadlessDirect` for 5M/5M Pro/AD5X, exactly as it already does for Creator 5/5 Pro.
2. **`src/services/ConnectionEstablishmentService.test.ts:38-64`** — the "does not short-circuit for dual-API product IDs" test encodes the *current* (probe-runs) behavior and must be rewritten to assert synthesis for productId 35/36/38.
3. **Optional polish (not required for correctness):** have the frontend discover path forward the discovered serial to `/detect` (`printer-discovery.ts:361-366`) so the detect response is self-contained. Not strictly needed — `printer-discovery.ts:375` (`serialNumber || serial`) already falls back to the discovered serial.
4. **Keep the TCP probe as the fallback** in `createTemporaryConnection` for: `productId === undefined`, `productId === 0`, or any value not in `NEW_API_PRODUCT_IDS` (genuine legacy + unknown). Legacy printers *must* keep it — it is their runtime control channel (`_reuseableClient`, `ConnectionEstablishmentService.ts:241-250,474-499`).

**Nothing else forces TCP to stay** for modern printers. The runtime dual-API TCP socket (secondary `FlashForgeClient` for G-code, `ConnectionEstablishmentService.ts:427-452`) is unrelated to the *probe* and would remain; only the redundant *type-detection* TCP connection goes away.

### CLAUDE.md rationale reconciliation
CLAUDE.md states the TCP-first M115 bootstrap is "correct and intentional" because `/detail` requires auth before pairing. That was true when the only pre-auth sources of model identity were `/detail` (auth-gated) and the TCP M115. The codebase has since added the **UDP `productId`@0x88** as a pre-auth, authoritative model-identity source (`NEW_API_PRODUCT_IDS`, `PrinterUtils.ts:132-138`) — the HTTP-only short-circuit already relies on it. So for the **UDP-discovery** path specifically, broadcast `productId` + broadcast serial make the probe redundant. The CLAUDE.md note's general point still holds for the auth-gated `/detail` and for manual-IP connects where no productId is supplied.

---

## 7. Unknowns needing firmware/hardware confirmation

1. **productId@0x88 reliability for dual-API printers** — is it always populated and non-zero on 5M / 5M Pro / AD5X across firmware versions? (Already trusted for Creator 5.) Safe by fallback: a `0`/absent value falls through to the TCP probe, so a misconfigured field degrades gracefully rather than breaking.
2. **broadcast serial@0x92 reliability** — is it reliably populated for modern dual-API printers? If empty, the synthesized path returns `serial:''`; the discover path then degrades to the `Unknown-${Date.now()}` fallback (`ConnectionFlowManager.ts:613-616,1260`), which breaks saved-printer keying. Creator 5 already depends on this field being usable (the 400 in Case B).
3. **Whether the synthesized display-name TypeName (e.g. `"Adventurer 5M Pro"`) stored as `printerModel` is acceptable** vs. the firmware string `"FlashForge Adventurer 5M Pro"`. The headless path refines it from `primaryClient.model` (`ConnectionFlowManager.ts:1303-1310`); the `/detect`-driven path does not. Cosmetic/consistency only — `detectPrinterFamily`/`detectPrinterModelType` use substring matching and accept either.
4. **Vestigial interactive flow** — `startConnectionFlow`/`tryAutoConnect`/`connectToPrinter`/`connectDirectlyToIP` are not wired to any WebUI route or `index.ts`. Confirm they are truly dead before relying on that claim; if kept, widening the guard removes TCP there too (harmless).
