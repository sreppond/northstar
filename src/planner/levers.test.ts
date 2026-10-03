import { describe, expect, it } from 'vitest';
import type { Account, Plan, PlanEvent, PlanResult, YearSnapshot } from '@northstar/engine';
import { applyLevers, horizonDelta } from './levers';

// --- fixtures ----------------------------------------------------------------
// Same minimal-field shape as dashboard.test.ts's own fixtures — only what
// the function under test actually reads.

function account(over: Partial<Account> = {}): Account {
  return {
    id: 'a1',
    name: 'Account',
    accountClass: 'taxableInvestment',
    isLiability: false,
    initialBalance: 100_000,
    isIncluded: true,
    growthRateMethod: 'fixed',
    growthRate: 6,
    withdrawalTiming: 'always',
    withdrawalTaxRate: 0,
    taxableWithdrawalPercent: 0,
    penaltyRate: 0,
    ...over,
  };
}

function planFixture(over: Partial<Plan> = {}): Plan {
  return {
    id: 'test',
    name: 'Test plan',
    settings: {
      startYear: 2026,
      projectionYears: 10,
      inflationRate: 0,
      dollarMode: 'futureDollars',
      baselineIncome: 0,
      baselineExpenses: 60_000,
      incomeTaxRate: 0,
      ...over.settings,
    },
    participants: over.participants ?? [
      { id: 'p1', name: 'A', birthYear: 1990, lifeExpectancy: 90, isIncluded: true },
    ],
    accounts: over.accounts ?? [account()],
    events: over.events ?? [],
    rules: over.rules ?? [],
    goals: over.goals,
  };
}

const NO_LEVERS = { returnDelta: 0, spendingDelta: 0 };

