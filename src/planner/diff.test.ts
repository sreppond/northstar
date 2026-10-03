import { describe, expect, it } from 'vitest';
import type { Plan } from '@northstar/engine';
import { newAccountOfType, runPlan } from '@northstar/engine';
import { diffOutcomes, diffPlans } from './diff';

function plan(over: Partial<Plan> = {}): Plan {
  return {
    id: 'test',
    name: 'Test plan',
    settings: {
      startYear: 2026,
      projectionYears: 5,
      inflationRate: 0,
      dollarMode: 'futureDollars',
      baselineIncome: 0,
      baselineExpenses: 0,
      incomeTaxRate: 0,
      ...over.settings,
    },
    participants: over.participants ?? [
      { id: 'p1', name: 'A', birthYear: 1990, lifeExpectancy: 90, isIncluded: true },
    ],
    accounts: over.accounts ?? [],
    events: over.events ?? [],
    rules: over.rules ?? [],
  };
}

describe('diffPlans — settings', () => {
  it('reports nothing for two identical plans', () => {
    const a = plan({ settings: { baselineExpenses: 60_000 } as never });
    expect(diffPlans(a, a)).toEqual([]);
  });

  it('reports a changed settings field with old and new values', () => {
    const a = plan({ settings: { baselineExpenses: 60_000 } as never });
    const b = plan({ settings: { baselineExpenses: 78_000 } as never });
    const changes = diffPlans(a, b);
    expect(changes).toContainEqual({
      kind: 'settings',
      verb: 'changed',
      sentence: 'Baseline expenses $60K → $78K',
    });
  });

  it('reports a dollar-mode change with plain-English labels', () => {
    const a = plan({ settings: { dollarMode: 'futureDollars' } as never });
    const b = plan({ settings: { dollarMode: 'todaysDollars' } as never });
    const changes = diffPlans(a, b);
    expect(changes).toContainEqual({
      kind: 'settings',
      verb: 'changed',
      sentence: "Display dollars future dollars → today's dollars",
    });
  });
});

describe('diffPlans — accounts', () => {
  it('reports an added account', () => {
    const a = plan();
    const b = plan({ accounts: [{ ...newAccountOfType('taxableInvestment'), id: 'b', name: 'Brokerage' }] });
    expect(diffPlans(a, b)).toContainEqual({
      kind: 'account',
      verb: 'added',
      sentence: 'Adds Brokerage',
    });
  });

  it('reports a removed account', () => {
    const a = plan({ accounts: [{ ...newAccountOfType('taxableInvestment'), id: 'b', name: 'Brokerage' }] });
    const b = plan();
    expect(diffPlans(a, b)).toContainEqual({
      kind: 'account',
      verb: 'removed',
      sentence: 'Removes Brokerage',
    });
  });

  it('reports a changed field on a matched account', () => {
    const account = { ...newAccountOfType('taxableInvestment'), id: 'b', name: 'Brokerage', growthRate: 6.5 };
    const a = plan({ accounts: [account] });
    const b = plan({ accounts: [{ ...account, growthRate: 5 }] });
    expect(diffPlans(a, b)).toContainEqual({
      kind: 'account',
      verb: 'changed',
      sentence: 'Brokerage — Expected return 6.5% → 5%',
    });
  });

  it('does not diff an account against a differently-typed one field by field', () => {
    const a = plan({ accounts: [{ ...newAccountOfType('taxableInvestment'), id: 'x', name: 'X' }] });
    const b = plan({ accounts: [{ ...newAccountOfType('cash'), id: 'x', name: 'X' }] });
    const changes = diffPlans(a, b);
    expect(changes).toHaveLength(1);
    expect(changes[0].sentence).toMatch(/Taxable investments → Cash/);
  });

  it('matches accounts by id, not by array position', () => {
    const a = plan({
      accounts: [
        { ...newAccountOfType('cash'), id: 'c', name: 'Cash' },
        { ...newAccountOfType('taxableInvestment'), id: 'b', name: 'Brokerage' },
      ],
    });
    // Same two accounts, reordered and otherwise untouched.
    const b = plan({ accounts: [...a.accounts].reverse() });
    expect(diffPlans(a, b)).toEqual([]);
  });
});

