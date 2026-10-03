import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/run.js';
import { yearFractionRemaining } from '../src/partialYear.js';
import { asset, event, liability, plan } from './fixtures.js';

describe('yearFractionRemaining', () => {
  it('is a full year for anything other than startYear', () => {
    expect(yearFractionRemaining(2027, 2026, '2026-08-23')).toBe(1);
  });

  it('is a full year when asOfDate is missing', () => {
    expect(yearFractionRemaining(2026, 2026, undefined)).toBe(1);
  });

  it('is a full year on January 1st', () => {
    expect(yearFractionRemaining(2026, 2026, '2026-01-01')).toBe(1);
  });

  it('matches the 131/365 days left after August 23, 2026', () => {
    expect(yearFractionRemaining(2026, 2026, '2026-08-23')).toBeCloseTo(131 / 365, 10);
  });

  it('leaves only a sliver on December 31st', () => {
    expect(yearFractionRemaining(2026, 2026, '2026-12-31')).toBeCloseTo(1 / 365, 10);
  });

  it('accounts for leap years', () => {
    // 2028 is a leap day year; Aug 23 is still day 236 of 366.
    expect(yearFractionRemaining(2028, 2028, '2028-08-23')).toBeCloseTo(131 / 366, 10);
  });

  it('ignores an as-of date outside startYear', () => {
    expect(yearFractionRemaining(2026, 2026, '2025-08-23')).toBe(1);
  });
});

describe('runPlan — partial first year', () => {
  it('prorates growth for the fraction of startYear left, as of the given date', () => {
    // The reported bug: $80k at 10% must NOT compound a full year in 2026
    // when we are already partway through it.
    //
    // MOVED (owner decision 1, docs/MATH.md "Partial-year growth compounds"):
    // this used to assert the LINEAR proration 80,000 * (1 + 10% * 131/365)
    // ≈ 82,849. The engine now COMPOUNDS the stub fraction instead:
    // 80,000 * 1.1^(131/365) ≈ 82,785 — slightly less, because a shorter
    // period cannot re-invest its own fractional gains the way linear
    // proration implicitly assumes.
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, asOfDate: '2026-08-23' } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 80_000, growthRate: 10 })],
      }),
    );
    const close = result.years[0].accounts[0].close;
    expect(close).toBeCloseTo(80_000 * Math.pow(1.1, 131 / 365), 6);
    expect(close).toBeGreaterThan(82_500);
    expect(close).toBeLessThan(83_100);
  });

  it('runs a full year when asOfDate is unset (backward compatible)', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 80_000, growthRate: 10 })],
      }),
    );
    expect(result.years[0].accounts[0].close).toBeCloseTo(88_000, 6);
  });

  it('runs a full year when asOfDate is January 1st', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, asOfDate: '2026-01-01' } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 80_000, growthRate: 10 })],
      }),
    );
    expect(result.years[0].accounts[0].close).toBeCloseTo(88_000, 6);
  });

  it('does not prorate later years, even when the first year is partial', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 2, asOfDate: '2026-08-23' } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 80_000, growthRate: 10 })],
      }),
    );
    const [y1, y2] = result.years;
    expect(y2.accounts[0].close).toBeCloseTo(y1.accounts[0].close * 1.1, 6);
  });

  it('prorates baseline income and expenses', () => {
    const result = runPlan(
      plan({
        settings: {
          projectionYears: 1,
          asOfDate: '2026-08-23',
          baselineIncome: 100_000,
          baselineExpenses: 40_000,
        } as never,
      }),
    );
    const fraction = 131 / 365;
    expect(result.years[0].totalIncome).toBeCloseTo(100_000 * fraction, 6);
    expect(result.years[0].totalExpenses).toBeCloseTo(40_000 * fraction, 6);
  });

  it('prorates a recurring income event but not a one-time windfall', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, asOfDate: '2026-08-23' } as never,
        events: [
          event({
            id: 'salary',
            kind: 'income',
            startYear: 2026,
            config: { amount: 120_000, isEarned: true, isTaxable: false },
          }),
          event({
            id: 'gift',
            kind: 'windfall',
            startYear: 2026,
            config: { amount: 10_000, taxRate: 0 },
          }),
        ],
      }),
    );
    const fraction = 131 / 365;
    const salaryLine = result.years[0].income.find((l) => l.sourceEventId === 'salary');
    const windfallLine = result.years[0].income.find((l) => l.sourceEventId === 'gift');
    expect(salaryLine?.amount).toBeCloseTo(120_000 * fraction, 2);
    expect(windfallLine?.amount).toBeCloseTo(10_000, 6);
  });

  it('prorates debt interest to the months left in a partial first year', () => {
    const fullYear = runPlan(
      plan({
        settings: { projectionYears: 1 } as never,
        accounts: [
          liability({
            id: 'loan',
            name: 'Loan',
            initialBalance: 100_000,
            interestRate: 12,
            minimumPayment: 0,
          }),
        ],
      }),
    );
    const partial = runPlan(
      plan({
        settings: { projectionYears: 1, asOfDate: '2026-09-01' } as never, // ~4 months left
        accounts: [
          liability({
            id: 'loan',
            name: 'Loan',
            initialBalance: 100_000,
            interestRate: 12,
            minimumPayment: 0,
          }),
        ],
      }),
    );
    expect(fullYear.years[0].accounts[0].interest).toBeGreaterThan(12_000);
    // ~4 months of 1%/mo simple-stepped interest on 100k, materially less
    // than a full year's.
    expect(partial.years[0].accounts[0].interest).toBeLessThan(fullYear.years[0].accounts[0].interest / 2);
    expect(partial.years[0].accounts[0].interest).toBeGreaterThan(0);
  });
});
