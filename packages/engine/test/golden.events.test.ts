/**
 * Golden tests — home appreciation & purchase costs, job raises/comp
 * steps/RSU vests, and Social Security COLA (docs/ROADMAP-10.md "Track A:
 * Truth", docs/MATH.md).
 */
import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/run.js';
import { yearFractionRemaining } from '../src/partialYear.js';
import { asset, event, plan, rule } from './fixtures.js';

describe('Golden: home appreciation and purchase costs', () => {
  it('the down payment + closing costs equal exactly price * (downPct + closingPct)', () => {
    // Hand check: $1,000,000 * (20% down + 3% closing) = $230,000.
    const result = runPlan(
      plan({
        settings: { startYear: 2026, projectionYears: 5, baselineIncome: 250_000, baselineExpenses: 80_000 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 600_000, growthRateMethod: 'noChange' })],
        events: [
          event({
            id: 'h',
            kind: 'buyAHome',
            name: 'House',
            startYear: 2029,
            config: { price: 1_000_000, downPaymentPercent: 20, closingCostPercent: 3, appreciationRate: 4 },
          }),
        ],
        rules: [rule('b', 'withdrawal', 1)],
      }),
    );
    const downLine = result.years
      .find((y) => y.year === 2029)!
      .expenses.find((e) => e.label.includes('down payment'));
    expect(downLine?.amount).toBeCloseTo(230_000, 2);
  });

  it('appreciates the home account at the stated rate in a full (non-stub) purchase year', () => {
    // Hand check: $1,000,000 * 1.04 = $1,040,000 one year after purchase.
    const result = runPlan(
      plan({
        settings: { startYear: 2026, projectionYears: 5, baselineIncome: 250_000, baselineExpenses: 80_000 } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 600_000, growthRateMethod: 'noChange' })],
        events: [
          event({ id: 'h', kind: 'buyAHome', name: 'House', startYear: 2029, config: { price: 1_000_000, appreciationRate: 4 } }),
        ],
        rules: [rule('b', 'withdrawal', 1)],
      }),
    );
    const homeNextYear = result.years.find((y) => y.year === 2030)!.accounts.find((a) => a.accountId === 'h:home')!;
    expect(homeNextYear.open).toBeCloseTo(1_040_000, 0);
  });

  it('prices carrying costs off a value that compounds the STUB purchase year by its own fraction, not a full year', () => {
    // The house is bought in the plan's own partial startYear, so the
    // "value" the carrying-cost lines (property tax here, isolated by
    // zeroing insurance/maintenance/HOA) are priced against must compound
    // by the STUB fraction f for that first year, then full years after —
    // exactly like the home ACCOUNT's own balance does (docs/MATH.md "Home
    // appreciation and purchase costs").
    const f = yearFractionRemaining(2026, 2026, '2026-07-02');
    expect(f).toBeCloseTo(183 / 365, 10);

    const result = runPlan(
      plan({
        settings: {
          startYear: 2026,
          projectionYears: 3,
          asOfDate: '2026-07-02',
          baselineIncome: 250_000,
          baselineExpenses: 80_000,
        } as never,
        accounts: [asset({ id: 'b', name: 'Brokerage', initialBalance: 600_000, growthRateMethod: 'noChange' })],
        events: [
          event({
            id: 'h',
            kind: 'buyAHome',
            name: 'House',
            startYear: 2026,
            config: {
              price: 1_000_000,
              appreciationRate: 4,
              propertyTaxRate: 1.1,
              insuranceAnnual: 0,
              maintenancePercent: 0,
              hoaMonthly: 0,
            },
          }),
        ],
        rules: [rule('b', 'withdrawal', 1)],
      }),
    );

    const upkeep2027 = result.years
      .find((y) => y.year === 2027)!
      .expenses.find((e) => e.label.includes('upkeep'))!;
    const upkeep2028 = result.years
      .find((y) => y.year === 2028)!
      .expenses.find((e) => e.label.includes('upkeep'))!;

    // Hand check: elapsedYears(2027) = f + (2027 - 2026 - 1) = f ≈ 0.50137.
    // value2027 = 1,000,000 * 1.04^f ≈ 1,019,858.70, propertyTax ≈ 11,218.45.
    // elapsedYears(2028) = f + 1. value2028 = 1,000,000 * 1.04^(f+1) ≈
    // 1,060,653.04, propertyTax ≈ 11,667.18.
    const value2027 = 1_000_000 * Math.pow(1.04, f);
    const value2028 = 1_000_000 * Math.pow(1.04, f + 1);
    expect(upkeep2027.amount).toBeCloseTo(value2027 * 0.011, 2);
    expect(upkeep2027.amount).toBeCloseTo(11_218.45, 1);
    expect(upkeep2028.amount).toBeCloseTo(value2028 * 0.011, 2);

    // And it must be MEASURABLY different from the old "buyYear was always
    // a full year" formula (1,000,000 * 1.04^1 * 0.011 = $11,440) —
    // otherwise this test would not actually pin the fix.
    const oldBuggyTax2027 = 1_000_000 * Math.pow(1.04, 1) * 0.011;
    expect(Math.abs(upkeep2027.amount - oldBuggyTax2027)).toBeGreaterThan(100);
  });
});

