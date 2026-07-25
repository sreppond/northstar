import { describe, expect, it } from 'vitest';
import { amortizeYear, monthlyPayment, rateFromSchedule } from '../src/accounts.js';

describe('monthlyPayment', () => {
  it('matches the standard amortization formula', () => {
    // $920,000 at 6.5% over 30 years. Cross-checked against the closed form
    // P*r/(1-(1+r)^-n) with r = 0.065/12, n = 360.
    const payment = monthlyPayment(920_000, 6.5, 30);
    expect(payment).toBeCloseTo(5815.01, 1);
  });

  it('handles a zero interest rate as straight-line repayment', () => {
    expect(monthlyPayment(120_000, 0, 10)).toBeCloseTo(1000, 6);
  });
});

describe('amortizeYear', () => {
  it('splits the first year of a mortgage into interest and principal', () => {
    const principal = 920_000;
    const annual = monthlyPayment(principal, 6.5, 30) * 12;
    const y1 = amortizeYear(principal, 6.5, annual);

    expect(y1.interest + y1.principal).toBeCloseTo(y1.payment, 6);
    expect(y1.closing).toBeCloseTo(principal - y1.principal, 6);
    // Early in a 30-year loan, interest dominates heavily.
    expect(y1.interest).toBeGreaterThan(y1.principal * 5);
  });

  it('retires the loan exactly over its term without overshooting', () => {
    let balance = 200_000;
    const annual = monthlyPayment(balance, 5, 15) * 12;
    for (let y = 0; y < 15; y++) {
      balance = amortizeYear(balance, 5, annual).closing;
    }
    expect(balance).toBeCloseTo(0, 2);
  });

  it('never pays more principal than is outstanding', () => {
    const result = amortizeYear(1_000, 5, 100_000);
    expect(result.principal).toBeLessThanOrEqual(1_000);
    expect(result.closing).toBe(0);
  });

  it('accrues negative amortization when the payment misses the interest', () => {
    const result = amortizeYear(100_000, 12, 1_200); // 12% APR, $100/mo
    expect(result.closing).toBeGreaterThan(100_000);
  });

  it('is a no-op on a zero balance', () => {
    expect(amortizeYear(0, 6, 10_000)).toEqual({
      interest: 0,
      principal: 0,
      payment: 0,
      closing: 0,
    });
  });
});

describe('rateFromSchedule', () => {
  const schedule = [
    { year: 2026, rate: 7 },
    { year: 2030, rate: 5 },
    { year: 2040, rate: 3 },
  ];

  it('steps rather than interpolating between anchors', () => {
    expect(rateFromSchedule(schedule, 2026)).toBe(7);
    expect(rateFromSchedule(schedule, 2029)).toBe(7);
    expect(rateFromSchedule(schedule, 2030)).toBe(5);
    expect(rateFromSchedule(schedule, 2039)).toBe(5);
    expect(rateFromSchedule(schedule, 2041)).toBe(3);
  });

  it('holds the first anchor for years before the schedule starts', () => {
    expect(rateFromSchedule(schedule, 2000)).toBe(7);
  });

  it('returns zero for an empty schedule', () => {
    expect(rateFromSchedule([], 2030)).toBe(0);
    expect(rateFromSchedule(undefined, 2030)).toBe(0);
  });
});
