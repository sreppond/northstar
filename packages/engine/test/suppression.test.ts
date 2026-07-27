/**
 * Income suppression — the shared machinery behind "this job replaces the last
 * one" and "retirement keeps 30% of consulting".
 *
 * These are the cases where a forecast can be wrong while looking perfectly
 * reasonable, so they are pinned here rather than left to the UI.
 */
import { describe, expect, it } from 'vitest';
import { runPlan } from '../src/run.js';
import { event, plan } from './fixtures.js';

const incomeIn = (result: ReturnType<typeof runPlan>, year: number) =>
  result.years.find((y) => y.year === year)!.totalIncome;

const lineIn = (result: ReturnType<typeof runPlan>, year: number, label: string) =>
  result.years
    .find((y) => y.year === year)!
    .income.filter((l) => l.label === label)
    .reduce((sum, l) => sum + l.amount, 0);

describe('newJob — replacesEarnedIncome', () => {
  const oldSalary = event({
    id: 'old',
    kind: 'income',
    name: 'Current salary',
    startYear: 2026,
    config: { amount: 100_000, isEarned: true, growthRate: 0 },
  });

  it('zeroes the earnings it replaces without touching its own salary', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 4 } as never,
        events: [
          oldSalary,
          event({
            id: 'job',
            kind: 'newJob',
            name: 'New role',
            startYear: 2028,
            config: { salary: 200_000, annualRaise: 0, bonusPercent: 0, replacesEarnedIncome: true },
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

  it('stacks when the setting is off, which is the bug it exists to prevent', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 4 } as never,
        events: [
          oldSalary,
          event({
            id: 'job',
            kind: 'newJob',
            startYear: 2028,
            config: {
              salary: 200_000,
              annualRaise: 0,
              bonusPercent: 0,
              replacesEarnedIncome: false,
            },
          }),
        ],
      }),
    );
    expect(incomeIn(result, 2028)).toBeCloseTo(300_000, 6);
  });

  it('does not let an earlier job suppress one that starts later', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 8 } as never,
        events: [
          event({
            id: 'a',
            kind: 'newJob',
            name: 'Job A',
            startYear: 2027,
            config: { salary: 100_000, annualRaise: 0, bonusPercent: 0 },
          }),
          event({
            id: 'b',
            kind: 'newJob',
            name: 'Job B',
            startYear: 2030,
            config: { salary: 250_000, annualRaise: 0, bonusPercent: 0 },
          }),
        ],
      }),
    );

    expect(incomeIn(result, 2029)).toBeCloseTo(100_000, 6);
    // B supersedes A, and A's open-ended suppression must not eat B.
    expect(lineIn(result, 2030, 'Job A')).toBe(0);
    expect(incomeIn(result, 2030)).toBeCloseTo(250_000, 6);
  });

  it('pays a signing bonus once, and a later suppression cannot claw it back', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 4 } as never,
        events: [
          event({
            id: 'job',
            kind: 'newJob',
            name: 'Role',
            startYear: 2026,
            config: { salary: 100_000, annualRaise: 0, bonusPercent: 0, signingBonus: 25_000 },
          }),
          event({ id: 'ret', kind: 'retirement', startYear: 2027, config: {} }),
        ],
      }),
    );
    expect(incomeIn(result, 2026)).toBeCloseTo(125_000, 6);
  });
});

