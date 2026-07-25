import type { Account } from './types.js';

/**
 * Effective rate lost to tax and penalty on a withdrawal from this account.
 *
 * Monarch models a FLAT effective rate per account rather than progressive
 * brackets, and we follow that (docs/PLAN.md §4.5). It is explainable, stable,
 * and sidesteps the fixed point where a withdrawal raises the bracket which
 * raises the withdrawal.
 */
export function effectiveWithdrawalRate(account: Account, ownerAge: number | undefined): number {
  const taxable = clampPercent(account.taxableWithdrawalPercent) / 100;
  const taxRate = clampPercent(account.withdrawalTaxRate) / 100;

  let rate = taxRate * taxable;

  const penaltyApplies =
    account.penaltyRate > 0 &&
    account.penaltyFreeAge !== undefined &&
    ownerAge !== undefined &&
    ownerAge < account.penaltyFreeAge;

  if (penaltyApplies) rate += clampPercent(account.penaltyRate) / 100;

  // A rate at or above 1 would make the gross-up infinite. Cap hard.
  return Math.min(rate, 0.95);
}

/**
 * Gross withdrawal required to NET a given amount.
 *
 *   gross = net / (1 - effectiveRate)
 *
 * Covering $100k from an account at 24% tax + 10% penalty needs $151,515, not
 * $100k. Skipping this understates the cost of early retirement by ~50%.
 */
export function grossUp(netNeeded: number, effectiveRate: number): number {
  if (netNeeded <= 0) return 0;
  const denominator = 1 - effectiveRate;
  if (denominator <= 0) return Infinity;
  return netNeeded / denominator;
}

function clampPercent(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
