/**
 * @fileoverview Material-station dashboard card + slot editor (AD5X + Creator 5).
 *
 * Renders the four material-station slots as a grid card (swatch + material,
 * mirroring the desktop FlashForgeUI card) that refreshes from the printer's
 * cached material-station status on each status tick. The AD5X calls this the
 * "IFS"; the Creator 5 series calls it the "Material Station" — same card, the
 * only difference is the fixed filament palette, resolved per model via
 * {@link ../shared/ifs-palette.js} `getPaletteForModel`. Clicking a slot opens a
 * manual editor modal: a material dropdown and a grid of the recognized color
 * swatches, pre-seeded from the slot's current state. When Spoolman is
 * configured, the editor also offers a "Set from Spoolman" shortcut that
 * pre-fills the selections (snapped to the model's palette) for review before
 * applying. The chosen material/color are written via the slot-config route,
 * which calls the library's `configureSlot` (which normalizes the color `#` per
 * model on the wire).
 */

import type {
  MaterialSlotInfo,
  MaterialStationStatus,
  MaterialStationStatusResponse,
  SlotConfigResponse,
  SpoolSummary,
} from '../app.js';
import { state } from '../core/AppState.js';
import { apiRequest } from '../core/Transport.js';
import { $, showToast } from '../shared/dom.js';
import { getPaletteForModel } from '../shared/ifs-palette.js';
import { getCurrentContextId } from './context-switching.js';
import { openSpoolPicker } from './spoolman.js';

let cardHandlersRegistered = false;
/** Latest material-station status, used to seed the editor when a slot is clicked. */
let latestStation: MaterialStationStatus | null = null;

