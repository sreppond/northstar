/**
 * The account-type registry.
 *
 * Northstar models balances by ASSET TYPE, not by individual linked account:
 * one "Taxable investments" line, not three brokerages. So the settings that
 * matter are the ones that describe how a *type* behaves — how it grows, how
 * it is taxed on the way out, whether it can be tapped at all.
 *
 * Each type declares its editable fields once. Both the hover card and the
 * settings drawer render from that same list, so the assumptions you are shown
 * are exactly the assumptions you can edit — they cannot drift apart.
 */
import type { Account, AccountClass } from './types.js';

export type FieldUnit = 'currency' | 'percent' | 'year' | 'age' | 'plain';

/** A numeric or boolean setting, addressed by its key on `Account`. */
export interface AccountFieldSpec {
  key: keyof Account;
  label: string;
  unit: FieldUnit;
  kind?: 'number' | 'boolean' | 'growthMethod' | 'withdrawalTiming';
  min?: number;
  max?: number;
  step?: number;
  /** Shown under the input, and as the tooltip in the hover card. */
  help?: string;
  /** Hide the field when it cannot apply given the rest of the account. */
  showWhen?: (account: Account) => boolean;
}

export interface AccountTypeSpec {
  accountClass: AccountClass;
  label: string;
  isLiability: boolean;
  /** One-line description shown at the top of the settings drawer. */
  blurb: string;
  fields: AccountFieldSpec[];
  defaults: Omit<Account, 'id' | 'name'>;
}

// --- shared field builders --------------------------------------------------

const balance = (label = 'Balance'): AccountFieldSpec => ({
  key: 'initialBalance',
  label,
  unit: 'currency',
  min: 0,
  step: 1000,
});

const growthMethod: AccountFieldSpec = {
  key: 'growthRateMethod',
  label: 'Growth',
  unit: 'plain',
  kind: 'growthMethod',
  help: 'Fixed holds one rate. No change keeps the balance flat.',
};

const growthRate = (label = 'Expected return'): AccountFieldSpec => ({
  key: 'growthRate',
  label,
  unit: 'percent',
  step: 0.1,
  showWhen: (a) => a.growthRateMethod === 'fixed',
});

const withdrawalTiming: AccountFieldSpec = {
  key: 'withdrawalTiming',
  label: 'Available to spend',
  unit: 'plain',
  kind: 'withdrawalTiming',
  help: 'Whether the shortfall waterfall may draw on this account.',
};

const withdrawalStartingYear: AccountFieldSpec = {
  key: 'withdrawalStartingYear',
  label: 'Available from year',
  unit: 'year',
  step: 1,
  showWhen: (a) => a.withdrawalTiming === 'starting_year',
};

const interestRate: AccountFieldSpec = {
  key: 'interestRate',
  label: 'Interest rate (APR)',
  unit: 'percent',
  min: 0,
  step: 0.1,
};

const plannedPayment = (label = 'Annual payment'): AccountFieldSpec => ({
  key: 'plannedPayment',
  label,
  unit: 'currency',
  min: 0,
  step: 500,
  help: 'Leave blank to amortize over the term.',
});

// --- defaults ---------------------------------------------------------------