describe('Golden: job raises, comp steps and RSU vests', () => {
  it('raises the base salary each year until a comp step resets it, then raises from the new base', () => {
    const result = runPlan(
      plan({
        settings: { startYear: 2026, projectionYears: 6 } as never,
        events: [
          event({
            id: 'j',
            kind: 'job',
            name: 'Engineer',
            startYear: 2026,
            config: {
              salary: 150_000,
              annualRaise: 3,
              bonusPercent: 0,
              signingBonus: 0,
              replacesEarnedIncome: false,
              compSteps: [{ year: 2029, newBaseSalary: 200_000 }],
            },
          }),
        ],
      }),
    );
    const salaryIn = (year: number) =>
      result.years.find((y) => y.year === year)!.income.find((l) => l.sourceEventId === 'j')!.amount;

    // Hand check: 150,000 * 1.03^2 = 159,135 (2 raises before the step).
    expect(salaryIn(2028)).toBeCloseTo(159_135, 2);
    // The step year jumps straight to the new base — no raise applied yet.
    expect(salaryIn(2029)).toBeCloseTo(200_000, 2);
    // Then raises compound from the NEW base: 200,000 * 1.03^2 = 212,180.
    expect(salaryIn(2031)).toBeCloseTo(212_180, 2);
  });

  it('vests an RSU grant as a one-off, non-earned taxable cash flow in its own year only', () => {
    const result = runPlan(
      plan({
        settings: { startYear: 2026, projectionYears: 4 } as never,
        events: [
          event({
            id: 'j',
            kind: 'job',
            name: 'Engineer',
            startYear: 2026,
            config: {
              salary: 150_000,
              bonusPercent: 0,
              annualRaise: 0,
              replacesEarnedIncome: false,
              rsuVesting: [{ year: 2028, amount: 40_000 }],
            },
          }),
        ],
      }),
    );
    const vestLine = (year: number) =>
      result.years.find((y) => y.year === year)!.income.find((l) => l.label.includes('RSU vest'));
    expect(vestLine(2028)?.amount).toBeCloseTo(40_000, 6);
    expect(vestLine(2027)).toBeUndefined();
    expect(vestLine(2029)).toBeUndefined();
  });
});

describe('Golden: Social Security COLA', () => {
  it('grows the benefit at the COLA rate and taxes only the stated taxable share', () => {
    const result = runPlan(
      plan({
        settings: { startYear: 2026, projectionYears: 6 } as never,
        participants: [{ id: 'p1', name: 'A', birthYear: 1960, lifeExpectancy: 95, isIncluded: true }],
        events: [
          event({
            id: 's',
            kind: 'socialSecurity',
            name: 'Social Security',
            startYear: 2026,
            config: { annualBenefit: 30_000, colaRate: 2.5, taxablePercent: 85 },
          }),
        ],
      }),
    );
    const taxableIn = (year: number) =>
      result.years.find((y) => y.year === year)!.income.find((l) => l.sourceEventId === 's' && l.label === 'Social Security');
    const untaxedIn = (year: number) =>
      result.years
        .find((y) => y.year === year)!
        .income.find((l) => l.sourceEventId === 's' && l.label.includes('untaxed portion'));

    // Hand check: year 0 benefit is $30,000 flat; 85% of it, $25,500, is
    // taxable, and the other 15% ($4,500) is not.
    expect(taxableIn(2026)?.amount).toBeCloseTo(25_500, 2);
    expect(untaxedIn(2026)?.amount).toBeCloseTo(4_500, 2);

    // Hand check: 5 years of 2.5% COLA: 30,000 * 1.025^5 ≈ 33,942.25;
    // 85% of that ≈ 28,850.91.
    const benefitYear5 = 30_000 * Math.pow(1.025, 5);
    expect(taxableIn(2031)?.amount).toBeCloseTo(benefitYear5 * 0.85, 2);
    expect(taxableIn(2031)?.amount).toBeCloseTo(28_850.91, 2);
  });
});
