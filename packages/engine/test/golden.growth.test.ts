/**
 * Golden tests — growth, the partial first year, and the waterfalls
 * (docs/ROADMAP-10.md "Track A: Truth", docs/MATH.md).
 *
 * Every expected number here is derived BY HAND in the comment above the
 * assertion, so a human can re-check the arithmetic without trusting the
 * engine that produced it. Where a number is computed via a short
 * expression rather than a literal, that expression is the same closed-form
 * formula the hand-derivation describes — it exists to avoid a transcription
 * error in a many-digit literal, not to hide the derivation.
 */
import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/run.js';
import { effectiveRateForFraction } from '../src/accounts.js';
import { yearFractionRemaining } from '../src/partialYear.js';
import { asset, plan, rule } from './fixtures.js';

describe('Golden: stub-year growth compounds, not prorates linearly', () => {
  it('12%/yr with exactly 3 months (25%) of the year left credits 1.12^0.25 − 1 ≈ 2.8737%, not the linear 3%', () => {
    // Hand check: 1.12^0.25 = exp(0.25 * ln 1.12) = exp(0.25 * 0.11332869)
    // = exp(0.02833217) = 1.02873734... so the credited growth is 2.8737%,
    // NOT 12% * 0.25 = 3% a linear proration would give.
    const factor = effectiveRateForFraction(12, 0.25);
    expect(factor).toBeCloseTo(0.028737, 5);
    expect(factor).not.toBeCloseTo(0.03, 3);
  });

  it('carries that same compounding through runPlan for a real date close to 3 months left', () => {
    // Oct 2 in a 365-day year leaves Oct 2 .. Dec 31 = 31-2+1 (Oct) + 30 (Nov)
    // + 31 (Dec) = 30 + 30 + 31 = 91 days, so f = 91/365 ≈ 0.249315 — a hair
    // under the exact quarter used above, but the same mechanism.
    const startYear = 2025; // not a leap year
    const f = yearFractionRemaining(startYear, startYear, `${startYear}-10-02`);
    expect(f).toBeCloseTo(91 / 365, 10);

    const result = runPlan(
      plan({
        settings: { startYear, projectionYears: 1, asOfDate: `${startYear}-10-02` } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRate: 12 })],
      }),
    );
    const close = result.years[0].accounts[0].close;
    const expectedClose = 100_000 * Math.pow(1.12, f); // ≈ 102,865.75
    expect(close).toBeCloseTo(expectedClose, 4);
    expect(close).toBeCloseTo(102_865.75, 2);

    // And it must be MEASURABLY different from the old linear convention
    // (100,000 * (1 + 0.12 * f) ≈ 102,991.78) — otherwise this test could
    // pass against either formula and would not actually pin the decision.
    const linearClose = 100_000 * (1 + 0.12 * f);
    expect(Math.abs(close - linearClose)).toBeGreaterThan(100);
  });

  it('an as-of date of January 1st means a full year (no stub at all)', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, asOfDate: '2026-01-01' } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 50_000, growthRate: 8 })],
      }),
    );
    expect(result.years[0].accounts[0].close).toBeCloseTo(50_000 * 1.08, 6);
  });

  it('accounts for a leap year in the day count (2028)', () => {
    // 2028 is a leap year (366 days). Aug 23 is day 236 (Jan 31 + Feb 29 +
    // Mar 31 + Apr 30 + May 31 + Jun 30 + Jul 31 + 23 = 31+29+31+30+31+30+31+23
    // = 236), so 131 days remain (366 - 235 elapsed = 131), f = 131/366.
    const f = yearFractionRemaining(2028, 2028, '2028-08-23');
    expect(f).toBeCloseTo(131 / 366, 10);

    const result = runPlan(
      plan({
        settings: { startYear: 2028, projectionYears: 1, asOfDate: '2028-08-23' } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRate: 10 })],
      }),
    );
    const expectedClose = 100_000 * Math.pow(1.1, 131 / 366);
    expect(result.years[0].accounts[0].close).toBeCloseTo(expectedClose, 6);
  });
});

describe('Golden: full-year growth is unaffected by the stub-year fix', () => {
  it('compounds a plain fixed rate year over year (10%, 3 years: 100k -> 110k -> 121k -> 133.1k)', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 3 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRate: 10 })],
      }),
    );
    const closes = result.years.map((y) => y.accounts[0].close);
    expect(closes[0]).toBeCloseTo(110_000, 6);
    expect(closes[1]).toBeCloseTo(121_000, 6);
    expect(closes[2]).toBeCloseTo(133_100, 6);
  });
});

