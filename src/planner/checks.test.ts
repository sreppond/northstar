import { describe, expect, it } from 'vitest';
import type { Plan, PlanEvent } from '@northstar/engine';
import { planEndYear, runPlan } from '@northstar/engine';
import { horizonCheck } from './checks';

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
    expect(planEndYear(check!.fixed)).toBe(1996 + 95);
    expect(check?.fixLabel).toBe('Run through 2091');
    expect(runPlan(check!.fixed).years.some((y) => y.year === 2058)).toBe(true);
  });

  it('falls back to the latest event plus thirty years when a lifetime is not enough', () => {
    const p = plan([ev({ id: 'x', kind: 'otherExpense', startYear: 2070 })], 1950);
    const check = horizonCheck(p);
    expect(planEndYear(check!.fixed)).toBe(2100);
  });
});
