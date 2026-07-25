/**
 * The contract every event kind implements.
 *
 * Compilation (phase A) turns an event into static schedules before the year
 * loop runs. Only genuinely state-dependent behaviour -- surplus allocation,
 * shortfall withdrawal, the tax on those withdrawals -- happens inside the
 * loop. See docs/PLAN.md §4.2.
 *
 * Compiled amounts are always NOMINAL: a module that inflates does so here,
 * so the year loop only ever sums.
 */
import type { z } from 'zod';
import type { Account, EventKind, Participant, PlanEvent, PlanSettings } from '../types.js';

export interface CashFlowItem {
  year: number;
  kind: 'income' | 'expense';
  amount: number;
  label: string;
  sourceEventId: string;
  /** Income only: subject to `incomeTaxRate`. */
  taxable?: boolean;
  /** Income only: wages, which retirement and career breaks suppress. */
  isEarned?: boolean;
  category?: string;
}

export interface ContributionItem {
  year: number;
  accountId: string;
  amount: number;
  label: string;
  sourceEventId: string;
  /** False for employer match: money into the account that never hit cash flow. */
  fromPaycheck: boolean;
  /** Reduces taxable income (traditional 401k and similar). */
  pretax: boolean;
}

export interface IncomeSuppression {
  fromYear: number;
  toYear: number;
  /** 0 = income fully stops; 60 = it drops to 60% of what it would have been. */
  replacementPercent: number;
  sourceEventId: string;
}

export interface ExpenseMultiplier {
  fromYear: number;
  toYear: number;
  /** 0.8 = baseline living expenses fall 20%. */
  multiplier: number;
  sourceEventId: string;
}

/**
 * Closes an account at the START of `year`, using its opening balance:
 * an asset's balance becomes sale proceeds, a liability's balance is paid off.
 * Both flow through the ordinary waterfalls.
 */
export interface AccountTermination {
  year: number;
  accountId: string;
  label: string;
  sourceEventId: string;
}

export interface CompiledEvent {
  eventId: string;
  cashFlows: CashFlowItem[];
  contributions: ContributionItem[];
  /** Synthetic accounts this event owns, e.g. a home and its mortgage. */
  accountsCreated: Account[];
  accountTerminations: AccountTermination[];
  incomeSuppressions: IncomeSuppression[];
  expenseMultipliers: ExpenseMultiplier[];
  /** Retirement: zero every standing paycheck contribution from this year on. */
  stopContributionsFrom?: number;
  /** `endOfPlan` only: the last year of the projection. */
  horizon?: number;
}

export interface CompileContext {
  settings: PlanSettings;
  participants: Participant[];
  startYear: number;
  /** Last year of the projection, resolved before other events compile. */
  endYear: number;
  /** Nominal inflation factor from the plan start year to `year`. */
  inflationAt(year: number): number;
}

export interface EventModule<C> {
  kind: EventKind;
  label: string;
  /** Three-letter code shown as the chart pin. */
  code: string;
  /**
   * `C` is the PARSED shape. The input side is left open because schemas use
   * `.default()`, which makes a field optional going in and guaranteed coming
   * out -- the two sides genuinely differ.
   */
  schema: z.ZodType<C, z.ZodTypeDef, any>;
  defaults(ctx: CompileContext): C;
  compile(event: PlanEvent, config: C, ctx: CompileContext): CompiledEvent;
}

export function emptyCompiled(eventId: string): CompiledEvent {
  return {
    eventId,
    cashFlows: [],
    contributions: [],
    accountsCreated: [],
    accountTerminations: [],
    incomeSuppressions: [],
    expenseMultipliers: [],
  };
}

/** Inclusive year range, clamped to the projection. */
export function yearRange(from: number, to: number, ctx: CompileContext): number[] {
  const lo = Math.max(from, ctx.startYear);
  const hi = Math.min(to, ctx.endYear);
  const out: number[] = [];
  for (let y = lo; y <= hi; y++) out.push(y);
  return out;
}

/** Defaults shared by every synthetic account an event creates. */
export function syntheticAccountDefaults(sourceEventId: string) {
  return {
    isIncluded: true,
    isSynthetic: true as const,
    sourceEventId,
    withdrawalTiming: 'never' as const,
    withdrawalTaxRate: 0,
    taxableWithdrawalPercent: 0,
    penaltyRate: 0,
  };
}
