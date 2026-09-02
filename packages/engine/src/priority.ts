/**
 * The two ordered waterfalls (docs/PLAN.md §4.6).
 *
 *  - allocation: where a surplus goes, in order.
 *  - withdrawal: which accounts get drained to cover a shortfall, in order.
 *
 * Rules may target a tax component of an account, so a plan can say "drain the
 * Roth portion before the traditional portion of the same 401(k)".
 */
import type { Account, PriorityRule, TaxComponentKind } from './types.js';
import { contractYearFor, surrenderCharge } from './annuity.js';
import {
  costBasisGrossUp,
  costBasisTax,
  effectiveGainRate,
  effectiveWithdrawalRate,
  grossUp,
  proRataGrossUp,
  proRataTax,
} from './tax.js';

const EPSILON = 0.005;

export interface WithdrawalDraw {
  accountId: string;
  componentKind?: TaxComponentKind;
  /** Taken out of the account. */
  gross: number;
  /** Lost to tax and penalty. */
  tax: number;
  /**
   * Lost to an annuity surrender charge, if the account has an active one
   * for the current contract year (`annuity.ts`'s `surrenderCharge`). This
   * is a contract cost, not a tax — kept in its own field rather than folded
   * into `tax` so the two never blur into one number. Always 0 for an
   * account without `annuitySurrenderSchedule`.
   */
  surrenderCharge: number;
  /** Reaches the shortfall: `gross - tax - surrenderCharge`. */
  net: number;
}

export interface WithdrawalPlan {
  draws: WithdrawalDraw[];
  totalGross: number;
  totalTax: number;
  totalNet: number;
  /** > 0 means the waterfall ran dry: the plan FAILS this year. */
  unfunded: number;
}

export interface AllocationDraw {
  accountId: string;
  amount: number;
}

export interface AllocationPlan {
  draws: AllocationDraw[];
  allocated: number;
  /** Surplus no rule absorbed. Falls to the cash sweep. */
  unallocated: number;
}

export interface WaterfallContext {
  year: number;
  accounts: Map<string, Account>;
  balances: Map<string, number>;
  /** Remaining after-tax basis per account using the cost-basis model. */
  remainingBasis: Map<string, number>;
  /** Owner age per account, for early-withdrawal penalties. */
  ageForAccount(accountId: string): number | undefined;
  /** The plan's start year — an account without its own `startYear` is
   * treated as issued then, for `contractYearFor`. */
  planStartYear: number;
}

/** Withdrawal gating: `withdrawalTiming` plus `withdrawalStartingYear`. */
export function isWithdrawable(account: Account, year: number): boolean {
  if (!account.isIncluded) return false;
  if (account.isLiability) return false;
  switch (account.withdrawalTiming) {
    case 'never':
      return false;
    case 'always':
      return true;
    case 'starting_year':
      return year >= (account.withdrawalStartingYear ?? Infinity);
    default:
      return false;
  }
}

export function planWithdrawals(
  needed: number,
  rules: PriorityRule[],
  ctx: WaterfallContext,
): WithdrawalPlan {
  const draws: WithdrawalDraw[] = [];
  let remaining = needed;

  const ordered = rules
    .filter((r) => r.ruleType === 'withdrawal')
    .sort((a, b) => a.order - b.order);

  for (const rule of ordered) {
    if (remaining <= EPSILON) break;

    const account = ctx.accounts.get(rule.accountId);
    if (!account) continue;
    if (!isWithdrawable(account, ctx.year)) continue;

    const available = ctx.balances.get(rule.accountId) ?? 0;
    if (available <= EPSILON) continue;

    const age = ctx.ageForAccount(rule.accountId);
    let gross: number;
    let tax: number;

    if (account.nonTaxableBase !== undefined) {
      // A qualified contract with basis is pro-rata (§72's rule for an IRA
      // or plan annuity that still carries after-tax money); everything
      // else — the common nonqualified case, and any traditional
      // tax-deferred account whose basis is simply the same field reused —
      // is LIFO via the existing cost-basis functions. Same call shape
      // either way, so this is the one place that branches on it.
      const grossUpFn = account.isQualifiedAnnuity ? proRataGrossUp : costBasisGrossUp;
      const taxFn = account.isQualifiedAnnuity ? proRataTax : costBasisTax;

      const gainRate = effectiveGainRate(account, age);
      const basis = ctx.remainingBasis.get(rule.accountId) ?? account.nonTaxableBase;
      gross = grossUpFn(remaining, available, basis, gainRate);
      if (rule.config?.maxAnnual !== undefined) gross = Math.min(gross, rule.config.maxAnnual);
      gross = Math.min(gross, available);
      if (gross <= EPSILON) continue;

      const applied = taxFn(gross, available, basis, gainRate);
      tax = applied.tax;
      ctx.remainingBasis.set(rule.accountId, Math.max(0, basis - applied.basisUsed));
    } else {
      const rate = effectiveWithdrawalRate(account, age);
      gross = grossUp(remaining, rate);
      if (rule.config?.maxAnnual !== undefined) gross = Math.min(gross, rule.config.maxAnnual);
      gross = Math.min(gross, available);
      if (gross <= EPSILON) continue;
      tax = gross * rate;
    }

    // A surrender charge applies regardless of which tax branch ran above —
    // it is orthogonal to whether the account is on the flat-rate, LIFO, or
    // pro-rata model. 0 for any account without `annuitySurrenderSchedule`.
    const contractYear = contractYearFor(account.startYear, ctx.planStartYear, ctx.year);
    const surrender = surrenderCharge(gross, contractYear, account.annuitySurrenderSchedule);
    const net = gross - tax - surrender;

    draws.push({
      accountId: rule.accountId,
      componentKind: rule.componentKind,
      gross,
      tax,
      surrenderCharge: surrender,
      net,
    });
    ctx.balances.set(rule.accountId, available - gross);
    remaining -= net;
  }

  const totalGross = sum(draws.map((d) => d.gross));
  const totalTax = sum(draws.map((d) => d.tax));
  const totalNet = sum(draws.map((d) => d.net));

  return {
    draws,
    totalGross,
    totalTax,
    totalNet,
    unfunded: Math.max(0, remaining),
  };
}

export function planAllocations(
  surplus: number,
  rules: PriorityRule[],
  ctx: WaterfallContext,
): AllocationPlan {
  const draws: AllocationDraw[] = [];
  let remaining = surplus;

  const ordered = rules
    .filter((r) => r.ruleType === 'allocation')
    .sort((a, b) => a.order - b.order);

  for (const rule of ordered) {
    if (remaining <= EPSILON) break;

    const account = ctx.accounts.get(rule.accountId);
    if (!account || !account.isIncluded) continue;
    // Routing surplus at a debt means paying it down, capped at what is owed.
    const owed = account.isLiability ? (ctx.balances.get(rule.accountId) ?? 0) : Infinity;
    if (owed <= EPSILON) continue;

    let amount = remaining;
    if (rule.config?.percentOfSurplus !== undefined) {
      amount = Math.min(amount, surplus * (rule.config.percentOfSurplus / 100));
    }
    if (rule.config?.maxAnnual !== undefined) {
      amount = Math.min(amount, rule.config.maxAnnual);
    }
    amount = Math.min(amount, owed);
    if (amount <= EPSILON) continue;

    draws.push({ accountId: rule.accountId, amount });
    remaining -= amount;
  }

  return {
    draws,
    allocated: sum(draws.map((d) => d.amount)),
    unallocated: Math.max(0, remaining),
  };
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
