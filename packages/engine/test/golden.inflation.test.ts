/**
 * Golden tests — inflation and both dollar modes: `presentValue` deflates a
 * partial first year by its own fraction, not a full year
 * (docs/ROADMAP-10.md "Track A: Truth" item 3 / decision 1, docs/MATH.md).
 */
import { describe, expect, it } from 'vitest';
import { deflate, presentValue } from '../src/inflation.js';
import { runPlan } from '../src/run.js';
import { yearFractionRemaining } from '../src/partialYear.js';
import { plan } from './fixtures.js';

describe('Golden: presentValue deflates the stub year by its own fraction', () => {
  it('with no stub (fraction 1, the default), startYear itself is a full year removed from "today"', () => {
    // `startYearFraction` defaults to 1 — a plan with no partial first year,
    // i.e. asOfDate is January 1st. By startYear's own Dec 31 close, a FULL
    // year has passed since that Jan 1 "today" — so it deflates by exactly
    // ONE year, not zero. (This is itself a corrected reading, not the
    // pre-fix default: the old `deflate()` deflated startYear by ZERO years
    // regardless of asOfDate, silently treating "today" as Dec 31 of
    // startYear rather than Jan 1st of it.)
    expect(presentValue(100_000, 2026, 2026, 3)).toBeCloseTo(100_000 / 1.03, 6);
    expect(presentValue(100_000, 2027, 2026, 3)).toBeCloseTo(100_000 / Math.pow(1.03, 2), 6);
  });

  it('a partial startYear deflates by ONLY the fraction elapsed, and later years by fraction + full years', () => {
    // Hand check: f = 183/365 (Jul 2 is day 183 of 365). The stub year's own
    // close is f years of inflation away from "today" (asOfDate), and the
    // NEXT year's close is f + 1 years away.
    const f = 183 / 365;
    expect(presentValue(100_000, 2026, 2026, 3, f)).toBeCloseTo(100_000 / Math.pow(1.03, f), 6);
    expect(presentValue(100_000, 2027, 2026, 3, f)).toBeCloseTo(100_000 / Math.pow(1.03, f + 1), 6);
  });
});

describe('Golden: deflate() uses the BALANCE deflator for a snapshot (W3#2, unchanged/PASS)', () => {
  it('deflates accounts/assets/liabilities/netWorth by the stub fraction, same as before this fix', () => {
    const f = yearFractionRemaining(2026, 2026, '2026-07-02');
    expect(f).toBeCloseTo(183 / 365, 10);

    const result = runPlan(
      plan({
        settings: {
          startYear: 2026,
          projectionYears: 2,
          asOfDate: '2026-07-02',
          inflationRate: 3,
          baselineIncome: 0,
          baselineExpenses: 0,
        } as never,
      }),
    );
    const deflated = deflate(result, 3);

    expect(deflated.years[0].netWorth).toBeCloseTo(result.years[0].netWorth / Math.pow(1.03, f), 6);
    expect(deflated.years[1].netWorth).toBeCloseTo(result.years[1].netWorth / Math.pow(1.03, f + 1), 6);
  });
});

describe('Golden: deflate() uses the FLOW deflator for income/expenses/etc. (W3#2 fix)', () => {
  // These are the review's own 5c/5e failing cases: a baseline income set to
  // $100k (meaning "$100k in today's dollars") must read back as exactly
  // $100k in a full year, whatever the stub fraction was and whether
  // `asOfDate` is set at all -- because `flowFactor(year) =
  // (1+i)^(year-startYear)` exactly undoes the SAME exponent `run.ts`'s
  // `inflationAt` used to inflate it, with no extra stub-fraction term (a
  // flow's SIZE is prorated by the stub fraction, which is a quantity, not a
  // price level, and must not be deflated again).
  it('a $100k "today" income reads flat $100k in year 1, with asOfDate set mid-year (case 5c)', () => {
    const f = yearFractionRemaining(2026, 2026, '2026-09-25');
    const result = runPlan(
      plan({
        settings: {
          startYear: 2026,
          projectionYears: 2,
          asOfDate: '2026-09-25',
          inflationRate: 3,
          baselineIncome: 100_000,
          baselineExpenses: 0,
        } as never,
      }),
    );
    const deflated = deflate(result, 3);

    // Year 0 (the stub): nominal income is only f of a full year (a
    // recurring flow prorates LINEARLY), and flowFactor(year0) = 1.03^0 = 1,
    // so it reads back as exactly f * 100,000 -- the flat $100k rate, times
    // however much of the year was actually lived.
    expect(deflated.years[0].totalIncome).toBeCloseTo(100_000 * f, 2);

    // Year 1: a full year at the same real rate. Nominal grew one year of
    // inflation (100,000 * 1.03); flowFactor(year1) = 1.03^1 divides that
    // right back out to exactly 100,000 -- matching the review's hand value,
    // not its FAIL reading of 99,209.51.
    expect(deflated.years[1].totalIncome).toBeCloseTo(100_000, 2);
  });

  it('the same, with asOfDate unset entirely -- still flat $100k, not 97,087.38 (case 5e, a regression vs. main)', () => {
    const result = runPlan(
      plan({
        settings: {
          startYear: 2026,
          projectionYears: 2,
          inflationRate: 3,
          baselineIncome: 100_000,
          baselineExpenses: 0,
        } as never,
      }),
    );
    const deflated = deflate(result, 3);

    expect(deflated.years[0].totalIncome).toBeCloseTo(100_000, 2);
    expect(deflated.years[1].totalIncome).toBeCloseTo(100_000, 2);
  });

  it('falls back to flowFactor(year) = (1+i)^(year-startYear) for a PlanResult built without an opening snapshot', () => {
    const bare = { startYear: 2026, endYear: 2026, years: [{ ...zeroYear(2026), totalIncome: 100_000 }], warnings: [] };
    const deflated = deflate(bare as never, 3);
    // flowFactor(2026) = 1.03^(2026-2026) = 1 -- unlike the balance
    // deflator, this one does NOT default to "startYear is a full year
    // ahead"; a flow was never a stub-year-relative snapshot to begin with.
    expect(deflated.years[0].totalIncome).toBeCloseTo(100_000, 6);
  });
});

function zeroYear(year: number) {
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
    assets: 0,
    liabilities: 0,
    netWorth: 0,
  };
}
