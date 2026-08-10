/**
 * @fileoverview Tests for the WebUI wall-clock ETA gate.
 *
 * The ETA formatters convert a remaining *duration* into a wall-clock time
 * against a fresh Date.now(). That conversion is only stable while the firmware
 * is counting `estimatedTime` down: it freezes the field the moment the print
 * stops advancing, so `now() + remaining` recomputed each poll walks the
 * displayed completion time forward a minute every minute. A paused print would
 * appear to recede forever. `isPrintAdvancing` is what callers gate on to
 * suppress the display instead.
 */

import { describe, expect, it } from '@jest/globals';
import { formatETA, formatETAFromString, isPrintAdvancing } from '../formatting';

describe('isPrintAdvancing', () => {
  it('is true only for the state that counts estimatedTime down', () => {
    expect(isPrintAdvancing('Printing')).toBe(true);
  });

  // 'Heating' is not advancing: the pre-print warmup does not move the job on
  // either, so it drifts the same way, just for minutes instead of hours.
  it('is false for paused, heating, and every other non-advancing state', () => {
    for (const state of [
      'Heating',
      'Paused',
      'Pausing',
      'Ready',
      'Error',
      'Completed',
      'Cancelled',
      'Busy',
      'Calibrating',
    ]) {
      expect(isPrintAdvancing(state)).toBe(false);
    }
    expect(isPrintAdvancing(undefined)).toBe(false);
  });

  // Parity with the app-side copy in src/types/polling.ts is asserted in
  // src/types/__tests__/polling.test.ts - this bundle's tsconfig pins rootDir
  // to src/webui/static, so it cannot import across the boundary.
});

describe('ETA formatters', () => {
  it('convert a remaining duration into a wall-clock completion time', () => {
    const expected = new Date(Date.now() + 90 * 60_000).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    expect(formatETA(90)).toBe(expected);

    const expectedFromString = new Date(Date.now() + (2 * 60 + 15) * 60_000).toLocaleTimeString(
      'en-US',
      {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }
    );
    expect(formatETAFromString('02:15')).toBe(expectedFromString);
  });
});
