import { describe, expect, it } from 'vitest';
import { planAsOfFraction, progressPointFromPlan, projectedNetWorthAt, summarizeProgress, todayISO, yearFraction } from './progress';

describe('yearFraction', () => {
  it('reads January 1st as the bare year', () => {
    expect(yearFraction('2026-01-01')).toBeCloseTo(2026, 2);
  });

  it('reads mid-year as a fraction between the year and the next', () => {
    const midYear = yearFraction('2026-07-02');
    expect(midYear).toBeGreaterThan(2026.4);
    expect(midYear).toBeLessThan(2026.6);
  });
});

describe('projectedNetWorthAt', () => {
  const series = { years: [{ year: 2026, netWorth: 100_000 }, { year: 2027, netWorth: 200_000 }] };

  it('returns the exact snapshot at the as-of anchor and one year after it', () => {
    expect(projectedNetWorthAt(series, 2026, 2026)).toBe(100_000);
    expect(projectedNetWorthAt(series, 2027, 2026)).toBe(200_000);
  });

  it('interpolates linearly between two annual snapshots', () => {
    expect(projectedNetWorthAt(series, 2026.5, 2026)).toBeCloseTo(150_000, 0);
  });

  it('clamps outside the projected range rather than extrapolating', () => {
    expect(projectedNetWorthAt(series, 2020, 2026)).toBe(100_000);
    expect(projectedNetWorthAt(series, 2030, 2026)).toBe(200_000);
  });

  it('returns 0 for an empty series', () => {
    expect(projectedNetWorthAt({ years: [] }, 2026, 2026)).toBe(0);
  });

  // M14: the projection used to place snapshot year N at N.0 (January 1st)
  // regardless of the plan's actual `asOfDate`, so a mid-year `asOf` (the
  // common case — a plan's "today" is rarely New Year's Day) interpolated
  // toward the WRONG neighbouring year. Anchoring `years[0]` at `asOf`
  // itself is what makes a point logged exactly on the as-of date compare
  // at zero delta, whatever day of the year that is.
  it('anchors the first snapshot at a mid-year as-of date, not January 1st', () => {
    const asOf = yearFraction('2026-07-02');
    expect(projectedNetWorthAt(series, asOf, asOf)).toBe(100_000);
  });

  it('a fraction one full year past a mid-year as-of date reads the next snapshot', () => {
    const asOf = yearFraction('2026-07-02');
    expect(projectedNetWorthAt(series, asOf + 1, asOf)).toBe(200_000);
  });
});

describe('planAsOfFraction', () => {
  it('reads the plan settings\' asOfDate when set', () => {
    expect(planAsOfFraction({ startYear: 2026, asOfDate: '2026-07-02' })).toBeCloseTo(yearFraction('2026-07-02'), 6);
  });

  it('falls back to January 1st of startYear when asOfDate is unset', () => {
    expect(planAsOfFraction({ startYear: 2026 })).toBeCloseTo(2026, 2);
  });
});

describe('progressPointFromPlan', () => {
  it("pre-fills today's date and the plan's current-year net worth/assets/liabilities", () => {
    const point = progressPointFromPlan({
      settings: { startYear: 2026 },
      years: [
        {
          year: 2026,
          netWorth: 240_000,
          accounts: [
            { close: 300_000, isLiability: false },
            { close: -60_000, isLiability: true },
          ],
        },
      ],
    });
    expect(point.netWorth).toBe(240_000);
    expect(point.assets).toBe(300_000);
    expect(point.liabilities).toBe(60_000);
    expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // M14: this is the exact end-to-end scenario the review found broken --
  // click "Log today's net worth", save the pre-filled draft unedited, and
  // "vs. plan" read a large NEGATIVE delta instead of ~0.
  it("logging the plan's own current snapshot compares at zero delta against the plan", () => {
    const today = todayISO();
    const startYear = Number(today.slice(0, 4));
    const settings = { startYear, asOfDate: today };
    const source = {
      settings,
      years: [
        {
          year: startYear,
          netWorth: 204_600,
          accounts: [{ close: 204_600, isLiability: false }],
        },
        { year: startYear + 1, netWorth: 260_000, accounts: [] },
      ],
    };
    const point = progressPointFromPlan(source);
    const asOf = planAsOfFraction(settings);
    const delta = point.netWorth - projectedNetWorthAt(source, yearFraction(point.date), asOf);
    expect(delta).toBe(0);
  });
});

describe('summarizeProgress', () => {
  it('sorts ascending/descending and reads the all-time change', () => {
    const points = [
      { id: 'a', date: '2025-01-01', netWorth: 100, assets: 100, liabilities: 0 },
      { id: 'b', date: '2026-01-01', netWorth: 150, assets: 150, liabilities: 0 },
    ];
    const summary = summarizeProgress(points);
    expect(summary.sortedAscending.map((p) => p.id)).toEqual(['a', 'b']);
    expect(summary.sortedDescending.map((p) => p.id)).toEqual(['b', 'a']);
    expect(summary.latest?.id).toBe('b');
    expect(summary.allTimeChange).toBe(50);
  });
});
