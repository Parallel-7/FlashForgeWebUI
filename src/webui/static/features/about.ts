/**
 * @fileoverview "About" popup for the WebUI client.
 *
 * A topbar info button opens a small modal showing the running WebUI version
 * and links to releases, source, and the issue tracker. The version string is
 * stamped into index.html at build time by scripts/copy-webui-assets.js, so
 * this module only handles opening and closing the modal.
 *
 * Key exports:
 * - setupAbout(): wire the topbar button and modal close handlers
 */

import { $, hideElement, showElement } from '../shared/dom.js';

const MODAL_ID = 'about-modal';

function closeAboutModal(): void {
  hideElement(MODAL_ID);
}

/** Wire the topbar About button and the modal's close handlers. */
export function setupAbout(): void {
  const modal = $(MODAL_ID);

  $('about-button')?.addEventListener('click', () => showElement(MODAL_ID));
  $('about-close')?.addEventListener('click', closeAboutModal);

  modal?.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeAboutModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal?.classList.contains('hidden')) {
      closeAboutModal();
    }
  });
}
