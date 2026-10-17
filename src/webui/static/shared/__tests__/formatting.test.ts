/**
 * @fileoverview Tests for the WebUI wall-clock completion time formatter.
 *
 * `formatCompletionTime` formats the absolute completion timestamp that the
 * ff-api library supplies (null while the print is not advancing). It does not
 * re-derive the time from a remaining duration, so it does not drift while the
 * print is paused. `isPrintAdvancing` is kept as a browser-side mirror of the
 * app-side predicate.
 */

import { describe, expect, it } from '@jest/globals';
import { formatCompletionTime, isPrintAdvancing } from '../formatting';

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

describe('formatCompletionTime', () => {
  const completion = new Date('2026-01-01T14:30:00.000Z');
  const expected = completion.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  it('formats a fixed Date completion time as a wall-clock string', () => {
    expect(formatCompletionTime(completion)).toBe(expected);
  });

  it('formats an ISO string completion time the same way', () => {
    expect(formatCompletionTime(completion.toISOString())).toBe(expected);
  });

  it('returns "--:--" for null and invalid values', () => {
    expect(formatCompletionTime(null)).toBe('--:--');
    expect(formatCompletionTime('not-a-date')).toBe('--:--');
  });
});
