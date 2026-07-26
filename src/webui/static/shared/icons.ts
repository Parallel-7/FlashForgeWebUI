/**
 * @fileoverview Lucide icon utilities for the WebUI static client.
 *
 * Handles converting icon names to PascalCase, hydrating Lucide icons inside
 * dynamically rendered DOM nodes, and initializing the global set of icons
 * required by the WebUI header and dialogs.
 */

type LucideIconNode = [string, Record<string, string | number>];

type LucideGlobal = {
  readonly createIcons: (options?: {
    readonly icons?: Record<string, LucideIconNode[]>;
    readonly nameAttr?: string;
    readonly attrs?: Record<string, string>;
    readonly root?: Document | Element | DocumentFragment;
  }) => void;
  readonly icons: Record<string, LucideIconNode[]>;
};

declare global {
  interface Window {
    lucide?: LucideGlobal;
  }
}

export function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

export function hydrateLucideIcons(
  iconNames: string[],
  root: Document | Element | DocumentFragment = document
): void {
  const lucide = window.lucide;
  if (!lucide?.createIcons) {
    return;
  }

  const icons: Record<string, LucideIconNode[]> = {};
  iconNames.forEach((name) => {
    const pascal = toPascalCase(name);
    const iconNode =
      lucide.icons?.[pascal] ??
      lucide.icons?.[name] ??
      lucide.icons?.[name.toUpperCase()] ??
      lucide.icons?.[name.toLowerCase()];

    if (iconNode) {
      icons[pascal] = iconNode;
    } else {
      console.warn(`[WebUI] Lucide icon "${name}" not available in global registry.`);
    }
  });

  if (Object.keys(icons).length === 0) {
    return;
  }

  lucide.createIcons({
    icons,
    nameAttr: 'data-lucide',
    attrs: {
      'stroke-width': '2',
      'aria-hidden': 'true',
      focusable: 'false',
      class: 'lucide-icon',
    },
    root,
  });
}

export function initializeLucideIcons(): void {
  // Pre-hydrate every icon referenced by static `data-lucide` markup in
  // index.html so it renders at boot. The vendored lucide build (v0.552.0)
  // dropped its legacy kebab-case aliases, so lucide's own bare `createIcons()`
  // scan can no longer resolve names like `hard-drive` or `alert-triangle`.
  // `hydrateLucideIcons` converts each name to PascalCase (e.g. `alert-triangle`
  // -> `AlertTriangle`, which still exists in the registry), registers the node,
  // and renders it in one pass. Icons only used inside dynamically rendered
  // markup (file-manager tiles, calibration tabs, reboot overlay) are hydrated
  // by their own scoped `hydrateLucideIcons(...)` calls at render time.
  hydrateLucideIcons(
    [
      // Header / global chrome
      'settings', 'lock', 'package', 'search', 'circle', 'folder', 'gauge', 'power',
      // Printer discovery modal
      'wifi', 'keyboard', 'archive', 'link',
      // File manager / storage browser
      'hard-drive', 'usb', 'refresh-cw', 'check-square', 'square', 'trash-2',
      'pencil', 'alert-triangle',
      // Calibration modal + shared action icons
      'grid-3x3', 'activity', 'terminal', 'history', 'file-up', 'download', 'play',
      'sparkles', 'copy', 'upload', 'plug', 'unplug', 'check-circle',
    ],
    document,
  );
}
