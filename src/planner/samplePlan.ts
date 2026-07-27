import type { Account, Plan, PlanEvent } from '@northstar/engine';

const START = 2026;

function cash(): Account {
  return {
    id: 'cash',
    name: 'Cash',
    accountClass: 'cash',
    isLiability: false,
    initialBalance: 12_000,
    isIncluded: true,
    growthRateMethod: 'noChange',
    growthRate: 0,
    withdrawalTiming: 'always',
    withdrawalTaxRate: 0,
    taxableWithdrawalPercent: 0,
    penaltyRate: 0,
  };
}

function brokerage(): Account {
  return {
    id: 'brokerage',
    name: 'Taxable investments',
    accountClass: 'taxableInvestment',
    isLiability: false,
    initialBalance: 92_000,
    isIncluded: true,
    growthRateMethod: 'fixed',
    growthRate: 6.5,
    withdrawalTiming: 'always',
    withdrawalTaxRate: 15,
    taxableWithdrawalPercent: 60,
    penaltyRate: 0,
  };
}

const houseEvents: PlanEvent[] = [
  {
    // Modelled as an event with an end year rather than as `baselineIncome`,
    // so it STOPS when the new role starts. Left as a standing baseline it
    // would stack with the new salary and quietly double the plan's income.
    id: 'current',
    kind: 'income',
    name: 'Current salary',
    startYear: 2026,
    isIncluded: true,
    config: { amount: 148_000, endYear: 2027, growthRate: 3, isEarned: true, isTaxable: true },
  },
  {
    id: 'rsu1',
    kind: 'windfall',
    name: 'RSU distribution',
    startYear: 2026,
    isIncluded: true,
    config: { amount: 35_000, taxRate: 32 },
  },
  {
    id: 'rsu2',
    kind: 'windfall',
    name: 'RSU distribution',
    startYear: 2027,
    isIncluded: true,
    config: { amount: 80_000, taxRate: 32 },
  },
  {
    id: 'job',
    kind: 'newJob',
    name: 'New role — base salary',
    startYear: 2028,
    isIncluded: true,
    config: { salary: 250_000, bonusPercent: 0, annualRaise: 3 },
  },
  {
    id: 'kid1',
    kind: 'haveAKid',
    name: 'First child',
    startYear: 2028,
    isIncluded: true,
    config: {
      upfrontCost: 4_500,
      annualCost: 18_000,
      supportYears: 18,
      collegeAnnualCost: 0,
    },
  },
  {
    id: 'promo1',
    kind: 'income',
    name: 'Promotion',
    startYear: 2029,
    isIncluded: true,
    config: { amount: 50_000, isEarned: true, isTaxable: true },
  },
  {
    id: 'kid2',
    kind: 'haveAKid',
    name: 'Second child',
    startYear: 2030,
    isIncluded: true,
    config: {
      upfrontCost: 4_500,
      annualCost: 18_000,
      supportYears: 18,
      collegeAnnualCost: 0,
    },
  },
  {
    id: 'house',
    kind: 'buyAHome',
    name: 'Buy a home',
    startYear: 2031,
    isIncluded: true,
    config: {
      price: 1_150_000,
      downPaymentPercent: 20,
      mortgageRate: 6.25,
      termYears: 30,
      closingCostPercent: 2,
      propertyTaxRate: 1.1,
      insuranceAnnual: 2_400,
      maintenancePercent: 1,
      appreciationRate: 3,
    },
  },
  {
    id: 'promo2',
    kind: 'income',
    name: 'Promotion',
    startYear: 2032,
    isIncluded: true,
    config: { amount: 50_000, isEarned: true, isTaxable: true },
  },
  {
    id: 'end',
    kind: 'endOfPlan',
    name: 'End of plan',
    startYear: 2046,
    isIncluded: true,
    isRequired: true,
    config: {},
  },
];

function retirement401k(): Account {
  return {
    id: 'retirement',
    name: 'Tax-deferred investments',
    accountClass: 'taxDeferredInvestment',
    isLiability: false,
    initialBalance: 64_000,
    isIncluded: true,
    growthRateMethod: 'fixed',
    growthRate: 6.5,
    yearlyPaycheckContribution: 12_000,
    // Ordinary income on the way out, plus a penalty before 59.5 — the case
    // the flat capital-gains treatment on a brokerage does not cover.
    withdrawalTiming: 'never',
    withdrawalTaxRate: 24,
    taxableWithdrawalPercent: 100,
    penaltyRate: 10,
    penaltyFreeAge: 59.5,
  };
}

function base(id: string, name: string, events: PlanEvent[]): Plan {
  return {
    id,
    name,
    settings: {
      startYear: START,
      projectionYears: 21,
      inflationRate: 2.5,
      dollarMode: 'futureDollars',
      // Earned income is carried entirely by events (see 'Current salary'),
      // so the standing baseline is zero.
      baselineIncome: 0,
      baselineExpenses: 78_000,
      incomeTaxRate: 28,
    },
    participants: [
      { id: 'p1', name: 'You', birthYear: 1996, lifeExpectancy: 90, isIncluded: true },
    ],
    accounts: [cash(), brokerage(), retirement401k()],
    events,
    rules: [
      { accountId: 'brokerage', ruleType: 'allocation', order: 1 },
      { accountId: 'cash', ruleType: 'withdrawal', order: 1 },
      { accountId: 'brokerage', ruleType: 'withdrawal', order: 2 },
    ],
  };
}

/**
 * Two scenarios so the switcher and the eventual A/B comparison have something
 * real to work against. Placeholder data until plans are user-created.
 */
export const SAMPLE_PLANS: Plan[] = [
  base('house', 'House Forecast', houseEvents),
  base(
    'retirement',
    'Retirement Forecast',
    houseEvents
      // A retirement plan has to run to life expectancy, not to the house
      // scenario's horizon, or Social Security falls off the end.
      .filter((e) => e.id !== 'house' && e.id !== 'end')
      .concat([
        {
          id: 'retire',
          kind: 'retirement',
          name: 'Retire',
          startYear: 2042,
          isIncluded: true,
          config: { spendingChangePercent: -20 },
        },
        {
          id: 'ssa',
          kind: 'socialSecurity',
          name: 'Social Security',
          startYear: 2063,
          isIncluded: true,
          config: { annualBenefit: 42_000, colaRate: 2.5 },
        },
        {
          id: 'end-ret',
          kind: 'endOfPlan',
          name: 'End of plan',
          startYear: 2086,
          isIncluded: true,
          isRequired: true,
          config: {},
        },
      ]),
  ),
];
