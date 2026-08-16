import { describe, expect, it } from 'vitest';
import { niceScale, nextPointYear, normalize } from './RateSchedule';

describe('normalize', () => {
  it('seeds a single anchor at the plan start when there is nothing stored', () => {
    expect(normalize(undefined, 2026)).toEqual([{ year: 2026, rate: 0 }]);
    expect(normalize([], 2026)).toEqual([{ year: 2026, rate: 0 }]);
  });

  it('pins the opening anchor to the plan start year', () => {
    // A plan whose start year moved forward leaves the schedule opening in the
    // past; the rate should carry over to the new first year rather than the
    // projection running with no rate at all.
    expect(normalize([{ year: 2020, rate: 7 }], 2026)).toEqual([{ year: 2026, rate: 7 }]);
  });

  it('sorts anchors and drops any that collide with the pinned first year', () => {
    const out = normalize(
      [
        { year: 2036, rate: 9 },
        { year: 2026, rate: 3 },
        { year: 2024, rate: 99 },
        { year: 2031, rate: 6 },
      ],
      2026,
    );
    expect(out).toEqual([
      { year: 2026, rate: 99 },
      { year: 2031, rate: 6 },
      { year: 2036, rate: 9 },
    ]);
  });
});

describe('nextPointYear', () => {
  const used = (years: number[]) => new Set(years);

  it('spaces the next point five years out', () => {
    expect(nextPointYear([{ year: 2026, rate: 3 }], used([2026]), 2060)).toBe(2031);
  });

  it('falls back to the first free year when the spaced year is taken', () => {
    expect(
      nextPointYear(
        [
          { year: 2026, rate: 3 },
          { year: 2031, rate: 6 },
        ],
        used([2026, 2031]),
        2033,
      ),
    ).toBe(2032);
  });

  it('returns undefined once the horizon is full, so no point can be added', () => {
    expect(nextPointYear([{ year: 2030, rate: 3 }], used([2030]), 2030)).toBeUndefined();
  });
});

describe('niceScale', () => {
  it('leaves headroom above the highest rate', () => {
    expect(niceScale([3]).ticks).toEqual([0, 2, 4, 6]);
    expect(niceScale([3, 6, 9, 12]).ticks).toEqual([0, 5, 10, 15]);
  });

  it('always includes a zero baseline', () => {
    expect(niceScale([6.5]).lo).toBe(0);
  });

  it('drops the floor below zero for a depreciating asset', () => {
    const scale = niceScale([-4, 2]);
    expect(scale.lo).toBeLessThan(0);
    expect(scale.hi).toBeGreaterThanOrEqual(2);
    expect(scale.ticks).toContain(0);
  });
});
