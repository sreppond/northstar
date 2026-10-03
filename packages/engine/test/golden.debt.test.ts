/**
 * Golden tests — mortgage amortization: the monthly payment formula, a
 * partial (stub) first year stepping fewer months, and the remaining
 * balance after N years against the standard closed-form amortization
 * formula (docs/ROADMAP-10.md "Track A: Truth", docs/MATH.md).
 */
import { describe, expect, it } from 'vitest';
import { amortizeYear, monthlyPayment } from '../src/accounts.js';
import { monthsRemaining } from '../src/partialYear.js';
import { runPlan } from '../src/run.js';
import { asset, liability, plan } from './fixtures.js';

const PRINCIPAL = 400_000;
const APR = 6;
const TERM_YEARS = 30;

/** The standard closed-form remaining-balance formula, independent of
 * `amortizeYear`'s own month-by-month loop:
 *   B_k = P * [(1+r)^n - (1+r)^k] / [(1+r)^n - 1]
 * where n is the total number of payments and k the number already made. */
function standardRemainingBalance(principal: number, aprPercent: number, termYears: number, yearsElapsed: number) {
  const n = Math.round(termYears * 12);
  const r = aprPercent / 100 / 12;
  const k = yearsElapsed * 12;
  return (principal * (Math.pow(1 + r, n) - Math.pow(1 + r, k))) / (Math.pow(1 + r, n) - 1);
}

describe('Golden: the monthly payment formula', () => {
  it('matches payment = P * r / (1 - (1+r)^-n) by hand', () => {
    // Hand check: r = 6%/12 = 0.5%/mo, n = 360 months.
    // payment = 400,000 * 0.005 / (1 - 1.005^-360) ≈ $2,398.20/mo,
    // so $28,778.43/yr.
    const r = APR / 100 / 12;
    const n = TERM_YEARS * 12;
    const expectedMonthly = (PRINCIPAL * r) / (1 - Math.pow(1 + r, -n));
    expect(monthlyPayment(PRINCIPAL, APR, TERM_YEARS)).toBeCloseTo(expectedMonthly, 6);
    expect(monthlyPayment(PRINCIPAL, APR, TERM_YEARS)).toBeCloseTo(2_398.2, 1);
  });

  it('falls back to a straight-line P/n when the rate is zero', () => {
    expect(monthlyPayment(120_000, 0, 10)).toBeCloseTo(120_000 / 120, 6);
  });
});

describe('Golden: a partial (stub) first year steps fewer months', () => {
  it('monthsRemaining rounds fraction * 12', () => {
    expect(monthsRemaining(1)).toBe(12);
    expect(monthsRemaining(0.25)).toBe(3);
    expect(monthsRemaining(131 / 365)).toBe(Math.round((131 / 365) * 12)); // 4
    expect(monthsRemaining(131 / 365)).toBe(4);
  });

  it('charges materially less interest over 4 stepped months than over a full 12', () => {
    const annualPayment = monthlyPayment(PRINCIPAL, APR, TERM_YEARS) * 12;
    const fullYear = amortizeYear(PRINCIPAL, APR, annualPayment, 12);
    const fourMonths = amortizeYear(PRINCIPAL, APR, annualPayment, 4);
    // Hand check: 4 months of ~0.5%/mo simple-stepped interest on $400k is
    // roughly 4 * 400,000 * 0.005 ≈ $8,000 — a third of a full year's,
    // give or take principal paydown along the way.
    expect(fourMonths.interest).toBeGreaterThan(7_500);
    expect(fourMonths.interest).toBeLessThan(8_100);
    expect(fourMonths.interest).toBeLessThan(fullYear.interest / 2.5);
  });

  it('runs the reduced month-count through runPlan for a real stub-year plan', () => {
    const fullYear = runPlan(
      plan({
        settings: { projectionYears: 1 } as never,
        accounts: [liability({ id: 'm', name: 'Mortgage', initialBalance: PRINCIPAL, interestRate: APR, termYears: TERM_YEARS })],
      }),
    );
    const partial = runPlan(
      plan({
        settings: { projectionYears: 1, asOfDate: '2026-09-01' } as never, // ~4 months left
        accounts: [liability({ id: 'm', name: 'Mortgage', initialBalance: PRINCIPAL, interestRate: APR, termYears: TERM_YEARS })],
      }),
    );
    expect(partial.years[0].accounts[0].interest).toBeLessThan(fullYear.years[0].accounts[0].interest / 2);
    expect(partial.years[0].accounts[0].interest).toBeGreaterThan(0);
  });
});

describe('Golden: remaining balance after N years matches the standard amortization formula', () => {
  it('after 5 years', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 5 } as never,
        accounts: [liability({ id: 'm', name: 'Mortgage', initialBalance: PRINCIPAL, interestRate: APR, termYears: TERM_YEARS })],
      }),
    );
    const close = result.years[4].accounts[0].close;
    const expected = standardRemainingBalance(PRINCIPAL, APR, TERM_YEARS, 5);
    expect(close).toBeCloseTo(expected, 2);
    expect(close).toBeCloseTo(372_217.43, 1);
  });

  it('after 10 years', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 10 } as never,
        accounts: [liability({ id: 'm', name: 'Mortgage', initialBalance: PRINCIPAL, interestRate: APR, termYears: TERM_YEARS })],
      }),
    );
    const close = result.years[9].accounts[0].close;
    const expected = standardRemainingBalance(PRINCIPAL, APR, TERM_YEARS, 10);
    expect(close).toBeCloseTo(expected, 2);
    expect(close).toBeCloseTo(334_742.9, 0);
  });
});
