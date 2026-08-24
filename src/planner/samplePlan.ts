import type { Account, Goal, Plan, PlanEvent } from '@northstar/engine';

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

/**
 * One employer, its whole arc (docs/REDESIGN.md §2.1). This is the six events
 * the old sample scattered — a current salary, two RSU distributions, a new
 * role and two promotions — collapsed into a single `job` named "Amazon":
 *
 *  - the salary starts at today's $148K and raises 3% a year;
 *  - `rsuVesting` carries the two RSU vests ($35K in 2026, $80K in 2027);
 *  - `compSteps` carry the new role and the two promotions, each resetting the
 *    base salary the raise then compounds from. The step values reproduce the
 *    old earned-income curve closely (the 2032 step is chosen so the earned
 *    income across the rest of the plan sums to what the flat "+$50K promotion"
 *    events produced), so the net-worth line stays the same money, told once.
 *
 * No 401(k) fields: the sample funds its tax-deferred account through that
 * account's own standing $12K contribution, exactly as before.
 */
const amazonJob: PlanEvent = {
  id: 'amazon',
  kind: 'job',
  name: 'Amazon',
  startYear: 2026,
  isIncluded: true,
  config: {
    salary: 148_000,
    bonusPercent: 0,
    annualRaise: 3,
    replacesEarnedIncome: true,
    rsuVesting: [
      { year: 2026, amount: 35_000 },
      { year: 2027, amount: 80_000 },
    ],
    compSteps: [
      { year: 2028, newBaseSalary: 250_000, label: 'New role' },
      { year: 2029, newBaseSalary: 307_500, label: 'Promotion' },
      { year: 2032, newBaseSalary: 367_000, label: 'Promotion' },
    ],
  },
};

const houseEvents: PlanEvent[] = [
  amazonJob,
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

/**
 * The house down-payment goal (docs/REDESIGN.md §2.2): 20% of the $1.15M home
 * is $230K, earmarked from the liquid accounts, due the year the home is
 * bought. `linkedEventId` ties it to the `buyAHome` event when the scenario
 * has one.
 */
function houseGoal(linkedEventId?: string): Goal {
  return {
    id: 'goal-house',
    name: 'Home down payment',
    kind: 'house',
    targetAmount: 230_000,
    byYear: 2031,
    fundedFromAccountIds: ['brokerage', 'cash'],
    ...(linkedEventId ? { linkedEventId } : {}),
  };
}

/** The retirement goal: a portfolio target by the year work stops. */
function retirementGoal(linkedEventId?: string): Goal {
  return {
    id: 'goal-retirement',
    name: 'Retirement',
    kind: 'retirement',
    targetAmount: 2_000_000,
    byYear: 2042,
    fundedFromAccountIds: ['retirement', 'brokerage'],
    ...(linkedEventId ? { linkedEventId } : {}),
  };
}

function base(id: string, name: string, events: PlanEvent[], goals: Goal[]): Plan {
  return {
    id,
    name,
    settings: {
      startYear: START,
      projectionYears: 21,
      inflationRate: 2.5,
      dollarMode: 'futureDollars',
      // Earned income is carried entirely by the Amazon job event, so the
      // standing baseline is zero.
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
    goals,
  };
}

/**
 * Two scenarios so the switcher and the eventual A/B comparison have something
 * real to work against. Placeholder data until plans are user-created. Both
 * carry a house goal and a retirement goal so the House and Retirement lenses
 * always have real funding data to read (docs/REDESIGN.md §2.2).
 */
export const SAMPLE_PLANS: Plan[] = [
  base('house', 'House Forecast', houseEvents, [houseGoal('house'), retirementGoal()]),
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
    [houseGoal(), retirementGoal('retire')],
  ),
];
