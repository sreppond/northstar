import { describe, expect, it } from 'vitest';
import {
  areaPath,
  dangerRuns,
  inDanger,
  keyboardYear,
  linePath,
  monotoneCommands,
  nearestIndex,
  pickXTicks,
  stackSeries,
  yTicks,
} from './seriesMath';

describe('nearestIndex', () => {
  const years = [2026, 2027, 2028, 2029];
  it('snaps to the closest data year', () => {
    expect(nearestIndex(years, 2027.4)).toBe(1);
    expect(nearestIndex(years, 2027.6)).toBe(2);
  });
  it('clamps past either edge', () => {
    expect(nearestIndex(years, 1990)).toBe(0);
    expect(nearestIndex(years, 2100)).toBe(3);
  });
  it('handles fractional (Progress-style) domains and an empty one', () => {
    expect(nearestIndex([2025.4, 2025.9, 2026.5], 2025.8)).toBe(1);
    expect(nearestIndex([], 2000)).toBe(-1);
  });
});

describe('keyboardYear', () => {
  const years = [2026, 2027, 2028];
  it('moves one data point and stops at the ends', () => {
    expect(keyboardYear(years, 2027, 'ArrowRight')).toBe(2028);
    expect(keyboardYear(years, 2028, 'ArrowRight')).toBe(2028);
    expect(keyboardYear(years, 2026, 'ArrowLeft')).toBe(2026);
  });
  it('jumps with Home/End', () => {
    expect(keyboardYear(years, 2027, 'Home')).toBe(2026);
    expect(keyboardYear(years, 2027, 'End')).toBe(2028);
  });
  it('starts from the matching edge when nothing is pinned', () => {
    expect(keyboardYear(years, null, 'ArrowRight')).toBe(2026);
    expect(keyboardYear(years, null, 'ArrowLeft')).toBe(2028);
  });
});

describe('stackSeries', () => {
  it('stacks bottom to top and treats NaN as zero', () => {
    const { bases, tops } = stackSeries([
      [1, 2, 3],
      [10, NaN, 30],
    ]);
    expect(bases[0]).toEqual([0, 0, 0]);
    expect(tops[0]).toEqual([1, 2, 3]);
    expect(bases[1]).toEqual([1, 2, 3]);
    expect(tops[1]).toEqual([11, 2, 33]);
  });
});

describe('yTicks', () => {
  it('starts at zero and uses nice steps', () => {
    expect(yTicks(0, 2_150_000).slice(0, 3)).toEqual([0, 1_000_000, 2_000_000]);
  });
  it('continues at the same step below zero', () => {
    const t = yTicks(-600_000, 2_000_000);
    expect(t).toContain(0);
    expect(t.some((v) => v < 0)).toBe(true);
    expect(Math.min(...t)).toBeGreaterThanOrEqual(-700_000);
  });
});

describe('pickXTicks', () => {
  it('always keeps the last year and drops the earlier of a colliding pair', () => {
    const cands = [0, 10, 20, 30].map((x, i) => ({ x, label: String(2026 + i) }));
    const picked = pickXTicks(cands, 400);
    expect(picked[picked.length - 1]).toBe(3);
    // 10px apart is under the 42px gap, so only the last survives of any neighbours.
    expect(picked.length).toBeLessThan(4);
  });
  it('drops the earlier of two identical labels', () => {
    const picked = pickXTicks(
      [
        { x: 0, label: '2026' },
        { x: 200, label: '2026' },
      ],
      300,
    );
    expect(picked).toEqual([1]);
  });
});

describe('monotone paths', () => {
  const xs = [0, 10, 20, 30, 40];
  it('does not overshoot the data between points', () => {
    // A flat run then a rise: Catmull-Rom would dip below 100 before rising.
    const ys = [100, 100, 100, 50, 0];
    const cmds = monotoneCommands(xs, ys);
    const ctrlYs = [...cmds.matchAll(/C[\d.-]+,([\d.-]+) [\d.-]+,([\d.-]+)/g)].flatMap((m) => [Number(m[1]), Number(m[2])]);
    for (const y of ctrlYs) {
      expect(y).toBeLessThanOrEqual(100 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(0 - 1e-6);
    }
  });

  it('breaks the line at a NaN gap rather than bridging it', () => {
    const d = linePath(xs, [10, 20, NaN, 30, 40]);
    expect(d.match(/M/g)?.length).toBe(2);
  });

  it('draws a step as flat-then-vertical, with the curve resuming after it', () => {
    const d = linePath([0, 10, 20], [100, 100, 20], 1);
    expect(d).toContain('L10.0,100.0L10.0,100.0');
    const d2 = linePath([0, 10, 20, 30], [100, 100, 20, 10], 2);
    expect(d2).toContain('L20.0,100.0L20.0,20.0');
  });

  it('closes an area back along the lower edge', () => {
    const d = areaPath([0, 10, 20], [10, 5, 0], [50, 50, 50]);
    expect(d.startsWith('M0.0,10.0')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d).toContain('L20.0,50.0');
    expect(areaPath([0, 10, 20], [10, NaN, 0], [50, 50, 50])).toBe('');
  });
});

describe('dangerRuns / inDanger (V5-REVIEW-1 F2)', () => {
  it('splits years into one run per contiguous stretch', () => {
    expect(dangerRuns({ from: 2031, years: [2031, 2032, 2033, 2040, 2041, 2050] }, 2091)).toEqual([
      { from: 2031, to: 2033 },
      { from: 2040, to: 2041 },
      { from: 2050, to: 2050 },
    ]);
  });
  it('falls back to from..to (or the last year) without years', () => {
    expect(dangerRuns({ from: 2031 }, 2091)).toEqual([{ from: 2031, to: 2091 }]);
    expect(dangerRuns({ from: 2031, to: 2035 }, 2091)).toEqual([{ from: 2031, to: 2035 }]);
  });
  it('treats only member years as short', () => {
    const band = { from: 2031, years: [2031, 2032, 2040] };
    expect(inDanger(band, 2032)).toBe(true);
    expect(inDanger(band, 2036)).toBe(false);
    expect(inDanger(band, 2091)).toBe(false);
    expect(inDanger({ from: 2031 }, 2091)).toBe(true);
  });
});

describe('pickXTicks on round years (V5-REVIEW-1 F19)', () => {
  const cands = (from: number, to: number, px: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      x: (i * px) / (to - from),
      label: String(from + i),
      value: from + i,
    }));

  it('lands on multiples of 10 over a long plan, with the first year as the anchor', () => {
    const c = cands(2026, 2091, 900);
    const years = pickXTicks(c, 900).map((i) => c[i].value!);
    expect(years[0]).toBe(2026);
    for (const y of years.slice(1)) expect(y % 10).toBe(0);
    expect(years.length).toBeGreaterThanOrEqual(4);
  });
  it('uses 5s on a mid-length window and keeps ticks apart', () => {
    const c = cands(2026, 2046, 700);
    const picked = pickXTicks(c, 700);
    for (const i of picked.slice(1)) expect(c[i].value! % 5).toBe(0);
    for (let k = 1; k < picked.length; k++) expect(c[picked[k]].x - c[picked[k - 1]].x).toBeGreaterThanOrEqual(42);
  });
});
