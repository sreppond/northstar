import type { Account } from './types.js';

function penaltyApplies(account: Account, ownerAge: number | undefined): boolean {
  return (
    account.penaltyRate > 0 &&
    account.penaltyFreeAge !== undefined &&
    ownerAge !== undefined &&
    ownerAge < account.penaltyFreeAge
  );
}

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
  if (penaltyApplies(account, ownerAge)) rate += clampPercent(account.penaltyRate) / 100;

  // A rate at or above 1 would make the gross-up infinite. Cap hard.
  return Math.min(rate, 0.95);
}

/**
 * The rate charged on the GAIN portion of a cost-basis withdrawal — ordinary
 * income tax plus the early-withdrawal penalty, if it applies. Unlike
 * `effectiveWithdrawalRate` this never multiplies by a "taxable share": under
 * the cost-basis model (docs/PLAN.md §4.5a) that share is not a fixed input,
 * it falls out of how much gain is actually left in the account.
 */
export function effectiveGainRate(account: Account, ownerAge: number | undefined): number {
  const taxRate = clampPercent(account.withdrawalTaxRate) / 100;
  let rate = taxRate;
  if (penaltyApplies(account, ownerAge)) rate += clampPercent(account.penaltyRate) / 100;
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

/**
 * How a nonqualified annuity (or any account funded partly with after-tax
 * money) is actually taxed on the way out: LIFO, gain first. Every dollar
 * withdrawn is fully taxable (plus penalty, before the penalty-free age)
 * until the account's balance has been drawn back down to its remaining
 * basis — only THEN does a withdrawal start returning basis tax-free.
 *
 * `taxableWithdrawalPercent` cannot express this: it is a fixed share of
 * every withdrawal forever, so it neither reaches 0% once the basis is all
 * that is left, nor stays at 100% while any gain remains. Tracking
 * `remainingBasis` in nominal dollars and comparing it to the live balance is
 * what lets the taxable share fall out of the account's own arithmetic
 * instead of being a second, easily-inconsistent input.
 */
export function costBasisTax(
  gross: number,
  currentBalance: number,
  remainingBasis: number,
  gainRate: number,
): { tax: number; basisUsed: number } {
  if (gross <= 0) return { tax: 0, basisUsed: 0 };
  const gain = Math.max(0, currentBalance - Math.max(0, remainingBasis));
  const fromGain = Math.min(gross, gain);
  const fromBasis = Math.max(0, gross - fromGain);
  return { tax: fromGain * gainRate, basisUsed: fromBasis };
}

/**
 * Gross withdrawal that nets `netNeeded` under the cost-basis model:
 * drains remaining gain first (grossed up at `gainRate`, like `grossUp`),
 * then draws basis dollar-for-dollar once the gain runs out. Unconstrained by
 * the account's available balance or any per-year cap — the caller clamps
 * the result and re-derives tax for the clamped amount with `costBasisTax`.
 */
export function costBasisGrossUp(
  netNeeded: number,
  currentBalance: number,
  remainingBasis: number,
  gainRate: number,
): number {
  if (netNeeded <= 0) return 0;
  const gain = Math.max(0, currentBalance - Math.max(0, remainingBasis));
  if (gain <= 0) return netNeeded;

  const netFromAllGain = gain * (1 - gainRate);
  if (netNeeded <= netFromAllGain) {
    const denominator = 1 - gainRate;
    return denominator <= 0 ? Infinity : netNeeded / denominator;
  }

  return gain + (netNeeded - netFromAllGain);
}

function clampPercent(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}