function base(over: Partial<Account>): Omit<Account, 'id' | 'name'> {
  return {
    accountClass: 'otherAsset',
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

// --- the registry -----------------------------------------------------------

export const ACCOUNT_TYPES: Record<AccountClass, AccountTypeSpec> = {
  cash: {
    accountClass: 'cash',
    label: 'Cash',
    isLiability: false,
    blurb: 'Checking and savings. Already taxed, so withdrawals are free and clear.',
    fields: [
      balance(),
      { key: 'growthRate', label: 'Annual yield', unit: 'percent', min: 0, step: 0.1 },
    ],
    defaults: base({ accountClass: 'cash', growthRateMethod: 'fixed', growthRate: 0 }),
  },

  taxableInvestment: {
    accountClass: 'taxableInvestment',
    label: 'Taxable investments',
    isLiability: false,
    blurb: 'A brokerage. Only the embedded gain is taxed when you sell.',
    fields: [
      balance(),
      growthMethod,
      growthRate(),
      {
        key: 'taxableWithdrawalPercent',
        label: 'Embedded gain',
        unit: 'percent',
        min: 0,
        max: 100,
        help: 'Share of a withdrawal that is gain rather than return of basis. Only this part is taxed.',
      },
      {
        key: 'withdrawalTaxRate',
        label: 'Capital gains rate',
        unit: 'percent',
        min: 0,
        max: 100,
      },
      withdrawalTiming,
      withdrawalStartingYear,
    ],
    defaults: base({
      accountClass: 'taxableInvestment',
      growthRate: 6.5,
      withdrawalTaxRate: 15,
      taxableWithdrawalPercent: 60,
    }),
  },

  taxDeferredInvestment: {
    accountClass: 'taxDeferredInvestment',
    label: 'Tax-deferred investments',
    isLiability: false,
    blurb:
      '401(k), traditional IRA, deferred annuity. Every dollar out is ordinary income, and there is a penalty for going early.',
    fields: [
      balance(),
      growthMethod,
      growthRate(),
      {
        key: 'yearlyPaycheckContribution',
        label: 'Annual contribution',
        unit: 'currency',
        min: 0,
        step: 500,
        help: 'Pre-tax, so it reduces taxable income in the year it is made.',
      },
      {
        key: 'withdrawalTaxRate',
        label: 'Ordinary income rate',
        unit: 'percent',
        min: 0,
        max: 100,
        help: 'Withdrawals are taxed as income, not at capital-gains rates.',
      },
      {
        key: 'taxableWithdrawalPercent',
        label: 'Taxable share',
        unit: 'percent',
        min: 0,
        max: 100,
        help: 'Usually 100% for a traditional account funded entirely pre-tax.',
      },
      {
        key: 'penaltyRate',
        label: 'Early withdrawal penalty',
        unit: 'percent',
        min: 0,
        max: 100,
        help: 'Charged on top of ordinary income tax before the penalty-free age.',
      },
      {
        key: 'penaltyFreeAge',
        label: 'Penalty-free age',
        unit: 'age',
        min: 0,
        max: 100,
        step: 0.5,
      },
      withdrawalTiming,
      withdrawalStartingYear,
    ],
    defaults: base({
      accountClass: 'taxDeferredInvestment',
      growthRate: 6.5,
      withdrawalTaxRate: 24,
      taxableWithdrawalPercent: 100,
      penaltyRate: 10,
      penaltyFreeAge: 59.5,
      withdrawalTiming: 'never',
    }),
  },

  taxFreeInvestment: {
    accountClass: 'taxFreeInvestment',
    label: 'Tax-free investments',
    isLiability: false,
    blurb: 'Roth IRA or Roth 401(k). Qualified withdrawals are untaxed.',
    fields: [
      balance(),
      growthMethod,
      growthRate(),
      {
        key: 'yearlyPaycheckContribution',
        label: 'Annual contribution',
        unit: 'currency',
        min: 0,
        step: 500,
        help: 'Made with after-tax dollars, so it does not reduce taxable income.',
      },
      {
        key: 'penaltyRate',
        label: 'Early withdrawal penalty',
        unit: 'percent',
        min: 0,
        max: 100,
        help: 'Applies to earnings withdrawn before the qualifying age.',
      },
      { key: 'penaltyFreeAge', label: 'Penalty-free age', unit: 'age', min: 0, max: 100, step: 0.5 },
      withdrawalTiming,
      withdrawalStartingYear,
    ],
    defaults: base({
      accountClass: 'taxFreeInvestment',
      growthRate: 6.5,
      withdrawalTaxRate: 0,
      taxableWithdrawalPercent: 0,
      penaltyRate: 10,
      penaltyFreeAge: 59.5,
      withdrawalTiming: 'never',
    }),
  },

  realEstate: {
    accountClass: 'realEstate',
    label: 'Real estate',
    isLiability: false,
    blurb: 'Property you already own. Illiquid, so the waterfall leaves it alone by default.',
    fields: [
      balance('Current value'),
      growthMethod,
      growthRate('Appreciation'),
      withdrawalTiming,
      withdrawalStartingYear,
    ],
    defaults: base({
      accountClass: 'realEstate',
      growthRate: 3,
      withdrawalTiming: 'never',
    }),
  },

  otherAsset: {
    accountClass: 'otherAsset',
    label: 'Other assets',
    isLiability: false,
    blurb: 'Anything else of value — a business stake, a vehicle, collectibles.',
    fields: [
      balance(),
      growthMethod,
      growthRate('Annual change'),
      { key: 'withdrawalTaxRate', label: 'Tax on sale', unit: 'percent', min: 0, max: 100 },
      {
        key: 'taxableWithdrawalPercent',
        label: 'Taxable share',
        unit: 'percent',
        min: 0,
        max: 100,
      },
      withdrawalTiming,
      withdrawalStartingYear,
    ],
    defaults: base({ accountClass: 'otherAsset', growthRate: 0, withdrawalTiming: 'never' }),
  },

  mortgage: {
    accountClass: 'mortgage',
    label: 'Mortgage',
    isLiability: true,
    blurb: 'A home loan you already carry. Interest is stepped monthly inside each year.',
    fields: [
      balance('Outstanding balance'),
      interestRate,
      { key: 'termYears', label: 'Term remaining (years)', unit: 'plain', min: 1, step: 1 },
      plannedPayment(),
    ],
    defaults: base({
      accountClass: 'mortgage',
      isLiability: true,
      growthRateMethod: 'noChange',
      interestRate: 6.5,
      termYears: 30,
      withdrawalTiming: 'never',
    }),
  },

  loan: {
    accountClass: 'loan',
    label: 'Loans',
    isLiability: true,
    blurb: 'Student, auto or personal debt.',
    fields: [
      balance('Outstanding balance'),
      interestRate,
      { key: 'termYears', label: 'Term remaining (years)', unit: 'plain', min: 1, step: 1 },
      plannedPayment(),
    ],
    defaults: base({
      accountClass: 'loan',
      isLiability: true,
      growthRateMethod: 'noChange',
      interestRate: 7,
      termYears: 10,
      withdrawalTiming: 'never',
    }),
  },

  creditCard: {
    accountClass: 'creditCard',
    label: 'Credit cards',
    isLiability: true,
    blurb: 'Revolving debt. No term — it runs until the payment clears it.',
    fields: [
      balance('Outstanding balance'),
      interestRate,
      plannedPayment('Annual payment'),
      {
        key: 'minimumPayment',
        label: 'Annual minimum',
        unit: 'currency',
        min: 0,
        step: 100,
        help: 'Used when no annual payment is set.',
      },
    ],
    defaults: base({
      accountClass: 'creditCard',
      isLiability: true,
      growthRateMethod: 'noChange',
      interestRate: 22,
      withdrawalTiming: 'never',
    }),
  },
};

/** Display order for the balance sheet. */
export const ASSET_CLASSES: AccountClass[] = [
  'cash',
  'taxableInvestment',
  'taxDeferredInvestment',
  'taxFreeInvestment',
  'realEstate',
  'otherAsset',
];

export const LIABILITY_CLASSES: AccountClass[] = ['mortgage', 'loan', 'creditCard'];

/** Fields that apply given the account's current state. */
export function visibleFields(spec: AccountTypeSpec, account: Account): AccountFieldSpec[] {
  return spec.fields.filter((f) => !f.showWhen || f.showWhen(account));
}

export function newAccountOfType(accountClass: AccountClass): Account {
  const spec = ACCOUNT_TYPES[accountClass];
  return { id: `acct-${accountClass}`, name: spec.label, ...structuredClone(spec.defaults) };
}
