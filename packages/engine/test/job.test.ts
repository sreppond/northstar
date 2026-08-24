/**
 * The consolidated `job` event (docs/REDESIGN.md §2.1): one employer's whole
 * arc — a piecewise salary curve, RSU vests, and the income replacement that
 * stops a new role from silently doubling the plan's income.
 */
import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/run.js';
import { asset, event, plan } from './fixtures.js';

const incomeIn = (result: ReturnType<typeof runPlan>, year: number) =>
  result.years.find((y) => y.year === year)!.totalIncome;

const lineIn = (result: ReturnType<typeof runPlan>, year: number, label: string) =>
  result.years
    .find((y) => y.year === year)!
    .income.filter((l) => l.label === label)
    .reduce((sum, l) => sum + l.amount, 0);

describe('job — piecewise salary curve', () => {
  it('raises annually until a comp step resets the base, then raises from there', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 5 } as never,
        events: [
          event({
            id: 'amazon',
            kind: 'job',
            name: 'Amazon',
            startYear: 2026,
            config: {
              salary: 100_000,
              annualRaise: 10,
              bonusPercent: 0,
              replacesEarnedIncome: false,
              compSteps: [{ year: 2028, newBaseSalary: 200_000, label: 'New role' }],
            },
          }),
        ],
      }),
    );

    // Raise compounds from the start...
    expect(incomeIn(result, 2026)).toBeCloseTo(100_000, 6);
    expect(incomeIn(result, 2027)).toBeCloseTo(110_000, 6);
    // ...the step resets the base in its year...
    expect(incomeIn(result, 2028)).toBeCloseTo(200_000, 6);
    // ...and the raise compounds from the new base after it.
    expect(incomeIn(result, 2029)).toBeCloseTo(220_000, 6);
    expect(incomeIn(result, 2030)).toBeCloseTo(242_000, 6);
  });

  it('applies the bonus on top of base and contributes off base, not the bonus', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1 } as never,
        accounts: [
          // A cash account to absorb the swept surplus, so `r` only ever
          // receives the job's own 401(k) contributions.
          asset({ id: 'c', name: 'Cash', accountClass: 'cash', growthRateMethod: 'noChange' }),
          asset({ id: 'r', name: '401k', accountClass: 'taxDeferredInvestment' }),
        ],
        events: [
          event({
            id: 'amazon',
            kind: 'job',
            name: 'Amazon',
            startYear: 2026,
            config: {
              salary: 100_000,
              annualRaise: 0,
              bonusPercent: 10,
              replacesEarnedIncome: false,
              contributionAccountId: 'r',
              retirementContributionPercent: 6,
              employerMatchPercent: 3,
            },
          }),
        ],
      }),
    );

    // Salary + 10% bonus on the salary line.
    expect(lineIn(result, 2026, 'Amazon')).toBeCloseTo(110_000, 6);
    // Contributions are 6% + 3% of BASE (100k), never of the bonus.
    const r = result.years[0].accounts.find((a) => a.accountId === 'r')!;
    expect(r.contributions).toBeCloseTo(9_000, 6);
  });
});

describe('job — RSU vesting', () => {
  it('lands each vest as a one-off, taxable, non-earned income line', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 4, incomeTaxRate: 20 } as never,
        events: [
          event({
            id: 'amazon',
            kind: 'job',
            name: 'Amazon',
            startYear: 2026,
            config: {
              salary: 0,
              annualRaise: 0,
              bonusPercent: 0,
              replacesEarnedIncome: false,
              rsuVesting: [{ year: 2026, amount: 100_000 }],
            },
          }),
        ],
      }),
    );

    // The vest shows once, in its year, as its own line...
    expect(lineIn(result, 2026, 'Amazon — RSU vest')).toBeCloseTo(100_000, 6);
    expect(lineIn(result, 2027, 'Amazon — RSU vest')).toBe(0);
    // ...and it is taxable at the ordinary rate (20% of 100k).
    const tax = result.years[0].taxes.reduce((s, l) => s + l.amount, 0);
    expect(tax).toBeCloseTo(20_000, 6);
  });

  it('does not let a later retirement claw a vest back (it is not earned)', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 3 } as never,
        events: [
          event({
            id: 'amazon',
            kind: 'job',
            name: 'Amazon',
            startYear: 2026,
            config: {
              salary: 50_000,
              annualRaise: 0,
              bonusPercent: 0,
              replacesEarnedIncome: false,
              rsuVesting: [{ year: 2027, amount: 80_000 }],
            },
          }),
          event({ id: 'ret', kind: 'retirement', name: 'Retire', startYear: 2027, config: {} }),
        ],
      }),
    );

    // Salary is earned, so retirement zeroes it in 2027...
    expect(lineIn(result, 2027, 'Amazon')).toBe(0);
    // ...but the vest, being unearned, survives it.
    expect(incomeIn(result, 2027)).toBeCloseTo(80_000, 6);
  });
});

describe('job — income replacement', () => {
  it('zeroes the earnings it replaces without touching its own salary', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 4 } as never,
        events: [
          event({
            id: 'old',
            kind: 'income',
            name: 'Current salary',
            startYear: 2026,
            config: { amount: 100_000, isEarned: true, growthRate: 0 },
          }),
          event({
            id: 'amazon',
            kind: 'job',
            name: 'Amazon',
            startYear: 2028,
            config: {
              salary: 200_000,
              annualRaise: 0,
              bonusPercent: 0,
              replacesEarnedIncome: true,
            },
          }),
        ],
      }),
    );

    // Before the job starts, the old salary is untouched.
    expect(incomeIn(result, 2027)).toBeCloseTo(100_000, 6);
    // After, only the new one remains — not the sum of both.
    expect(lineIn(result, 2028, 'Current salary')).toBe(0);
    expect(incomeIn(result, 2028)).toBeCloseTo(200_000, 6);
  });
});
