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
  kind?:
    | 'number'
    | 'boolean'
    | 'growthMethod'
    | 'growthSchedule'
    | 'withdrawalTiming'
    | 'surrenderSchedule';
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
  label: 'Change over time',
  unit: 'plain',
  kind: 'growthMethod',
  help: 'Fixed holds one rate. Variable steps between rates you set. No change keeps the balance flat.',
};

const growthRate = (label = 'Expected return'): AccountFieldSpec => ({
  key: 'growthRate',
  label,
  unit: 'percent',
  step: 0.1,
  showWhen: (a) => a.growthRateMethod === 'fixed',
});

/**
 * The anchor list behind a `schedule` account. Rendered as a year/rate editor
 * rather than a single input, so it declares its own kind.
 */
const growthSchedule = (label = 'Expected return'): AccountFieldSpec => ({
  key: 'growthRateSchedule',
  label,
  unit: 'percent',
  kind: 'growthSchedule',
  showWhen: (a) => a.growthRateMethod === 'schedule',
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
      growthSchedule(),
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
      '401(k), traditional IRA. Every dollar out is ordinary income, and there is a penalty for going early. For an insurance-wrapped deferred annuity, use Variable annuity instead — it carries the same tax treatment plus contract fees and a surrender schedule.',
    fields: [
      balance(),
      growthMethod,
      growthRate(),
      growthSchedule(),
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
        key: 'nonTaxableBase',
        label: 'Non-taxable base',
        unit: 'currency',
        min: 0,
        step: 1000,
        help:
          'After-tax principal already in the account, in today’s dollars — rare for a plain 401(k)/IRA, but some carry one from a rollover. Leave at $0 for an account funded entirely pre-tax. Withdrawals draw down growth first, fully taxed; only once the balance is drawn back down to this base does the rest come out tax-free.',
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
      nonTaxableBase: 0,
      penaltyRate: 10,
      penaltyFreeAge: 59.5,
      withdrawalTiming: 'never',
    }),
  },

  variableAnnuity: {
    accountClass: 'variableAnnuity',
    label: 'Variable annuity',
    isLiability: false,
    blurb:
      'An insurance-wrapped deferred annuity contract. Same ordinary-income tax treatment as a 401(k)/IRA, plus the things only an annuity has: carrier fees, a surrender period, and — if it is nonqualified, the common case — after-tax basis that comes out LIFO instead of pro-rata.',
    fields: [
      balance(),
      growthMethod,
      growthRate(),
      growthSchedule(),
      {
        key: 'yearlyPaycheckContribution',
        label: 'Annual purchase payment',
        unit: 'currency',
        min: 0,
        step: 500,
        help: 'An ongoing contribution into the contract. Pre-tax only if this sits inside a qualified plan below.',
      },
      {
        key: 'withdrawalTaxRate',
        label: 'Ordinary income rate',
        unit: 'percent',
        min: 0,
        max: 100,
        help: 'Withdrawals of gain are taxed as income, not at capital-gains rates.',
      },
      {
        key: 'nonTaxableBase',
        label: 'Cost basis',
        unit: 'currency',
        min: 0,
        step: 1000,
        help:
          'After-tax principal already in the contract, in today’s dollars — the whole point of a nonqualified annuity. Leave at $0 if this sits inside an IRA/401(k) and was funded entirely pre-tax. Only once the balance is drawn back down to this base does a withdrawal stop being taxed.',
      },
      {
        key: 'isQualifiedAnnuity',
        label: 'Inside a qualified plan (IRA / 401(k))',
        unit: 'plain',
        kind: 'boolean',
        help:
          'A qualified annuity’s basis (from after-tax contributions) comes out pro-rata with every dollar withdrawn. A nonqualified annuity’s basis comes out only once all growth has been drawn down first (LIFO) — leave this off for a nonqualified contract, the more common case.',
      },
      {
        key: 'annuityFlatFeeAnnual',
        label: 'Flat annual fee',
        unit: 'currency',
        min: 0,
        step: 10,
        help:
          'A fixed dollar rider or contract-administration charge taken from the account every year, independent of its balance.',
      },
      {
        key: 'annuityAssetFeePercent',
        label: 'Mortality & expense fee',
        unit: 'percent',
        min: 0,
        max: 100,
        step: 0.05,
        help:
          'The carrier’s asset-based charge (mortality & expense risk, administration, fund platform), taken as a percent of the contract value every year. Keep the underlying funds’ own expense ratio out of this — that belongs in the expected return above instead.',
      },
      {
        key: 'annuityAdvisoryFeePercent',
        label: 'Advisory fee',
        unit: 'percent',
        min: 0,
        max: 100,
        step: 0.05,
        help:
          'An advisory fee billed against the contract, tracked separately from the carrier’s own charges because it is usually negotiable or waivable in a way those are not.',
      },
      {
        key: 'annuitySurrenderSchedule',
        label: 'Surrender charge schedule',
        unit: 'percent',
        kind: 'surrenderSchedule',
        help:
          'Percent of a withdrawal the carrier keeps if it is taken during that contract year — year 1 is the year this account started. Leave a year out once the contract is past its surrender period.',
      },
      {
        key: 'penaltyRate',
        label: 'Early withdrawal penalty',
        unit: 'percent',
        min: 0,
        max: 100,
        help: 'The IRS 10% early-distribution penalty, charged on top of ordinary income tax before the penalty-free age.',
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
      accountClass: 'variableAnnuity',
      growthRate: 6.5,
      withdrawalTaxRate: 24,
      taxableWithdrawalPercent: 100,
      nonTaxableBase: 0,
      isQualifiedAnnuity: false,
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
      growthSchedule(),
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
      growthSchedule('Appreciation'),
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
      growthSchedule('Annual change'),
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
  'variableAnnuity',
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
