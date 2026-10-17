/**
 * @fileoverview Tests for the printer-state predicates in types/polling.ts.
 *
 * `isPrintAdvancing` exists because the firmware freezes `estimatedTime`
 * whenever the print is not progressing. Any `now() + remaining` conversion
 * therefore walks its wall-clock result forward a minute every minute while
 * paused, instead of holding still. Callers gate the conversion on this
 * predicate; the remaining *duration* stays correct in every state.
 *
 * The WebUI browser bundle keeps its own copy in webui/static/shared/formatting.ts,
 * covered by its own test. The duplication is forced: tsconfig.json excludes
 * src/webui/static and the bundle pins rootDir to it, so neither side can import
 * the other. Change one definition, change both.
 */

import { describe, expect, it } from '@jest/globals';
import { isActiveState, type PrinterState, isPrintAdvancing } from '../polling';

const ALL_STATES: PrinterState[] = [
  'Ready',
  'Printing',
  'Paused',
  'Completed',
  'Error',
  'Busy',
  'Calibrating',
  'Heating',
  'Pausing',
  'Cancelled',
];

describe('isPrintAdvancing', () => {
  it('is true only for the state that counts estimatedTime down', () => {
    expect(isPrintAdvancing('Printing')).toBe(true);
  });

  // 'Heating' is not advancing: the pre-print warmup does not move the job on
  // either, so it drifts the same way, just for minutes instead of hours.
  it('is false for paused, heating, and every other non-advancing state', () => {
    for (const state of ALL_STATES.filter((s) => s !== 'Printing')) {
      expect(isPrintAdvancing(state)).toBe(false);
    }
  });

  // isActiveState includes Paused/Pausing/Calibrating on purpose - it answers
  // "is the printer busy enough to disable controls", not "is the ETA usable".
  // Reusing it for the ETA gate is exactly the bug this predicate fixes.
  it('is strictly narrower than isActiveState', () => {
    for (const state of ALL_STATES) {
      if (isPrintAdvancing(state)) {
        expect(isActiveState(state)).toBe(true);
      }
    }
    expect(isActiveState('Paused')).toBe(true);
    expect(isPrintAdvancing('Paused')).toBe(false);
  });
});
