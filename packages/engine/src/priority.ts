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
import { effectiveWithdrawalRate, grossUp } from './tax.js';

const EPSILON = 0.005;

export interface WithdrawalDraw {
  accountId: string;
  componentKind?: TaxComponentKind;
  /** Taken out of the account. */
  gross: number;
  /** Lost to tax and penalty. */
  tax: number;
  /** Reaches the shortfall. */
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
  /** Owner age per account, for early-withdrawal penalties. */
  ageForAccount(accountId: string): number | undefined;
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

    const rate = effectiveWithdrawalRate(account, ctx.ageForAccount(rule.accountId));

    let gross = grossUp(remaining, rate);
    if (rule.config?.maxAnnual !== undefined) gross = Math.min(gross, rule.config.maxAnnual);
    gross = Math.min(gross, available);
    if (gross <= EPSILON) continue;

    const tax = gross * rate;
    const net = gross - tax;

    draws.push({ accountId: rule.accountId, componentKind: rule.componentKind, gross, tax, net });
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
