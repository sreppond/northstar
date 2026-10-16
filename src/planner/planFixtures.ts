/**
 * Plans for the v5 data-module tests (`health`, `spendingGroups`,
 * `incomeTax`). Test-only: nothing in the app imports this.
 *
 * `kitchenSinkPlan` exercises every line the three modules classify: a job
 * (salary, bonus, RSU), a windfall with its own tax, Social Security's taxed
 * and untaxed halves, an RMD, a SEPP, a home bought and later sold, a child,
 * an adult's allowance, a saving line, a lump-sum budget line, and a gap the
 * withdrawal waterfall has to fund (so withdrawal tax appears).
 */
import type { Account, BudgetLine, Plan, PlanEvent } from '@northstar/engine';

export function account(over: Partial<Account> & Pick<Account, 'id' | 'accountClass'>): Account {
  return {
    name: over.id,
    isLiability: false,
    initialBalance: 0,
    isIncluded: true,
    growthRateMethod: 'fixed',
    growthRate: 5,
    withdrawalTiming: 'always',
    withdrawalTaxRate: 0,
    taxableWithdrawalPercent: 0,
    penaltyRate: 0,
    ...over,
  };
}

export const event = (e: Pick<PlanEvent, 'id' | 'kind' | 'startYear'> & Partial<PlanEvent>): PlanEvent => ({
  name: e.id,
  isIncluded: true,
  config: {},
  ...e,
});

export function basePlan(over: Partial<Plan> = {}): Plan {
  return {
    id: 'fx',
    name: 'Fixture',
    settings: {
      startYear: 2026,
      asOfDate: '2026-01-01',
      projectionYears: 30,
      inflationRate: 2.5,
      dollarMode: 'futureDollars',
      baselineIncome: 0,
      baselineExpenses: 0,
      incomeTaxRate: 25,
    },
    participants: [{ id: 'p1', name: 'Alex', birthYear: 1980, lifeExpectancy: 95, isIncluded: true, role: 'adult' }],
    accounts: [],
    events: [],
    rules: [],
    ...over,
  };
}

/** A plan that spends more than it has: cash runs out, while a locked 401(k) and home equity keep net worth high. */
export function runsDryPlan(): Plan {
  return basePlan({
    settings: { ...basePlan().settings, baselineIncome: 40_000, baselineExpenses: 90_000, projectionYears: 25 },
    accounts: [
      account({ id: 'cash', accountClass: 'cash', initialBalance: 150_000, growthRate: 1 }),
      // Home equity: what keeps net worth positive after the cash is gone.
      account({ id: 'home', accountClass: 'realEstate', initialBalance: 500_000, growthRate: 3, withdrawalTiming: 'never' }),
      account({
        id: 'k401',
        accountClass: 'taxDeferredInvestment',
        initialBalance: 400_000,
        withdrawalTiming: 'never',
        withdrawalTaxRate: 24,
        taxableWithdrawalPercent: 100,
        penaltyRate: 10,
        penaltyFreeAge: 59.5,
      }),
    ],
    events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2050, isRequired: true })],
    rules: [{ accountId: 'cash', ruleType: 'withdrawal', order: 1 }],
  });
}

/** A plan that earns more than it spends and never goes short. */
export function healthyPlan(): Plan {
  return basePlan({
    settings: { ...basePlan().settings, baselineIncome: 150_000, baselineExpenses: 60_000, projectionYears: 25 },
    accounts: [
      account({ id: 'cash', accountClass: 'cash', initialBalance: 50_000 }),
      account({ id: 'brokerage', accountClass: 'taxableInvestment', initialBalance: 100_000, withdrawalTaxRate: 15, taxableWithdrawalPercent: 60 }),
      account({
        id: 'k401',
        accountClass: 'taxDeferredInvestment',
        initialBalance: 200_000,
        withdrawalTiming: 'never',
        withdrawalTaxRate: 24,
        taxableWithdrawalPercent: 100,
        penaltyRate: 10,
        penaltyFreeAge: 59.5,
      }),
    ],
    events: [event({ id: 'end', kind: 'endOfPlan', startYear: 2050, isRequired: true })],
    rules: [
      { accountId: 'brokerage', ruleType: 'allocation', order: 1 },
      { accountId: 'cash', ruleType: 'withdrawal', order: 1 },
      { accountId: 'brokerage', ruleType: 'withdrawal', order: 2 },
    ],
  });
}

const line = (l: Pick<BudgetLine, 'id' | 'name' | 'owner' | 'category' | 'amount'> & Partial<BudgetLine>): BudgetLine => ({
  essential: false,
  kind: 'expense',
  cadence: 'monthly',
  isIncluded: true,
  ...l,
});

