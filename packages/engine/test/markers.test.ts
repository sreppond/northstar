import { describe, expect, it } from 'vitest';
import { pathMarkers } from '../src/markers.js';
import type { PlanResult, YearSnapshot } from '../src/types.js';

/** A result stub carrying only what pathMarkers reads. */
function result(values: number[], shortfalls: Record<number, number> = {}): PlanResult {
  const years = values.map((netWorth, i): YearSnapshot => {
    const year = 2026 + i;
    return {
      year,
      ages: {},
      income: [],
      expenses: [],
      taxes: [],
      withdrawals: [],
      allocations: [],
      totalIncome: 0,
      totalExpenses: 0,
      totalTaxes: 0,
      netCashFlow: 0,
      accounts: [],
      assets: netWorth,
      liabilities: 0,
      netWorth,
      ...(shortfalls[year] ? { unfundedShortfall: shortfalls[year] } : {}),
    };
  });
  return { startYear: 2026, endYear: 2026 + values.length - 1, years, warnings: [] };
}

describe('pathMarkers — peak', () => {
  it('is silent on a line that rises to the end, where the peak says nothing', () => {
    const m = pathMarkers(result([100, 200, 300, 400]));
    expect(m.peakYear).toBeUndefined();
  });

  it('names the high-water year when the plan declines after it', () => {
    const m = pathMarkers(result([100, 200, 500, 300, 250]));
    expect(m.peakYear).toBe(2028);
    expect(m.peakValue).toBe(500);
  });
});

describe('pathMarkers — drawdown', () => {
  it('finds the largest peak-to-trough fall, not merely the first', () => {
    // Falls: 100→80 (20), then 300→150 (150). The second is the story.
    const m = pathMarkers(result([100, 80, 300, 150, 400]));
    expect(m.drawdown).toMatchObject({ fromYear: 2028, toYear: 2029, peak: 300, trough: 150 });
    expect(m.drawdown?.amount).toBe(150);
    expect(m.drawdown?.percent).toBeCloseTo(50, 6);
  });

  it('ignores a wobble too small to be a story', () => {
    const m = pathMarkers(result([100, 99.5, 120]));
    expect(m.drawdown).toBeUndefined();
  });

  it('is undefined on a monotonic climb', () => {
    expect(pathMarkers(result([100, 200, 300])).drawdown).toBeUndefined();
  });

  it('does not divide by a non-positive peak', () => {
    const m = pathMarkers(result([-50, -80, -100]));
    expect(m.drawdown).toBeUndefined();
  });
});

describe('pathMarkers — shortfalls', () => {
  it('collects every failing year and the total unfunded', () => {
    const m = pathMarkers(result([100, 90, 80, 70], { 2027: 5_000, 2029: 12_000 }));
    expect(m.shortfallYears).toEqual([2027, 2029]);
    expect(m.shortfallTotal).toBe(17_000);
  });

  it('reports none for a plan that funds itself throughout', () => {
    const m = pathMarkers(result([100, 200]));
    expect(m.shortfallYears).toEqual([]);
    expect(m.shortfallTotal).toBe(0);
  });
});

describe('pathMarkers — empty', () => {
  it('survives a result with no years', () => {
    expect(pathMarkers(result([]))).toEqual({ shortfallYears: [], shortfallTotal: 0 });
  });
});
