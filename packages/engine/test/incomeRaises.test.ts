/**
 * Income raises and overrides (v6 R3): the year-by-year amount of an income
 * line. Hand-computed values are in the comments beside each expectation.
 */
import { describe, expect, it } from 'vitest';
import type { CompileContext } from '../src/events/kit.js';
import { income, incomeAmounts } from '../src/events/income.js';
import { runPlan } from '../src/run.js';
import { event, plan } from './fixtures.js';

/** Expects each year's amount to be close to the hand-computed one. */
function expectYears(amounts: Map<number, number>, startYear: number, expected: number[]) {
  expected.forEach((value, i) => {
    expect(amounts.get(startYear + i)).toBeCloseTo(value, 6);
  });
}

describe('incomeAmounts — no raises or overrides', () => {
  it('equals the old closed form exactly (3% over 5 years)', () => {
    // 50000, 51500, 53045, 54636.35, 56275.4405
    const config = { amount: 50_000, growthRate: 3 };
    const amounts = incomeAmounts(config, 2026, 2030);
    for (let year = 2026; year <= 2030; year++) {
      expect(amounts.get(year)).toBe(50_000 * Math.pow(1 + 3 / 100, year - 2026));
    }
  });

  it('treats empty raises and overrides lists as absent', () => {
    const config = { amount: 50_000, growthRate: 3, raises: [], overrides: [] };
    const bare = incomeAmounts({ amount: 50_000, growthRate: 3 }, 2026, 2030);
    const amounts = incomeAmounts(config, 2026, 2030);
    for (let year = 2026; year <= 2030; year++) {
      expect(amounts.get(year)).toBe(bare.get(year));
    }
  });

  it('compile emits the same bits as the old formula', () => {
    // The compile path must not drift from the closed form for an old plan.
    const ctx = {
      settings: plan().settings,
      participants: [],
      events: [],
      startYear: 2026,
      endYear: 2030,
      inflationAt: () => 1,
    } as CompileContext;
    const ev = event({ id: 'inc', kind: 'income', name: 'Salary', startYear: 2026 });
    const compiled = income.compile(
      ev,
      { amount: 50_000, growthRate: 3, isTaxable: true, isEarned: false },
      ctx,
    );
    const amounts = compiled.cashFlows.map((cf) => cf.amount);
    expect(amounts).toEqual(
      [0, 1, 2, 3, 4].map((elapsed) => 50_000 * Math.pow(1 + 3 / 100, elapsed)),
    );
  });
});

describe('incomeAmounts — raises', () => {
  it('a dollar raise adds $5,000 a year from its start year', () => {
    // 2026: 100000 (base). 2027: no raise yet, 0% growth: 100000.
    // 2028: +5000 = 105000. 2029: +5000 = 110000.
    const amounts = incomeAmounts(
      {
        amount: 100_000,
        growthRate: 0,
        raises: [{ fromYear: 2028, kind: 'dollars', value: 5_000 }],
      },
      2026,
      2029,
    );
    expectYears(amounts, 2026, [100_000, 100_000, 105_000, 110_000]);
  });

  it('a percent change mid-stream replaces the growth rate from its year', () => {
    // 2026: 100000. 2027: no raise yet, growthRate 3%: 103000.
    // 2028: raise 10%: 103000 * 1.10 = 113300. 2029: 113300 * 1.10 = 124630.
    // 2030: 124630 * 1.10 = 137093. The 3% no longer applies after 2028.
    const amounts = incomeAmounts(
      {
        amount: 100_000,
        growthRate: 3,
        raises: [{ fromYear: 2028, kind: 'percent', value: 10 }],
      },
      2026,
      2030,
    );
    expectYears(amounts, 2026, [100_000, 103_000, 113_300, 124_630, 137_093]);
  });

  it('the latest raise in effect wins', () => {
    // 2026: 100000. 2027: 3% = 103000. 2028: 10% = 113300.
    // 2029: a $1,000 step from 2029 replaces the 10%: 113300 + 1000 = 114300.
    const amounts = incomeAmounts(
      {
        amount: 100_000,
        growthRate: 3,
        raises: [
          { fromYear: 2028, kind: 'percent', value: 10 },
          { fromYear: 2029, kind: 'dollars', value: 1_000 },
        ],
      },
      2026,
      2029,
    );
    expectYears(amounts, 2026, [100_000, 103_000, 113_300, 114_300]);
  });
});

describe('incomeAmounts — overrides', () => {
  it('an override sets that year, and later years grow from it', () => {
    // 2026: 100000. 2027: 3% = 103000. 2028: override 150000.
    // 2029: 150000 * 1.03 = 154500. 2030: 154500 * 1.03 = 159135.
    const amounts = incomeAmounts(
      {
        amount: 100_000,
        growthRate: 3,
        overrides: [{ year: 2028, amount: 150_000 }],
      },
      2026,
      2030,
    );
    expectYears(amounts, 2026, [100_000, 103_000, 150_000, 154_500, 159_135]);
  });

  it('an override in the start year replaces the base amount', () => {
    // 2026: override 80000. 2027: 80000 * 1.03 = 82400.
    const amounts = incomeAmounts(
      {
        amount: 100_000,
        growthRate: 3,
        overrides: [{ year: 2026, amount: 80_000 }],
      },
      2026,
      2027,
    );
    expectYears(amounts, 2026, [80_000, 82_400]);
  });
});

describe('incomeAmounts — floor at zero', () => {
  it('a dollar decrease floors at 0 and does not carry a debt forward', () => {
    // 2026: 10000. 2027: 10000 - 4000 = 6000. 2028: 2000.
    // 2029: 2000 - 4000 = -2000, floored to 0. 2030: a $1,000 step from 2030
    // starts from 0, not from -2000: 1000.
    const amounts = incomeAmounts(
      {
        amount: 10_000,
        growthRate: 0,
        raises: [
          { fromYear: 2027, kind: 'dollars', value: -4_000 },
          { fromYear: 2030, kind: 'dollars', value: 1_000 },
        ],
      },
      2026,
      2030,
    );
    expectYears(amounts, 2026, [10_000, 6_000, 2_000, 0, 1_000]);
  });
});

describe('runPlan — income raises reach the projection', () => {
  it('the income line follows the raise schedule', () => {
    // 100000 in 2026-2027, then +5000 a year from 2028: 105000 in 2028, 110000 in 2029.
    const result = runPlan(
      plan({
        settings: { projectionYears: 4 } as never,
        events: [
          event({
            id: 'salary',
            kind: 'income',
            name: 'Salary',
            startYear: 2026,
            config: {
              amount: 100_000,
              growthRate: 0,
              raises: [{ fromYear: 2028, kind: 'dollars', value: 5_000 }],
            },
          }),
        ],
      }),
    );

    const salary = (year: number) =>
      result.years
        .find((y) => y.year === year)!
        .income.filter((l) => l.label === 'Salary')
        .reduce((sum, l) => sum + l.amount, 0);

    expect(salary(2026)).toBeCloseTo(100_000, 6);
    expect(salary(2027)).toBeCloseTo(100_000, 6);
    expect(salary(2028)).toBeCloseTo(105_000, 6);
    expect(salary(2029)).toBeCloseTo(110_000, 6);
  });
});
