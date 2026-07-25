/**
 * Core domain types. Mirrors the model reverse-engineered from Monarch's
 * Forecasting GraphQL schema (see docs/PLAN.md §2).
 *
 * Conventions used throughout the engine:
 *  - All balances are POSITIVE magnitudes. `isLiability` distinguishes debts
 *    from assets. Net worth = sum(assets) - sum(liabilities). This is less
 *    error-prone than Monarch's signed balances.
 *  - All money in a PlanResult is NOMINAL (future dollars). `dollarMode`
 *    deflates at presentation time only.
 *  - All rates are PERCENTAGES (6.5 means 6.5%), never decimals.
 */

export type EventKind =
  | 'annualExpense'
  | 'buyAHome'
  | 'careerBreak'
  | 'endOfPlan'
  | 'haveAKid'
  | 'income'
  | 'newJob'
  | 'otherExpense'
  | 'retirement'
  | 'socialSecurity'
  | 'windfall';

export type GrowthRateMethod = 'fixed' | 'noChange' | 'schedule';
export type WithdrawalTiming = 'always' | 'never' | 'starting_year';
export type RuleType = 'allocation' | 'withdrawal';
export type DollarMode = 'futureDollars' | 'todaysDollars';
export type TaxComponentKind = 'taxable' | 'taxDeferred' | 'taxFree';

export type AccountClass =
  | 'cash'
  | 'taxableInvestment'
  | 'taxDeferredInvestment'
  | 'taxFreeInvestment'
  | 'realEstate'
  | 'otherAsset'
  | 'creditCard'
  | 'loan'
  | 'mortgage';

export interface RateAnchor {
  year: number;
  rate: number;
}

export interface TaxComponent {
  kind: TaxComponentKind;
  balance: number;
  annualContribution: number;
}

export interface TaxTreatmentConfig {
  enabled: boolean;
  components: TaxComponent[];
}

export interface Account {
  id: string;
  name: string;
  accountClass: AccountClass;
  isLiability: boolean;
  /** Positive magnitude at `startYear` (or plan start if unset). */
  initialBalance: number;
  isIncluded: boolean;

  /** Year the account comes into existence. Defaults to the plan start year. */
  startYear?: number;
  /** True when created by an event rather than by the user. */
  isSynthetic?: boolean;
  /** The event that created (and owns) this account. */
  sourceEventId?: string;
  ownerParticipantId?: string;

  // --- growth -------------------------------------------------------------
  growthRateMethod: GrowthRateMethod;
  growthRate: number;
  growthRateSchedule?: RateAnchor[];

  // --- debt ---------------------------------------------------------------
  /** APR, percent. Liabilities only. */
  interestRate?: number;
  /** Annual scheduled payment. Liabilities only. */
  plannedPayment?: number;
  minimumPayment?: number;
  /** Amortization term. When set, the loan retires on schedule. */
  termYears?: number;

  // --- withdrawal behaviour ----------------------------------------------
  withdrawalTiming: WithdrawalTiming;
  withdrawalStartingYear?: number;
  /** Effective tax rate applied to the taxable portion of a withdrawal. */
  withdrawalTaxRate: number;
  /** Percent of a withdrawal that is taxable at all. */
  taxableWithdrawalPercent: number;
  /** Early-withdrawal penalty, percent. */
  penaltyRate: number;
  /** Age at which `penaltyRate` stops applying. */
  penaltyFreeAge?: number;

  // --- contributions ------------------------------------------------------
  /** Standing annual contribution out of pay. */
  yearlyPaycheckContribution?: number;

  taxTreatmentConfig?: TaxTreatmentConfig;

  // --- provenance from a linked real-world account ------------------------
  linkedGrowthRate?: number;
  linkedInterestRate?: number;
  linkedPlannedPayment?: number;
  linkedMinimumPayment?: number;
}

export interface PlanEvent {
  id: string;
  kind: EventKind;
  name: string;
  startYear: number;
  isIncluded: boolean;
  isHidden?: boolean;
  /** `endOfPlan` is required and cannot be deleted. */
  isRequired?: boolean;
  icon?: string;
  color?: string;
  /** Kind-specific payload, validated by the event module's schema. */
  config: unknown;
}

export interface PriorityRule {
  accountId: string;
  componentKind?: TaxComponentKind;
  ruleType: RuleType;
  order: number;
  config?: {
    /** Cap on how much this rule absorbs/supplies in one year. */
    maxAnnual?: number;
    /** Take only this share of the surplus (allocation rules). */
    percentOfSurplus?: number;
  };
}

export interface Participant {
  id: string;
  name: string;
  birthYear: number;
  lifeExpectancy: number;
  isIncluded: boolean;
}

export interface PlanSettings {
  startYear: number;
  projectionYears: number;
  /** Percent per year. Applied to baseline flows and any event marked inflating. */
  inflationRate: number;
  dollarMode: DollarMode;
  /** Recurring earned income not attached to a job event. */
  baselineIncome: number;
  /** Recurring living expenses. */
  baselineExpenses: number;
  /** Flat effective tax rate on ordinary income, percent. */
  incomeTaxRate: number;
}

export interface Plan {
  id: string;
  name: string;
  settings: PlanSettings;
  participants: Participant[];
  accounts: Account[];
  events: PlanEvent[];
  rules: PriorityRule[];
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/**
 * Every figure the UI renders is a LineItem, and every LineItem carries the
 * event that caused it. This is what lets the Cash Flow tab break out a row
 * per event. Retrofitting provenance is a rewrite -- see docs/PLAN.md §4.7.
 */
export interface LineItem {
  label: string;
  amount: number;
  sourceEventId?: string;
  accountId?: string;
  category?: string;
}

export interface AccountYear {
  accountId: string;
  name: string;
  accountClass: AccountClass;
  isLiability: boolean;
  open: number;
  growth: number;
  contributions: number;
  withdrawals: number;
  /** Liabilities only. */
  interest: number;
  /** Liabilities only. */
  principal: number;
  close: number;
}

export interface YearSnapshot {
  year: number;
  /** participantId -> age at year end. */
  ages: Record<string, number>;

  income: LineItem[];
  expenses: LineItem[];
  taxes: LineItem[];
  withdrawals: LineItem[];
  allocations: LineItem[];

  totalIncome: number;
  totalExpenses: number;
  totalTaxes: number;
  netCashFlow: number;

  accounts: AccountYear[];

  assets: number;
  liabilities: number;
  netWorth: number;

  /** Set when the withdrawal waterfall ran dry: the plan fails this year. */
  unfundedShortfall?: number;
}

export interface PlanResult {
  startYear: number;
  endYear: number;
  years: YearSnapshot[];
  warnings: string[];
}
