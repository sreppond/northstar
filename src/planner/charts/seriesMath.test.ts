import { describe, expect, it } from 'vitest';
import {
  areaPath,
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
