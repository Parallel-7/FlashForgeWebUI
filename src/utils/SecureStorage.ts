/**
 * @fileoverview Lightweight helpers for encoding/decoding secrets at rest.
 *
 * Standalone port of the FlashForgeUI SecureStorage helpers. The desktop app
 * uses Electron's safeStorage (OS keychain) when available; this Node-only
 * build has no OS keychain access, so secrets are stored base64-encoded with
 * the same `plain:` prefix the desktop uses as its fallback. The formats are
 * interchangeable: `enc:` values written by the desktop cannot be decrypted
 * here and resolve to undefined (callers fall back to defaults).
 */

const ENCRYPT_PREFIX = 'enc:';
const PLAIN_PREFIX = 'plain:';

export function encryptSecret(value: string): string {
  if (!value) {
    return value;
  }
  return `${PLAIN_PREFIX}${Buffer.from(value, 'utf-8').toString('base64')}`;
}

export function decryptSecret(value?: string): string | undefined {
  if (!value) {
    return value;
  }

  if (value.startsWith(ENCRYPT_PREFIX)) {
    // Written by the Electron desktop app via OS-level encryption; not
    // recoverable without that keychain. Treat as unset.
    return undefined;
  }

  if (value.startsWith(PLAIN_PREFIX)) {
    const payload = value.slice(PLAIN_PREFIX.length);
    try {
      return Buffer.from(payload, 'base64').toString('utf-8');
    } catch {
      return undefined;
    }
  }

  return value;
}
