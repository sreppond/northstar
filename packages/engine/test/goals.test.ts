/**
 * Goals — the pure surface over the allocation waterfall (docs/REDESIGN.md
 * §2.2): the annual contribution a target-and-date implies, the allocation
 * rules a goal generates, and the funding progress read back out of a result.
 */
import { describe, expect, it } from 'vitest';
import {
  SWEEP_BUCKET_LABEL,
  goalFundingProgress,
  goalsToAllocationRules,
  requiredAnnualContribution,
  sweepAllocationLabel,
} from '../src/goals.js';
import { runPlan } from '../src/run.js';
import type { Goal } from '../src/types.js';
import { asset, plan } from './fixtures.js';

const goal = (over: Partial<Goal> & Pick<Goal, 'id' | 'name' | 'kind'>): Goal => ({
  fundedFromAccountIds: [],
  ...over,
});

describe('requiredAnnualContribution', () => {
  it('spreads the remaining gap evenly across the years left', () => {
    const g = goal({ id: 'h', name: 'House', kind: 'house', targetAmount: 300_000, byYear: 2031 });
    // 300k target, 60k already earmarked, 2031 - 2026 = 5 years → 48k/yr.
    expect(requiredAnnualContribution(g, { currentYear: 2026, earmarkedBalance: 60_000 })).toBeCloseTo(
      48_000,
      6,
    );
  });

  it('is zero for a goal with no target or no date', () => {
    expect(
      requiredAnnualContribution(goal({ id: 'a', name: 'A', kind: 'custom', byYear: 2031 }), {
        currentYear: 2026,
      }),
    ).toBe(0);
    expect(
      requiredAnnualContribution(goal({ id: 'b', name: 'B', kind: 'custom', targetAmount: 100 }), {
        currentYear: 2026,
      }),
    ).toBe(0);
  });

  it('is zero once the earmarked balance already meets the target', () => {
    const g = goal({ id: 'h', name: 'House', kind: 'house', targetAmount: 100_000, byYear: 2031 });
    expect(requiredAnnualContribution(g, { currentYear: 2026, earmarkedBalance: 120_000 })).toBe(0);
  });

  it('asks for the whole remaining gap when the date is here or past', () => {
    const g = goal({ id: 'h', name: 'House', kind: 'house', targetAmount: 100_000, byYear: 2026 });
    expect(requiredAnnualContribution(g, { currentYear: 2026, earmarkedBalance: 40_000 })).toBeCloseTo(
      60_000,
      6,
    );
  });
});

describe('goalsToAllocationRules', () => {
  it('maps each fundable goal to one allocation rule, in goal order', () => {
    const p = plan({
      accounts: [
        asset({ id: 'brokerage', name: 'Brokerage', initialBalance: 20_000 }),
        asset({ id: 'retire', name: '401k', initialBalance: 100_000 }),
      ],
      goals: [
        goal({
          id: 'house',
          name: 'House',
          kind: 'house',
          targetAmount: 120_000,
          byYear: 2031,
          fundedFromAccountIds: ['brokerage'],
        }),
        goal({
          id: 'ret',
          name: 'Retirement',
          kind: 'retirement',
          targetAmount: 600_000,
          byYear: 2031,
          fundedFromAccountIds: ['retire'],
        }),
      ],
    });

    const rules = goalsToAllocationRules(p);
    expect(rules).toHaveLength(2);
    // House first: (120k - 20k) / 5 yrs = 20k/yr, order 1, its primary account.
    expect(rules[0]).toMatchObject({
      accountId: 'brokerage',
      ruleType: 'allocation',
      order: 1,
      config: { maxAnnual: 20_000 },
    });
    // Retirement second: (600k - 100k) / 5 = 100k/yr, order 2.
    expect(rules[1]).toMatchObject({
      accountId: 'retire',
      ruleType: 'allocation',
      order: 2,
      config: { maxAnnual: 100_000 },
    });
  });

  it('skips a goal with no funded account and one with nothing to require', () => {
    const p = plan({
      accounts: [asset({ id: 'brokerage', name: 'Brokerage', initialBalance: 0 })],
      goals: [
        goal({ id: 'no-account', name: 'Floating', kind: 'custom', targetAmount: 50_000, byYear: 2031 }),
        goal({
          id: 'open-ended',
          name: 'Someday',
          kind: 'custom',
          fundedFromAccountIds: ['brokerage'],
        }),
      ],
    });
    expect(goalsToAllocationRules(p)).toEqual([]);
  });
});

describe('goalFundingProgress', () => {
  it('reads each goal’s earmarked balance out of the result, per year', () => {
    // 100k cash, +50k/yr swept surplus, no growth: 150k, 200k, 250k.
    const p = plan({
      settings: { projectionYears: 3, baselineIncome: 50_000, baselineExpenses: 0 } as never,
      accounts: [
        asset({
          id: 'c',
          name: 'Cash',
          accountClass: 'cash',
          initialBalance: 100_000,
          growthRateMethod: 'noChange',
        }),
      ],
      goals: [
        goal({
          id: 'house',
          name: 'House',
          kind: 'house',
          targetAmount: 200_000,
          byYear: 2028,
          fundedFromAccountIds: ['c'],
        }),
      ],
    });

    const [progress] = goalFundingProgress(p, runPlan(p));

    expect(progress.years.find((y) => y.year === 2026)!.balance).toBeCloseTo(150_000, 4);
    expect(progress.years.find((y) => y.year === 2026)!.fraction).toBeCloseTo(0.75, 4);
    // By 2028 the earmarked balance (250k) clears the 200k target.
    expect(progress.byYearBalance).toBeCloseTo(250_000, 4);
    expect(progress.byYearFraction).toBe(1);
    expect(progress.funded).toBe(true);
  });

  it('reports no fraction for an open-ended goal, and never claims it is funded', () => {
    const p = plan({
      settings: { projectionYears: 2 } as never,
      accounts: [asset({ id: 'c', name: 'Cash', accountClass: 'cash', initialBalance: 10_000 })],
      goals: [
        goal({ id: 'g', name: 'Someday', kind: 'custom', fundedFromAccountIds: ['c'] }),
      ],
    });

    const [progress] = goalFundingProgress(p, runPlan(p));
    expect(progress.years[0].fraction).toBeUndefined();
    expect(progress.funded).toBe(false);
  });
});

describe('the Savings sweep bucket', () => {
  it('names the residual bucket "Savings"', () => {
    expect(SWEEP_BUCKET_LABEL).toBe('Savings');
    expect(sweepAllocationLabel()).toBe('To Savings');
  });

  it('labels the unallocated sweep line "To Savings" in a result', () => {
    const result = runPlan(
      plan({
        settings: { projectionYears: 1, baselineIncome: 80_000, baselineExpenses: 20_000 } as never,
        accounts: [
          asset({ id: 'c', name: 'Cash', accountClass: 'cash', growthRateMethod: 'noChange' }),
        ],
      }),
    );
    const labels = result.years[0].allocations.map((l) => l.label);
    expect(labels).toContain('To Savings');
  });
});
