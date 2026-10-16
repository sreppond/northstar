import { describe, expect, it } from 'vitest';
import type { Plan, PlanEvent } from '@northstar/engine';
import { planEndYear, runPlan } from '@northstar/engine';
import { growthCheck, horizonCheck, rentAfterPurchaseCheck, unearnedWagesCheck, unownedIncomeCheck } from './checks';

function ev(over: Partial<PlanEvent> & Pick<PlanEvent, 'id' | 'kind' | 'startYear'>): PlanEvent {
  return { name: over.kind, isIncluded: true, config: {}, ...over };
}

function plan(events: PlanEvent[], birthYear = 1996): Plan {
  return {
    id: 't',
    name: 'T',
    settings: {
      startYear: 2026,
      projectionYears: 21,
      inflationRate: 0,
      dollarMode: 'futureDollars',
      baselineIncome: 0,
      baselineExpenses: 0,
      incomeTaxRate: 0,
    },
    participants: [{ id: 'p1', name: 'A', birthYear, lifeExpectancy: 90, isIncluded: true }],
    accounts: [],
    events,
    rules: [],
  };
}

describe('horizonCheck', () => {
  it('is quiet when everything fits', () => {
    expect(horizonCheck(plan([ev({ id: 'end', kind: 'endOfPlan', startYear: 2046 })]))).toBeNull();
  });

  it('flags a retirement after the plan ends and fixes it with the lifetime horizon', () => {
    const p = plan([
      ev({ id: 'end', kind: 'endOfPlan', startYear: 2046 }),
      ev({ id: 'r', kind: 'retirement', name: 'Retire', startYear: 2058 }),
    ]);
    const check = horizonCheck(p);
    expect(check?.message).toContain('Retire (2058)');
    expect(check?.message).toContain('2046');
    const action = check?.action;
    if (action?.kind !== 'fix') throw new Error('expected a fix');
    expect(planEndYear(action.fixed)).toBe(1996 + 95);
    expect(action.label).toBe('Run through 2091');
    expect(runPlan(action.fixed).years.some((y) => y.year === 2058)).toBe(true);
  });

  it('falls back to the latest event plus thirty years when a lifetime is not enough', () => {
    const p = plan([ev({ id: 'x', kind: 'otherExpense', startYear: 2070 })], 1950);
    const action = horizonCheck(p)?.action;
    if (action?.kind !== 'fix') throw new Error('expected a fix');
    expect(planEndYear(action.fixed)).toBe(2100);
  });
});

describe('rentAfterPurchaseCheck', () => {
  const home = ev({ id: 'home', kind: 'buyAHome', name: 'Buy a home', startYear: 2034 });

  it('anchors an open-ended housing line to the purchase', () => {
    const p: Plan = {
      ...plan([home]),
      budget: [
        {
          id: 'rent',
          name: 'Rent',
          owner: 'shared',
          category: 'housing',
          essential: true,
          kind: 'expense',
          cadence: 'monthly',
          amount: 4_200,
          isIncluded: true,
        },
      ],
    };
    const action = rentAfterPurchaseCheck(p)?.action;
    if (action?.kind !== 'fix') throw new Error('expected a fix');
    expect(action.fixed.budget?.[0].until).toEqual({ kind: 'event', eventId: 'home' });
    expect(rentAfterPurchaseCheck(action.fixed)).toBeNull();
  });

  it('only warns, with no fix, when rent can only be inside living expenses', () => {
    const p = plan([home]);
    p.settings.baselineExpenses = 80_000;
    const check = rentAfterPurchaseCheck(p);
    expect(check?.message).toContain('living expenses');
    expect(check?.action).toBeUndefined();
  });
});

describe('unearnedWagesCheck', () => {
  it('offers to mark wage-like income as earned once something can stop it', () => {
    const amazon = ev({ id: 'a', kind: 'income', name: 'Amazon', startYear: 2026, config: { amount: 1, isEarned: false } });
    expect(unearnedWagesCheck(plan([amazon]))).toBeNull();

    const p = plan([amazon, ev({ id: 'r', kind: 'retirement', startYear: 2050 })]);
    const action = unearnedWagesCheck(p)?.action;
    if (action?.kind !== 'fix') throw new Error('expected a fix');
    expect((action.fixed.events[0].config as { isEarned: boolean }).isEarned).toBe(true);
  });
});

describe('unownedIncomeCheck / growthCheck', () => {
  it('asks whose income it is only when there are two adults', () => {
    const job = ev({ id: 'j', kind: 'job', name: 'Amazon', startYear: 2026, config: { salary: 1 } });
    expect(unownedIncomeCheck(plan([job]))).toBeNull();
    const two = plan([job]);
    two.participants.push({ id: 'p2', name: 'B', birthYear: 1996, lifeExpectancy: 90, isIncluded: true });
    expect(unownedIncomeCheck(two)?.action).toEqual({ kind: 'editEvent', label: 'Set the person', eventId: 'j' });
  });

  it('flags a fixed return of 12% or more', () => {
    const p = plan([]);
    p.accounts = [
      {
        id: 'va',
        name: 'Variable annuity',
        accountClass: 'variableAnnuity',
        isLiability: false,
        initialBalance: 150_000,
        isIncluded: true,
        growthRateMethod: 'fixed',
        growthRate: 20,
        withdrawalTiming: 'never',
        withdrawalTaxRate: 0,
        taxableWithdrawalPercent: 0,
        penaltyRate: 0,
      },
    ];
    expect(growthCheck(p)?.message).toContain('20%');
  });
});
