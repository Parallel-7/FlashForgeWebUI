/**
 * @fileoverview AD5X IFS material-station slot editor with "Set from Spoolman".
 *
 * Renders the four material-station slots in a modal and lets the user assign a
 * slot's material/color from a Spoolman spool. The chosen spool's material and
 * color are snapped client-side to the printer's fixed 14-material / 24-color
 * palette (see {@link ../shared/ifs-palette.js}) before being applied via the
 * server slot-config route, which calls the library's `configureSlot`. The whole
 * affordance is gated on AD5X (material station available) AND Spoolman being
 * configured. Reuses the existing Spoolman spool-selection modal as the picker.
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
import { $, hideElement, showElement, showToast } from '../shared/dom.js';
import { nearestColor, nearestMaterial } from '../shared/ifs-palette.js';
import { getCurrentContextId } from './context-switching.js';
import { openSpoolPicker } from './spoolman.js';

let handlersRegistered = false;
let currentStation: MaterialStationStatus | null = null;

/**
 * Whether the IFS slot editor should be offered: the printer exposes a material
 * station AND Spoolman is globally configured (serverUrl present). This works even
 * when per-context Spoolman tracking is disabled (the AD5X material-station case).
 */
export function isIfsSlotEditorAvailable(): boolean {
  const hasMaterialStation = state.printerFeatures?.hasMaterialStation === true;
  const spoolmanConfigured = Boolean(state.spoolmanConfig?.serverUrl);
  return hasMaterialStation && spoolmanConfigured;
}

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

async function fetchMaterialStationStatus(): Promise<MaterialStationStatus | null> {
  if (state.authRequired && !state.authToken) {
    return null;
  }

  try {
    const result = await apiRequest<MaterialStationStatusResponse>('/api/printer/material-station');
    if (result.success) {
      return result.status ?? null;
    }
    showToast(result.error || 'Material station not available.', 'error');
    return null;
  } catch (error) {
    console.error('[IFS] Failed to fetch material station status:', error);
    showToast('Failed to load material station status.', 'error');
    return null;
  }
}

function renderSlots(status: MaterialStationStatus | null): void {
  const container = $('ifs-slot-list');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  if (!status || !status.connected || status.slots.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'material-placeholder';
    empty.textContent = status?.errorMessage || 'Material station not connected.';
    container.appendChild(empty);
    return;
  }

  status.slots.forEach((slot) => {
    const displaySlotId = slot.slotId + 1;
    const item = document.createElement('div');
    item.className = 'ifs-slot-item';
    if (slot.isEmpty) {
      item.classList.add('empty');
    }

    const swatch = document.createElement('span');
    swatch.className = 'ifs-slot-swatch';
    if (slot.materialColor) {
      swatch.style.backgroundColor = slot.materialColor;
    }

    const info = document.createElement('div');
    info.className = 'ifs-slot-info';

    const label = document.createElement('div');
    label.className = 'ifs-slot-label';
    label.textContent = `Slot ${displaySlotId}`;

    const material = document.createElement('div');
    material.className = 'ifs-slot-material';
    material.textContent = slot.isEmpty ? 'Empty' : slot.materialType || 'Unknown';

    info.appendChild(label);
    info.appendChild(material);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary-btn ifs-slot-set-btn';
    button.textContent = 'Set from Spoolman';
    button.addEventListener('click', () => {
      handleSetFromSpoolman(slot);
    });

    item.appendChild(swatch);
    item.appendChild(info);
    item.appendChild(button);
    container.appendChild(item);
  });
}

function handleSetFromSpoolman(slot: MaterialSlotInfo): void {
  const displaySlotId = slot.slotId + 1;

  openSpoolPicker((spool) => {
    void applySpoolToSlot(slot, displaySlotId, spool);
  });
}

async function applySpoolToSlot(
  slot: MaterialSlotInfo,
  displaySlotId: number,
  spool: SpoolSummary
): Promise<void> {
  const rawColor = getRawSpoolColor(spool);
  if (!rawColor) {
    showToast(`${spool.name || `Spool #${spool.id}`} has no color in Spoolman`, 'error');
    return;
  }

  const snappedColor = nearestColor(rawColor);
  if (!snappedColor) {
    showToast('Could not interpret the spool color', 'error');
    return;
  }

  // Material may not resolve; in that case keep the slot's current material and
  // only change the color. Never write an unrecognized material string.
  const snappedMaterial = spool.material ? nearestMaterial(spool.material) : null;
  const materialToWrite = snappedMaterial ?? slot.materialType ?? null;
  if (!materialToWrite) {
    showToast(
      `Spool material "${spool.material ?? 'unknown'}" did not match and the slot has no current material to keep`,
      'error'
    );
    return;
  }

  try {
    const result = await apiRequest<SlotConfigResponse>('/api/spoolman/slot-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contextId: getCurrentContextId(),
        slot: displaySlotId,
        materialName: snappedMaterial,
        colorHex: snappedColor.hex,
        currentMaterial: slot.materialType,
      }),
    });

    if (result.success) {
      const spoolName = spool.name || `Spool #${spool.id}`;
      showToast(
        `Slot ${displaySlotId} → ${materialToWrite} · ${snappedColor.name}, from ${spoolName}`,
        'success'
      );
      await refreshStation();
    } else {
      showToast(result.error || 'Failed to configure slot', 'error');
    }
  } catch (error) {
    console.error('[IFS] Failed to configure slot:', error);
    showToast('Failed to configure slot', 'error');
  }
}

async function refreshStation(): Promise<void> {
  currentStation = await fetchMaterialStationStatus();
  renderSlots(currentStation);
}

export async function openIfsStationModal(): Promise<void> {
  if (!isIfsSlotEditorAvailable()) {
    showToast('Material station slot editing is not available', 'error');
    return;
  }

  const modal = $('ifs-station-modal');
  if (!modal) {
    return;
  }

  renderSlots(null);
  showElement('ifs-station-modal');
  await refreshStation();
}

export function closeIfsStationModal(): void {
  hideElement('ifs-station-modal');
  currentStation = null;
}

export function setupIfsStationHandlers(): void {
  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  $('ifs-station-open')?.addEventListener('click', () => {
    void openIfsStationModal();
  });
  $('ifs-station-modal-close')?.addEventListener('click', () => closeIfsStationModal());
  $('ifs-station-modal-cancel')?.addEventListener('click', () => closeIfsStationModal());
}
