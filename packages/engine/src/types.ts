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
  | 'job'
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
export type GoalKind = 'house' | 'retirement' | 'custom';

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
  /**
   * Percent of a withdrawal that is taxable at all. Ignored once
   * `nonTaxableBase` is set — the cost-basis model below computes the
   * taxable share itself instead of taking it as a fixed input.
   */
  taxableWithdrawalPercent: number;
  /**
   * Remaining after-tax principal, in nominal dollars — the "base" of a
   * nonqualified annuity or any account funded partly with money that was
   * already taxed. When set, withdrawals draw down GAIN first (fully taxed,
   * plus penalty before `penaltyFreeAge`) and only reach this base, tax-free,
   * once the account's balance has been drawn down to it (docs/PLAN.md
   * §4.5a). It only ever falls — spent basis does not come back — and growth
   * never adds to it, since growth is exactly what "gain" means here.
   */
  nonTaxableBase?: number;
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
  /**
   * Set when this rule was derived from a `Goal` rather than authored by
   * hand (`goalsToAllocationRules` in `goals.ts`). Lets the store find and
   * replace a goal's own rule on every edit without disturbing anyone else's
   * hand-authored rules that happen to target the same account.
   */
  sourceGoalId?: string;
}

export interface Participant {
  id: string;
  name: string;
  birthYear: number;
  lifeExpectancy: number;
  isIncluded: boolean;
}

/**
 * A bucket money flows into with an intent -- "$300K for a house by 2031"
 * (docs/REDESIGN.md §2.2). It is a friendly SURFACE over the allocation
 * waterfall the engine already runs, not a new mechanic: a goal with a target
 * and a date derives the annual contribution it needs, that becomes an
 * allocation rule's `maxAnnual`, and the accounts it is `fundedFromAccountIds`
 * are the ones a progress reading sums against the target. Earmarking is a
 * label and an ordering, never a hard partition -- the dollars stay fungible.
 */
export interface Goal {
  id: string;
  name: string;
  kind: GoalKind;
  /** The number to reach, in nominal dollars. */
  targetAmount?: number;
  /** The year to reach it by. */
  byYear?: number;
  /** Accounts that count toward, and feed, this goal. */
  fundedFromAccountIds: string[];
  /** The `buyAHome` / `retirement` event this goal stands for, if any. */
  linkedEventId?: string;
}

export interface PlanSettings {
  startYear: number;
  /**
   * ISO date (`YYYY-MM-DD`) the projection actually starts counting from.
   * Balances are as of this date, not January 1st of `startYear` — so when it
   * falls partway through `startYear`, that first year is a PARTIAL year:
   * growth, debt interest, and every recurring income/expense/contribution
   * only run for the fraction of the year still remaining (docs/PLAN.md
   * §4.3). Omitted, or any date outside `startYear`, means "treat `startYear`
   * as a full year" — the historical behaviour, and what every year after the
   * first always gets regardless.
   */
  asOfDate?: string;
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
  /**
   * Another plan to draw alongside this one for comparison. Metadata only —
   * `runPlan` ignores it; the UI runs the other plan separately.
   */
  compareToPlanId?: string;
  /**
   * How a linked Monarch account maps onto an `AccountClass`, keyed by Monarch
   * account id. Import metadata only — `runPlan` ignores it.
   *
   * It lives here because Monarch's `get_accounts` cannot say whether a
   * brokerage is taxable, tax-deferred or Roth, so the answer has to come from
   * the user once and then survive every later refresh. See `monarch.ts`.
   */
  monarchOverrides?: Record<string, AccountClass>;
}

export interface Plan {
  id: string;
  name: string;
  settings: PlanSettings;
  participants: Participant[];
  accounts: Account[];
  events: PlanEvent[];
  rules: PriorityRule[];
  /**
   * Buckets money flows into (docs/REDESIGN.md §2.2). Optional so every plan
   * saved before goals existed stays valid and reads as "no goals yet"; a plan
   * that has never set one simply omits it. Treat a missing value as `[]`.
   */
  goals?: Goal[];
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
  /** Set only for accounts using the cost-basis model (`nonTaxableBase`). */
  nonTaxableBaseRemaining?: number;
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