describe('applyLevers', () => {
  it('returns the same plan reference when every lever is a no-op', () => {
    const plan = planFixture();
    expect(applyLevers(plan, NO_LEVERS)).toBe(plan);
  });

  it('shifts a fixed-rate account’s growth rate by returnDelta', () => {
    const plan = planFixture({ accounts: [account({ growthRateMethod: 'fixed', growthRate: 6 })] });
    const next = applyLevers(plan, { ...NO_LEVERS, returnDelta: 1.5 });
    expect(next.accounts[0].growthRate).toBe(7.5);
  });

  it('shifts every anchor of a schedule-rate account by returnDelta', () => {
    const plan = planFixture({
      accounts: [
        account({
          growthRateMethod: 'schedule',
          growthRateSchedule: [
            { year: 2026, rate: 5 },
            { year: 2030, rate: 7 },
          ],
        }),
      ],
    });
    const next = applyLevers(plan, { ...NO_LEVERS, returnDelta: -1 });
    expect(next.accounts[0].growthRateSchedule).toEqual([
      { year: 2026, rate: 4 },
      { year: 2030, rate: 6 },
    ]);
  });

  it('leaves a noChange (cash) account untouched', () => {
    const plan = planFixture({ accounts: [account({ growthRateMethod: 'noChange', growthRate: 0 })] });
    const next = applyLevers(plan, { ...NO_LEVERS, returnDelta: 2 });
    expect(next.accounts[0].growthRate).toBe(0);
  });

  it('leaves a liability untouched even though it is fixed-rate shaped', () => {
    const plan = planFixture({
      accounts: [account({ isLiability: true, growthRateMethod: 'fixed', growthRate: 6.25 })],
    });
    const next = applyLevers(plan, { ...NO_LEVERS, returnDelta: 2 });
    expect(next.accounts[0].growthRate).toBe(6.25);
  });

  it('adds spendingDelta dollars per year to baselineExpenses', () => {
    const plan = planFixture({ settings: { baselineExpenses: 60_000 } as Plan['settings'] });
    const next = applyLevers(plan, { ...NO_LEVERS, spendingDelta: 12_000 });
    expect(next.settings.baselineExpenses).toBe(72_000);
  });

  it('floors baselineExpenses at 0 rather than going negative', () => {
    const plan = planFixture({ settings: { baselineExpenses: 10_000 } as Plan['settings'] });
    const next = applyLevers(plan, { ...NO_LEVERS, spendingDelta: -40_000 });
    expect(next.settings.baselineExpenses).toBe(0);
  });

  it('moves the retirement event’s startYear when one exists', () => {
    const retire: PlanEvent = {
      id: 'r1',
      kind: 'retirement',
      name: 'Retire',
      startYear: 2042,
      isIncluded: true,
      config: {},
    };
    const plan = planFixture({ events: [retire] });
    const next = applyLevers(plan, { ...NO_LEVERS, retireYear: 2045 });
    expect(next.events[0].startYear).toBe(2045);
  });

  it('is a no-op when retireYear is given but no retirement event exists', () => {
    const plan = planFixture({ events: [] });
    const next = applyLevers(plan, { ...NO_LEVERS, retireYear: 2045 });
    expect(next.events).toEqual([]);
  });

  it('never mutates the input plan', () => {
    const retire: PlanEvent = {
      id: 'r1',
      kind: 'retirement',
      name: 'Retire',
      startYear: 2042,
      isIncluded: true,
      config: {},
    };
    const plan = planFixture({
      accounts: [account({ growthRateMethod: 'fixed', growthRate: 6 })],
      events: [retire],
    });
    const snapshot = structuredClone(plan);
    applyLevers(plan, { returnDelta: 1, spendingDelta: 5_000, retireYear: 2040 });
    expect(plan).toEqual(snapshot);
  });

  it('composes all three levers independently in one call', () => {
    const retire: PlanEvent = {
      id: 'r1',
      kind: 'retirement',
      name: 'Retire',
      startYear: 2042,
      isIncluded: true,
      config: {},
    };
    const plan = planFixture({
      accounts: [account({ growthRateMethod: 'fixed', growthRate: 6 })],
      settings: { baselineExpenses: 60_000 } as Plan['settings'],
      events: [retire],
    });
    const next = applyLevers(plan, { returnDelta: 2, spendingDelta: -6_000, retireYear: 2038 });
    expect(next.accounts[0].growthRate).toBe(8);
    expect(next.settings.baselineExpenses).toBe(54_000);
    expect(next.events[0].startYear).toBe(2038);
  });
});

// --- horizonDelta ------------------------------------------------------------

function snapshot(year: number, netWorth: number): YearSnapshot {
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
    netWorth,
  };
}

function resultFrom(startYear: number, endYear: number, years: YearSnapshot[]): PlanResult {
  return { startYear, endYear, years, warnings: [] };
}

describe('horizonDelta', () => {
  it('is the ghost minus the base net worth at the base’s horizon', () => {
    const base = resultFrom(2026, 2046, [snapshot(2026, 100_000), snapshot(2046, 1_000_000)]);
    const ghost = resultFrom(2026, 2046, [snapshot(2026, 100_000), snapshot(2046, 1_310_000)]);
    expect(horizonDelta(base, ghost)).toEqual({ endYear: 2046, delta: 310_000 });
  });

  it('is negative when the lever-shifted plan ends up worse off', () => {
    const base = resultFrom(2026, 2046, [snapshot(2046, 1_000_000)]);
    const ghost = resultFrom(2026, 2046, [snapshot(2046, 850_000)]);
    expect(horizonDelta(base, ghost).delta).toBe(-150_000);
  });

  it('falls back to the last snapshot either series has if the exact horizon year is missing', () => {
    const base = resultFrom(2026, 2046, [snapshot(2045, 500_000)]);
    const ghost = resultFrom(2026, 2046, [snapshot(2045, 600_000)]);
    expect(horizonDelta(base, ghost)).toEqual({ endYear: 2046, delta: 100_000 });
  });
});