describe('diffPlans — events', () => {
  it('reports an added event with its year', () => {
    const a = plan();
    const b = plan({
      events: [{ id: 'e1', kind: 'windfall', name: 'Windfall', startYear: 2030, isIncluded: true, config: {} }],
    });
    expect(diffPlans(a, b)).toContainEqual({
      kind: 'event',
      verb: 'added',
      sentence: 'Adds Windfall (2030)',
    });
  });

  it('reports a moved event', () => {
    const event = { id: 'e1', kind: 'retirement' as const, name: 'Retirement', startYear: 2044, isIncluded: true, config: {} };
    const a = plan({ events: [event] });
    const b = plan({ events: [{ ...event, startYear: 2041 }] });
    expect(diffPlans(a, b)).toContainEqual({
      kind: 'event',
      verb: 'changed',
      sentence: 'Retirement moves 2044 → 2041',
    });
  });

  it('reports a changed config field on a matched event', () => {
    const event = {
      id: 'e1',
      kind: 'windfall' as const,
      name: 'Windfall',
      startYear: 2030,
      isIncluded: true,
      config: { amount: 50_000 },
    };
    const a = plan({ events: [event] });
    const b = plan({ events: [{ ...event, config: { amount: 80_000 } }] });
    const changes = diffPlans(a, b);
    expect(changes.some((c) => c.kind === 'event' && /Amount/.test(c.sentence))).toBe(true);
  });
});

describe('diffPlans — rules', () => {
  it('reports a change to the priority rules as one line', () => {
    const a = plan({ rules: [{ accountId: 'b', ruleType: 'allocation', order: 1 }] });
    const b = plan({ rules: [{ accountId: 'b', ruleType: 'allocation', order: 2 }] });
    expect(diffPlans(a, b)).toContainEqual({
      kind: 'rule',
      verb: 'changed',
      sentence: 'Priority rules changed',
    });
  });
});

describe('diffOutcomes', () => {
  it('reports nothing for two identical plans', () => {
    const a = plan({ settings: { baselineIncome: 100_000, baselineExpenses: 40_000 } as never });
    const resultA = runPlan(a);
    expect(diffOutcomes(resultA, resultA)).toEqual([]);
  });

  it('reports the terminal net worth delta at the active plan horizon', () => {
    const a = plan({
      settings: { projectionYears: 3, baselineIncome: 100_000, baselineExpenses: 40_000 } as never,
      accounts: [{ ...newAccountOfType('cash'), id: 'c', name: 'Cash' }],
    });
    const b = plan({
      settings: { projectionYears: 3, baselineIncome: 100_000, baselineExpenses: 20_000 } as never,
      accounts: [{ ...newAccountOfType('cash'), id: 'c', name: 'Cash' }],
    });
    const changes = diffOutcomes(runPlan(a), runPlan(b));
    const netWorthChange = changes.find((c) => c.label === 'Net worth');
    // docs/ROADMAP-10.md C2 (one number language): no trailing ".0".
    expect(netWorthChange?.sentence).toContain('+$60K');
  });

  it('reports a first-shortfall-year change, including "never"', () => {
    const failing = plan({
      settings: { projectionYears: 3, baselineIncome: 0, baselineExpenses: 50_000 } as never,
      accounts: [{ ...newAccountOfType('cash'), id: 'c', name: 'Cash', initialBalance: 10_000 }],
      rules: [{ accountId: 'c', ruleType: 'withdrawal', order: 1 }],
    });
    const solvent = plan({
      settings: { projectionYears: 3, baselineIncome: 100_000, baselineExpenses: 50_000 } as never,
      accounts: [{ ...newAccountOfType('cash'), id: 'c', name: 'Cash', initialBalance: 10_000 }],
      rules: [{ accountId: 'c', ruleType: 'withdrawal', order: 1 }],
    });
    const changes = diffOutcomes(runPlan(failing), runPlan(solvent));
    const shortfallChange = changes.find((c) => c.label === 'First shortfall');
    expect(shortfallChange?.sentence).toBe('2026 → never');
  });
});
