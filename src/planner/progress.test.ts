import { afterEach, describe, expect, it, vi } from 'vitest';
import { planAsOfFraction, progressPointFromPlan, projectedNetWorthAt, summarizeProgress, todayISO, yearFraction } from './progress';

describe('todayISO', () => {
  const originalTZ = process.env.TZ;

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTZ;
  });

  // W3#6: `toISOString().slice(0, 10)` reads the date in UTC, so an evening
  // sync west of Greenwich (anywhere in the Americas, after ~4-8pm local)
  // logged itself as tomorrow. `en-CA`'s locale format happens to be
  // YYYY-MM-DD, and `toLocaleDateString` reads the LOCAL calendar date.
  it('reads the local calendar date, not the UTC one, in the evening Pacific time', () => {
    process.env.TZ = 'America/Los_Angeles';
    vi.useFakeTimers();
    // 2026-01-15T05:30:00Z is 2026-01-14 21:30 PST -- still "today" (Jan 14)
    // in Los Angeles, even though the UTC calendar has already turned over
    // to Jan 15. The pre-fix implementation returned '2026-01-15' here.
    vi.setSystemTime(new Date('2026-01-15T05:30:00Z'));
    expect(todayISO()).toBe('2026-01-14');
  });

  it('still reads the plain UTC-and-local-agree case correctly', () => {
    process.env.TZ = 'America/Los_Angeles';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T18:00:00Z')); // 11am PDT, same calendar day everywhere
    expect(todayISO()).toBe('2026-06-15');
  });
});

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
  // `opening` (80,000) is deliberately far from `years[0].netWorth`
  // (100,000, the stub year's projected Dec-31 CLOSE) — the gap a real plan
  // always has, so a test that conflated the two (as the pre-fix version
  // did) can't accidentally pass.
  const series = {
    years: [{ year: 2026, netWorth: 100_000 }, { year: 2027, netWorth: 200_000 }],
    opening: { netWorth: 80_000 },
  };

  it('returns opening at the as-of anchor, not the stub year\'s projected close (W3#1)', () => {
    expect(projectedNetWorthAt(series, 2026, 2026)).toBe(80_000);
  });

  it('reaches each year\'s snapshot a full year after its own close (year + 1 on the x-axis)', () => {
    expect(projectedNetWorthAt(series, 2027, 2026)).toBe(100_000);
    expect(projectedNetWorthAt(series, 2028, 2026)).toBe(200_000);
  });

  it('interpolates linearly between opening and the first close', () => {
    expect(projectedNetWorthAt(series, 2026.5, 2026)).toBeCloseTo(90_000, 0);
  });

  it('interpolates linearly between two annual closes', () => {
    expect(projectedNetWorthAt(series, 2027.5, 2026)).toBeCloseTo(150_000, 0);
  });

  it('clamps outside the projected range rather than extrapolating', () => {
    expect(projectedNetWorthAt(series, 2020, 2026)).toBe(80_000);
    expect(projectedNetWorthAt(series, 2030, 2026)).toBe(200_000);
  });

  it('returns 0 for an empty series with no opening', () => {
    expect(projectedNetWorthAt({ years: [] }, 2026, 2026)).toBe(0);
  });

  it('falls back to years[0] as the opening value when no caller has wired `opening` through yet', () => {
    const noOpening = { years: [{ year: 2026, netWorth: 100_000 }, { year: 2027, netWorth: 200_000 }] };
    expect(projectedNetWorthAt(noOpening, 2026, 2026)).toBe(100_000);
  });

  // M14 / W3#1: a progress point logged exactly on the plan's `asOfDate`
  // holds only `opening`'s balances — never a whole year's projected growth
  // ahead of "today" — so it must compare at zero delta against the plan,
  // whatever day of the year `asOfDate` is.
  it('anchors opening at a mid-year as-of date, not January 1st', () => {
    const asOf = yearFraction('2026-07-02');
    expect(projectedNetWorthAt(series, asOf, asOf)).toBe(80_000);
  });

  it('a close\'s knot sits at year + 1 regardless of where in the year as-of falls', () => {
    const asOf = yearFraction('2026-07-02');
    expect(projectedNetWorthAt(series, 2027, asOf)).toBe(100_000);
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

  it('prefers `opening` (the true as-of-date balance) over the years[] fallback once a caller passes it', () => {
    const point = progressPointFromPlan({
      settings: { startYear: 2026 },
      // years[] is a projected CLOSE and would give a different (larger)
      // number — it must not be read once `opening` is present.
      years: [
        {
          year: 2026,
          netWorth: 999_999,
          accounts: [{ close: 999_999, isLiability: false }],
        },
      ],
      opening: {
        netWorth: 168_000,
        accounts: [
          { balance: 200_000, isLiability: false },
          { balance: 32_000, isLiability: true },
        ],
      },
    });
    expect(point.netWorth).toBe(168_000);
    expect(point.assets).toBe(200_000);
    expect(point.liabilities).toBe(32_000);
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