describe('Golden: mid-year convention for contributions', () => {
  it('a full-year contribution earns HALF a period of growth, not zero and not a full period', () => {
    // Hand check: opening $100k compounds the WHOLE year at 5%: 100,000 *
    // 0.05 = 5,000. The $44k swept-in surplus compounds for HALF the year:
    // 44,000 * (1.05^0.5 - 1) ≈ 44,000 * 0.0246950766 ≈ 1,086.58.
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineIncome: 144_000, baselineExpenses: 100_000 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRate: 5 })],
        rules: [rule('b', 'allocation', 1)],
      }),
    );
    const row = result.years[0].accounts[0];
    expect(row.contributions).toBeCloseTo(44_000, 6);
    const expectedGrowth = 100_000 * 0.05 + 44_000 * (Math.pow(1.05, 0.5) - 1);
    expect(row.growth).toBeCloseTo(expectedGrowth, 2);
    expect(row.growth).toBeCloseTo(6_086.58, 2);
  });

  it('a stub-year contribution is credited HALF of the STUB fraction (f/2), not half of a full year', () => {
    const f = yearFractionRemaining(2026, 2026, '2026-07-02');
    // Jul 2 is day 183 of 365 (31+28+31+30+31+30+2 = 183), so f = 183/365.
    expect(f).toBeCloseTo(183 / 365, 10);

    const result = runPlan(
      plan({
        settings: {
          projectionYears: 1,
          asOfDate: '2026-07-02',
          baselineIncome: 200_000,
          baselineExpenses: 100_000,
        } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRate: 8 })],
        rules: [rule('b', 'allocation', 1)],
      }),
    );
    const row = result.years[0].accounts[0];
    // Baseline income/expenses are RECURRING flows, so both prorate
    // LINEARLY by f (docs/MATH.md): the $100k/yr surplus becomes exactly
    // 100,000 * f, swept in full since the one allocation rule has no cap.
    const expectedContribution = 100_000 * f;
    expect(row.contributions).toBeCloseTo(expectedContribution, 4);

    const fullFactor = effectiveRateForFraction(8, f);
    const halfFactor = effectiveRateForFraction(8, f / 2);
    // The opening $100k compounds for the WHOLE stub period f; the
    // contribution — credited mid-year — only compounds for f/2.
    const expectedGrowth = 100_000 * fullFactor + row.contributions * halfFactor;
    expect(row.growth).toBeCloseTo(expectedGrowth, 2);
    expect(row.close).toBeCloseTo(100_000 + row.contributions + expectedGrowth, 2);
  });
});

describe('Golden: symmetric mid-year convention for withdrawals', () => {
  it('a withdrawal forgoes HALF a period of growth, not all of it', () => {
    // $200k @ 10%, a $40k need with no tax/penalty (flat rate 0), so the
    // gross withdrawal is exactly $40k.
    // Hand check: growthBase = 200,000 - 40,000 = 160,000, full year on that:
    // 160,000 * 0.10 = 16,000. The $40k withdrawal is credited back
    // (fullFactor - halfFactor) of growth: fullFactor = 0.1, halfFactor =
    // 1.1^0.5 - 1 ≈ 0.0488088, so 40,000 * 0.0511912 ≈ 2,047.65.
    // Total growth ≈ 18,047.65 — MORE than the old convention's 16,000 (all
    // growth on the withdrawn amount forgone) and LESS than a full period's
    // credit would give (16,000 + 40,000 * 0.1 = 20,000).
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineIncome: 0, baselineExpenses: 40_000 } as never,
        accounts: [
          asset({
            id: 'b',
            name: 'Brokerage',
            initialBalance: 200_000,
            growthRate: 10,
            withdrawalTaxRate: 0,
            taxableWithdrawalPercent: 0,
            penaltyRate: 0,
          }),
        ],
        rules: [rule('b', 'withdrawal', 1)],
      }),
    );
    const row = result.years[0].accounts[0];
    expect(row.withdrawals).toBeCloseTo(40_000, 2);
    const fullFactor = Math.pow(1.1, 1) - 1;
    const halfFactor = Math.pow(1.1, 0.5) - 1;
    const expectedGrowth = 160_000 * fullFactor + 40_000 * (fullFactor - halfFactor);
    expect(row.growth).toBeCloseTo(expectedGrowth, 2);
    expect(row.growth).toBeCloseTo(18_047.65, 2);
    expect(row.growth).toBeGreaterThan(16_000); // more than "forgoes it all"
    expect(row.growth).toBeLessThan(20_000); // less than "forgoes none of it"
  });
});

describe('Golden: withdrawal waterfall order', () => {
  it('drains the first-ordered account fully before touching the next', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineIncome: 0, baselineExpenses: 45_000 } as never,
        accounts: [
          asset({ id: 'c', name: 'Cash', accountClass: 'cash', initialBalance: 20_000, growthRateMethod: 'noChange' }),
          asset({ id: 'b', name: 'Brokerage', initialBalance: 100_000, growthRateMethod: 'noChange' }),
        ],
        rules: [rule('c', 'withdrawal', 1), rule('b', 'withdrawal', 2)],
      }),
    );
    const [cash, brokerage] = result.years[0].accounts;
    // $45k need: cash (order 1) supplies everything it has ($20k), and the
    // remaining $25k comes from brokerage (order 2) — never the reverse.
    expect(cash.close).toBeCloseTo(0, 2);
    expect(brokerage.close).toBeCloseTo(75_000, 2);
  });
});
