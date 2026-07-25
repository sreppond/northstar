import type { Account, Plan, PlanEvent, PriorityRule } from '../src/types.js';

export function asset(over: Partial<Account> & Pick<Account, 'id' | 'name'>): Account {
  return {
    accountClass: 'taxableInvestment',
    isLiability: false,
    initialBalance: 0,
    isIncluded: true,
    growthRateMethod: 'fixed',
    growthRate: 0,
    withdrawalTiming: 'always',
    withdrawalTaxRate: 0,
    taxableWithdrawalPercent: 0,
    penaltyRate: 0,
    ...over,
  };
}

export function liability(over: Partial<Account> & Pick<Account, 'id' | 'name'>): Account {
  return {
    accountClass: 'loan',
    isLiability: true,
    initialBalance: 0,
    isIncluded: true,
    growthRateMethod: 'noChange',
    growthRate: 0,
    withdrawalTiming: 'never',
    withdrawalTaxRate: 0,
    taxableWithdrawalPercent: 0,
    penaltyRate: 0,
    ...over,
  };
}

export function event(over: Partial<PlanEvent> & Pick<PlanEvent, 'id' | 'kind'>): PlanEvent {
  return {
    name: over.kind,
    startYear: 2026,
    isIncluded: true,
    config: {},
    ...over,
  };
}

export function rule(
  accountId: string,
  ruleType: PriorityRule['ruleType'],
  order: number,
  config?: PriorityRule['config'],
): PriorityRule {
  return { accountId, ruleType, order, config };
}

/**
 * A deliberately quiet baseline: no inflation, no tax, no growth. Tests switch
 * on exactly the one behaviour they are exercising.
 */
export function plan(over: Partial<Plan> = {}): Plan {
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