function getRawSpoolColor(spool: SpoolSummary): string | null {
  if (spool.rawColorHex) {
    return spool.rawColorHex;
  }
  if (spool.multiColorHexes) {
    const first = spool.multiColorHexes.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  return null;
}

// ============================================================================
// DASHBOARD CARD
// ============================================================================

/** The card root element (created once by the grid; may be hidden if removed from the layout). */
function getCardPanel(): HTMLElement | null {
  return $('ifs-station-panel');
}

function setCardState(panel: HTMLElement, which: 'unavailable' | 'disconnected' | 'active'): void {
  panel.querySelectorAll('.ifs-card-state').forEach((el) => {
    el.classList.add('hidden');
  });
  panel.querySelector(`.ifs-card-${which}`)?.classList.remove('hidden');
}

/** Render the four slots (swatch + material) from the material-station status. */
function renderIfsCard(status: MaterialStationStatus | null): void {
  const panel = getCardPanel();
  if (!panel) {
    return;
  }

  if (!status) {
    setCardState(panel, 'unavailable');
    return;
  }
  if (!status.connected) {
    setCardState(panel, 'disconnected');
    return;
  }

  setCardState(panel, 'active');
  for (let n = 1; n <= 4; n++) {
    const slotEl = panel.querySelector(`.ifs-card-slot[data-slot="${n}"]`);
    if (!slotEl) {
      continue;
    }
    const data = status.slots.find((s) => s.slotId + 1 === n);
    const swatch = slotEl.querySelector('.ifs-card-swatch') as HTMLElement | null;
    const material = slotEl.querySelector('.ifs-card-slot-material') as HTMLElement | null;
    const empty = !data || data.isEmpty;

    slotEl.classList.toggle('empty', empty);
    slotEl.classList.toggle('active', !empty && status.activeSlot === n);

    if (swatch) {
      if (!empty && data?.materialColor) {
        swatch.style.backgroundColor = data.materialColor.startsWith('#')
          ? data.materialColor
          : `#${data.materialColor}`;
      } else {
        swatch.style.backgroundColor = '';
      }
    }
    if (material) {
      material.textContent = empty ? 'Empty' : data?.materialType || 'Unknown';
    }
  }
}

async function fetchMaterialStationStatus(): Promise<MaterialStationStatus | null> {
  if (state.authRequired && !state.authToken) {
    return null;
  }

  try {
    const result = await apiRequest<MaterialStationStatusResponse>('/api/printer/material-station');
    return result.success ? (result.status ?? null) : null;
  } catch (error) {
    console.error('[IFS] Failed to fetch material station status:', error);
    return null;
  }
}

/**
 * Refresh the IFS card from the printer's cached material-station status. Called
 * on each status tick. No-ops when the card is absent or hidden; shows the
 * unavailable state when disconnected.
 */
export async function refreshIfsStationCard(): Promise<void> {
  const panel = getCardPanel();
  if (!panel || panel.offsetParent === null) {
    return; // not in the layout / hidden — nothing to do
  }

  if (!state.isConnected) {
    latestStation = null;
    renderIfsCard(null);
    return;
  }

  const status = await fetchMaterialStationStatus();
  latestStation = status;
  renderIfsCard(status);
}

function handleSlotClick(slotNumber: number): void {
  const existing = latestStation?.slots.find((s) => s.slotId + 1 === slotNumber);
  const slot: MaterialSlotInfo = existing ?? {
    slotId: slotNumber - 1,
    isEmpty: true,
    materialType: null,
    materialColor: null,
  };
  openSlotEditor(slot);
}

/**
 * Wire the IFS card once at startup. Uses delegated click handling so it keeps
 * working as the grid shows/hides the card, and does an initial render.
 */
export function setupIfsStationCard(): void {
  if (cardHandlersRegistered) {
    return;
  }
  cardHandlersRegistered = true;

  document.addEventListener('click', (event) => {
    const slotEl = (event.target as HTMLElement | null)?.closest('.ifs-card-slot');
    if (!slotEl) {
      return;
    }
    const attr = slotEl.getAttribute('data-slot');
    const slotNumber = attr ? Number.parseInt(attr, 10) : Number.NaN;
    if (Number.isInteger(slotNumber) && slotNumber >= 1 && slotNumber <= 4) {
      handleSlotClick(slotNumber);
    }
  });

  void refreshIfsStationCard();
}

// ============================================================================
// SLOT EDITOR (manual material/color, with optional Spoolman pre-fill)
// ============================================================================

/**
 * Open the per-slot manual editor: a modal with a material dropdown (14 recognized
 * materials) and a grid of the 24 recognized color swatches, pre-seeded from the
 * slot's current material/color. When Spoolman is configured it also offers a
 * "Set from Spoolman" shortcut that pre-fills the selections (snapped to the
 * palette) for review before applying. Works without Spoolman.
 */
function openSlotEditor(slot: MaterialSlotInfo): void {
  const displaySlotId = slot.slotId + 1;

  // Resolve the fixed palette for this printer model (AD5X vs Creator 5).
  const palette = getPaletteForModel(latestStation?.printerModelType);
  const paletteMaterials = palette.materials;
  const paletteColors = palette.colors;

  // Seed from the slot's current material/color, snapped to the fixed palette.
  let selectedMaterial =
    (slot.materialType ? palette.nearestMaterial(slot.materialType) : null) ??
    paletteMaterials[0] ??
    'PLA';
  let selectedHex: string | null = slot.materialColor
    ? (palette.nearestColor(slot.materialColor)?.hex ?? null)
    : null;

  const materialOptions = paletteMaterials
    .map((m) => `<option value="${m}"${m === selectedMaterial ? ' selected' : ''}>${m}</option>`)
    .join('');
  const swatches = paletteColors.map(
    (c) =>
      `<button type="button" class="ifs-swatch${c.hex === selectedHex ? ' selected' : ''}" data-hex="${c.hex}" title="${c.name}" aria-label="${c.name}" style="--swatch:${c.hex}"><span class="ifs-swatch-check">✓</span></button>`
  ).join('');
  const spoolmanConfigured = Boolean(state.spoolmanConfig?.serverUrl);
  const spoolmanBtn = spoolmanConfigured
    ? '<button type="button" class="secondary-btn ifs-editor-spoolman">Set from Spoolman</button>'
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal ifs-editor-modal';
  overlay.style.zIndex = '110';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="modal-content small">
      <div class="modal-header">
        <h2>Configure Slot ${displaySlotId}</h2>
        <button type="button" class="close-btn ifs-editor-close" aria-label="Close">&times;</button>
      </div>
      <div class="modal-body">
        <div class="ifs-editor-field">
          <span class="ifs-editor-label">Material</span>
          <select class="ifs-editor-material">${materialOptions}</select>
        </div>
        <div class="ifs-editor-field">
          <span class="ifs-editor-label">Color</span>
          <div class="ifs-swatch-grid">${swatches}</div>
        </div>
        <div class="ifs-editor-preview"></div>
      </div>
      <div class="modal-footer">
        ${spoolmanBtn}
        <button type="button" class="secondary-btn ifs-editor-cancel">Cancel</button>
        <button type="button" class="primary-btn ifs-editor-apply">Apply</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const select = overlay.querySelector('.ifs-editor-material') as HTMLSelectElement;
  const previewEl = overlay.querySelector('.ifs-editor-preview') as HTMLElement;
  const applyBtn = overlay.querySelector('.ifs-editor-apply') as HTMLButtonElement;

  const updatePreview = (): void => {
    const colorName = selectedHex
      ? (paletteColors.find((c) => c.hex === selectedHex)?.name ?? selectedHex)
      : null;
    previewEl.textContent = colorName
      ? `Slot ${displaySlotId} → ${selectedMaterial} · ${colorName}`
      : 'Pick a color to continue';
    applyBtn.disabled = !selectedHex;
  };

  const selectSwatch = (hex: string): void => {
    selectedHex = hex;
    overlay.querySelectorAll('.ifs-swatch').forEach((el) => {
      el.classList.toggle('selected', (el as HTMLElement).getAttribute('data-hex') === hex);
    });
    updatePreview();
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  };

  select.addEventListener('change', () => {
    selectedMaterial = select.value;
    updatePreview();
  });
  overlay.querySelectorAll('.ifs-swatch').forEach((el) => {
    el.addEventListener('click', () => {
      const hex = (el as HTMLElement).getAttribute('data-hex');
      if (hex) selectSwatch(hex);
    });
  });
  overlay.querySelector('.ifs-editor-close')?.addEventListener('click', close);
  overlay.querySelector('.ifs-editor-cancel')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey, true);

  overlay.querySelector('.ifs-editor-spoolman')?.addEventListener('click', () => {
    openSpoolPicker((spool) => {
      if (spool.material) {
        const matched = palette.nearestMaterial(spool.material);
        if (matched) {
          selectedMaterial = matched;
          select.value = matched;
        }
      }
      const rawColor = getRawSpoolColor(spool);
      if (rawColor) {
        const snapped = palette.nearestColor(rawColor);
        if (snapped) selectSwatch(snapped.hex);
      }
      updatePreview();
    });
  });

  applyBtn.addEventListener('click', () => {
    if (selectedHex) {
      void applyManualSlot(slot, displaySlotId, selectedMaterial, selectedHex, close);
    }
  });

  updatePreview();
}

/**
 * Apply an explicit material + color (chosen in the editor) to a slot via the
 * slot-config route, then refresh the card.
 */
async function applyManualSlot(
  slot: MaterialSlotInfo,
  displaySlotId: number,
  material: string,
  colorHex: string,
  onApplied: () => void
): Promise<void> {
  try {
    const result = await apiRequest<SlotConfigResponse>('/api/spoolman/slot-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contextId: getCurrentContextId(),
        slot: displaySlotId,
        materialName: material,
        colorHex,
        currentMaterial: slot.materialType,
      }),
    });

    if (result.success) {
      const palette = getPaletteForModel(latestStation?.printerModelType);
      const colorName = palette.colors.find((c) => c.hex === colorHex)?.name ?? colorHex;
      showToast(`Slot ${displaySlotId} → ${material} · ${colorName}`, 'success');
      onApplied();
      await refreshIfsStationCard();
    } else {
      showToast(result.error || 'Failed to configure slot', 'error');
    }
  } catch (error) {
    console.error('[IFS] Failed to configure slot:', error);
    showToast('Failed to configure slot', 'error');
  }
}