export function kitchenSinkPlan(): Plan {
  return basePlan({
    settings: { ...basePlan().settings, projectionYears: 35 },
    participants: [
      // Born so the RMD (73) arrives in 2033 and Social Security starts then.
      { id: 'p1', name: 'Alex', birthYear: 1960, lifeExpectancy: 95, isIncluded: true, role: 'adult' },
      // Young enough that her annuity's SEPP is the way in, not age.
      { id: 'p2', name: 'Sam', birthYear: 1975, lifeExpectancy: 95, isIncluded: true, role: 'adult' },
      { id: 'c1', name: 'Robin', birthYear: 2024, lifeExpectancy: 95, isIncluded: true, role: 'child' },
    ],
    accounts: [
      account({ id: 'cash', accountClass: 'cash', initialBalance: 60_000, growthRate: 2 }),
      account({ id: 'brokerage', accountClass: 'taxableInvestment', initialBalance: 250_000, withdrawalTaxRate: 15, taxableWithdrawalPercent: 60 }),
      account({
        id: 'ira',
        accountClass: 'taxDeferredInvestment',
        name: 'IRA',
        initialBalance: 700_000,
        ownerParticipantId: 'p1',
        withdrawalTiming: 'always',
        withdrawalTaxRate: 24,
        taxableWithdrawalPercent: 100,
        penaltyRate: 10,
        penaltyFreeAge: 59.5,
      }),
      account({
        id: 'annuity',
        accountClass: 'variableAnnuity',
        name: 'Annuity',
        initialBalance: 300_000,
        ownerParticipantId: 'p2',
        withdrawalTiming: 'always',
        withdrawalTaxRate: 24,
        taxableWithdrawalPercent: 100,
        penaltyRate: 10,
        penaltyFreeAge: 59.5,
        seppElection: { startYear: 2028, method: 'amortization', ratePercent: 5 },
      }),
    ],
    events: [
      event({ id: 'job', kind: 'job', name: 'Acme', startYear: 2026, config: { salary: 180_000, bonusPercent: 10, signingBonus: 20_000, participantId: 'p2', rsuVesting: [{ year: 2027, amount: 40_000 }] } }),
      event({ id: 'wind', kind: 'windfall', name: 'Inheritance', startYear: 2029, config: { amount: 80_000, taxRate: 20 } }),
      event({ id: 'house', kind: 'buyAHome', name: 'House', startYear: 2028, config: { price: 600_000, downPaymentPercent: 20, sellYear: 2045 } }),
      event({ id: 'retire', kind: 'retirement', name: 'Retire', startYear: 2032, config: { participantId: 'p1', spendingChangePercent: -10 } }),
      event({ id: 'ssa', kind: 'socialSecurity', name: 'Social Security', startYear: 2033, config: { annualBenefit: 40_000, participantId: 'p1' } }),
      event({ id: 'end', kind: 'endOfPlan', startYear: 2060, isRequired: true }),
    ],
    rules: [
      { accountId: 'brokerage', ruleType: 'allocation', order: 1 },
      { accountId: 'cash', ruleType: 'withdrawal', order: 1 },
      { accountId: 'brokerage', ruleType: 'withdrawal', order: 2 },
      { accountId: 'ira', ruleType: 'withdrawal', order: 3 },
    ],
    budget: [
      line({ id: 'rent', name: 'Rent', owner: 'shared', category: 'housing', essential: true, amount: 3_500, until: { kind: 'event', eventId: 'house' } }),
      line({ id: 'food', name: 'Groceries', owner: 'shared', category: 'food', essential: true, amount: 1_800 }),
      line({ id: 'fun', name: 'Alex allowance', owner: 'p1', kind: 'allowance', category: 'personal', amount: 1_500 }),
      line({ id: 'fun2', name: 'Sam allowance', owner: 'p2', kind: 'allowance', category: 'personal', amount: 1_000 }),
      line({ id: 'daycare', name: 'Robin daycare', owner: 'c1', category: 'childcare', essential: true, amount: 2_000, until: { kind: 'age', participantId: 'c1', age: 5 } }),
      line({ id: 'arrival', name: 'Robin bar mitzvah', owner: 'c1', category: 'other', cadence: 'once', amount: 15_000, from: { kind: 'age', participantId: 'c1', age: 13 } }),
      line({ id: 'trip', name: 'Big trip', owner: 'shared', category: 'travel', cadence: 'once', amount: 12_000, from: { kind: 'year', year: 2030 } }),
      line({ id: 'edu', name: 'Robin 529', owner: 'c1', kind: 'saving', category: 'education', amount: 500, accountId: 'brokerage' }),
    ],
  });
}