describe('retirement — per-line income retention', () => {
  const build = (config: Record<string, unknown>) =>
    runPlan(
      plan({
        settings: { projectionYears: 5 } as never,
        events: [
          event({
            id: 'wages',
            kind: 'income',
            name: 'Wages',
            startYear: 2026,
            config: { amount: 200_000, isEarned: true, growthRate: 0 },
          }),
          event({
            id: 'consult',
            kind: 'income',
            name: 'Consulting',
            startYear: 2026,
            config: { amount: 50_000, isEarned: true, growthRate: 0 },
          }),
          event({
            id: 'rental',
            kind: 'income',
            name: 'Rental',
            startYear: 2026,
            config: { amount: 30_000, isEarned: false, growthRate: 0 },
          }),
          event({ id: 'ret', kind: 'retirement', startYear: 2028, config }),
        ],
      }),
    );

  it('stops every wage line by default and leaves unearned income alone', () => {
    const result = build({});
    expect(lineIn(result, 2028, 'Wages')).toBe(0);
    expect(lineIn(result, 2028, 'Consulting')).toBe(0);
    expect(lineIn(result, 2028, 'Rental')).toBeCloseTo(30_000, 6);
  });

  it('keeps the named share of an individual line', () => {
    const result = build({ incomeRetentionByEvent: { consult: 40 } });
    expect(lineIn(result, 2028, 'Wages')).toBe(0);
    expect(lineIn(result, 2028, 'Consulting')).toBeCloseTo(20_000, 6);
  });

  it('applies the default retention to lines with no setting of their own', () => {
    const result = build({
      defaultIncomeRetentionPercent: 25,
      incomeRetentionByEvent: { consult: 100 },
    });
    expect(lineIn(result, 2028, 'Wages')).toBeCloseTo(50_000, 6);
    expect(lineIn(result, 2028, 'Consulting')).toBeCloseTo(50_000, 6);
  });

  it('cuts unearned income only when told to', () => {
    const result = build({ affectsUnearnedIncome: true });
    expect(lineIn(result, 2028, 'Rental')).toBe(0);
  });

  it('leaves every line untouched in the year before it starts', () => {
    const result = build({});
    expect(incomeIn(result, 2027)).toBeCloseTo(280_000, 6);
  });
});

describe('haveAKid', () => {
  const costsIn = (result: ReturnType<typeof runPlan>, year: number) =>
    result.years.find((y) => y.year === year)!.expenses.reduce((sum, l) => sum + l.amount, 0);

  it('charges the upfront cost on top of the first full year of support', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 4 } as never,
        events: [
          event({
            id: 'kid',
            kind: 'haveAKid',
            startYear: 2026,
            config: {
              upfrontCost: 4_500,
              annualCost: 18_000,
              supportYears: 18,
              costGrowthRate: 0,
              collegeAnnualCost: 0,
            },
          }),
        ],
      }),
    );
    expect(costsIn(result, 2026)).toBeCloseTo(22_500, 6);
    expect(costsIn(result, 2027)).toBeCloseTo(18_000, 6);
  });

  it('grows the annual cost at its own rate, not the plan inflation rate', () => {
    const result = runPlan(
      plan({
        // Plan inflation is deliberately different, to prove which one wins.
        settings: { projectionYears: 3, inflationRate: 10 } as never,
        events: [
          event({
            id: 'kid',
            kind: 'haveAKid',
            startYear: 2026,
            config: {
              upfrontCost: 0,
              annualCost: 10_000,
              supportYears: 18,
              costGrowthRate: 3,
              collegeAnnualCost: 0,
            },
          }),
        ],
      }),
    );
    expect(costsIn(result, 2027)).toBeCloseTo(10_300, 6);
    expect(costsIn(result, 2028)).toBeCloseTo(10_609, 6);
  });

  it('ends support after exactly supportYears', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 6 } as never,
        events: [
          event({
            id: 'kid',
            kind: 'haveAKid',
            startYear: 2026,
            config: {
              upfrontCost: 0,
              annualCost: 12_000,
              supportYears: 3,
              costGrowthRate: 0,
              collegeAnnualCost: 0,
            },
          }),
        ],
      }),
    );
    expect(costsIn(result, 2028)).toBeCloseTo(12_000, 6);
    expect(costsIn(result, 2029)).toBe(0);
  });
});

describe('careerBreak', () => {
  it('adjusts spending and charges a one-off cost during the break', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 4, baselineExpenses: 100_000 } as never,
        events: [
          event({
            id: 'brk',
            kind: 'careerBreak',
            startYear: 2027,
            config: { durationYears: 1, spendingChangePercent: 20, oneTimeCost: 15_000 },
          }),
        ],
      }),
    );
    const spend = (year: number) =>
      result.years.find((y) => y.year === year)!.expenses.reduce((s, l) => s + l.amount, 0);

    expect(spend(2026)).toBeCloseTo(100_000, 6);
    expect(spend(2027)).toBeCloseTo(120_000 + 15_000, 6);
    expect(spend(2028)).toBeCloseTo(100_000, 6);
  });
});
