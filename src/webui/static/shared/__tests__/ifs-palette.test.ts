/**
 * @fileoverview Tests for the AD5X IFS palette nearest-match snapping.
 *
 * Validates that every fixed swatch resolves to itself, that small RGB
 * perturbations snap back, that a curated set of known off-palette colors map
 * to the expected swatch (including cases that a naive RGB/ΔE76 distance gets
 * wrong but CIEDE2000 gets right), that hex-format variants parse correctly,
 * and that material snapping handles exact, leading-token, and unrecognized
 * cases. All fixtures are static; nothing here contacts a Spoolman instance.
 */

import { describe, expect, it } from '@jest/globals';
import { IFS_COLORS, IFS_MATERIALS, nearestColor, nearestMaterial } from '../ifs-palette.js';

function toHex(r: number, g: number, b: number): string {
  const clamp = (v: number): number => Math.max(0, Math.min(255, v));
  const part = (v: number): string => clamp(v).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace(/^#/, '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

describe('nearestColor', () => {
  it('resolves each of the 24 swatches to itself', () => {
    for (const swatch of IFS_COLORS) {
      expect(nearestColor(swatch.hex)?.name).toBe(swatch.name);
    }
  });

  it('snaps a +/-6 RGB neighborhood around each swatch back to it', () => {
    const deltas = [-6, 0, 6];
    for (const swatch of IFS_COLORS) {
      const [r, g, b] = hexToRgb(swatch.hex);
      for (const dr of deltas) {
        for (const dg of deltas) {
          for (const db of deltas) {
            const probe = toHex(r + dr, g + dg, b + db);
            expect(nearestColor(probe)?.name).toBe(swatch.name);
          }
        }
      }
    }
  });

  it('snaps saturated/obvious off-palette colors to the intuitive swatch', () => {
    // Pure primaries/secondaries plus neutrals — each has one obviously-correct
    // nearest palette swatch, so these guard the basic sanity of the matcher.
    const fixtures: ReadonlyArray<[string, string]> = [
      ['#FF0000', 'Red'],
      ['#00FF00', 'Green'],
      ['#FFFF00', 'Yellow'],
      ['#00FFFF', 'Light Blue'],
      ['#FF00FF', 'Magenta'],
      ['#FFA500', 'Orange'], // CSS "orange"
      ['#FFFFFF', 'White'],
      ['#000000', 'Black'],
      ['#808080', 'Gray'], // mid-grey
    ];
    for (const [hex, expected] of fixtures) {
      expect(nearestColor(hex)?.name).toBe(expected);
    }
  });

  it('resolves perceptual edge cases that a naive RGB/ΔE76 distance gets wrong', () => {
    // These are the cases that motivate using CIEDE2000 over a plain Lab/RGB
    // distance. ΔE76 mis-snaps pure blue to Violet and burgundy to Coral;
    // CIEDE2000 maps them to Dark Blue and Red as a human would.
    const fixtures: ReadonlyArray<[string, string]> = [
      ['#0000FF', 'Dark Blue'], // ΔE76 picks Violet
      ['#951e23', 'Red'], // burgundy — ΔE76 picks Coral
      ['#6c4f4c', 'Brown'], // muted warm grey-brown
    ];
    for (const [hex, expected] of fixtures) {
      expect(nearestColor(hex)?.name).toBe(expected);
    }
  });

  it('accepts hex without leading #', () => {
    expect(nearestColor('FF0000')?.name).toBe('Red');
  });

  it('drops the alpha channel from RRGGBBAA', () => {
    expect(nearestColor('#FF0000FF')?.name).toBe('Red');
    expect(nearestColor('FF000080')?.name).toBe('Red');
  });

  it('expands #RGB shorthand', () => {
    expect(nearestColor('#F00')?.name).toBe('Red');
    expect(nearestColor('00F')?.name).toBe('Dark Blue');
  });

  it('returns null for unparseable input', () => {
    expect(nearestColor('not-a-color')).toBeNull();
    expect(nearestColor('#12')).toBeNull();
    expect(nearestColor('#GGGGGG')).toBeNull();
    expect(nearestColor('')).toBeNull();
  });
});

describe('nearestMaterial', () => {
  it('resolves recognized materials, including normalized exact matches', () => {
    expect(nearestMaterial('PLA-CF')).toBe('PLA-CF');
    expect(nearestMaterial('petg-cf')).toBe('PETG-CF');
    expect(nearestMaterial('PLA+')).toBe('PLA');
  });

  it('resolves via the leading token', () => {
    expect(nearestMaterial('PLA Matte')).toBe('PLA');
    expect(nearestMaterial('PETG-CF Pro')).toBe('PETG-CF');
  });

  it('returns null for chemically unrelated or unknown materials', () => {
    expect(nearestMaterial('PCTG')).toBeNull();
    expect(nearestMaterial('PA6')).toBeNull();
    expect(nearestMaterial('Nylon')).toBeNull();
  });

  it('returns null for blank or non-string input', () => {
    expect(nearestMaterial('')).toBeNull();
    expect(nearestMaterial('   ')).toBeNull();
    expect(nearestMaterial(undefined as unknown as string)).toBeNull();
  });

  it('exposes the full material list', () => {
    expect(IFS_MATERIALS).toHaveLength(14);
    expect(IFS_MATERIALS).toContain('PLA');
    expect(IFS_MATERIALS).toContain('PPS-CF');
  });
});
