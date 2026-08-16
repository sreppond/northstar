/**
 * Return sensitivity — the same plan under a better and a worse market.
 *
 * Every number this app shows is a point estimate resting on one assumption:
 * that investments return exactly what was typed. That assumption is the
 * least reliable input in the whole model and the one a reader most needs to
 * see the consequences of. Shifting it and re-running is the cheapest honest
 * way to say "this is a projection, not a promise".
 *
 * Pure, like the rest of the engine: takes a plan, returns a new plan.
 */
import type { Account, Plan } from './types.js';

/** The default spread. Two points either side of the plan's own assumption. */
export const DEFAULT_RETURN_SHIFT = 2;

/**
 * A copy of `plan` with every market-exposed asset's growth rate moved by
 * `deltaPercentagePoints`.
 *
 * Deliberately narrow about what counts as market-exposed:
 *   - liabilities are untouched — a mortgage rate is contractual, not a return
 *   - `noChange` accounts are untouched — cash does not have a market return
 *   - a home's appreciation is untouched, because it lives in the buyAHome
 *     event rather than in an account, and property is not the market
 *
 * The result is a sensitivity on the investment portfolio specifically, which
 * is both what the phrase means and what the UI labels it.
 */
export function withReturnShift(plan: Plan, deltaPercentagePoints: number): Plan {
  if (deltaPercentagePoints === 0) return plan;

  return {
    ...plan,
    accounts: plan.accounts.map((account): Account => {
      if (account.isLiability) return account;

      if (account.growthRateMethod === 'fixed') {
        return { ...account, growthRate: account.growthRate + deltaPercentagePoints };
      }

      // A variable schedule is just as market-exposed as a flat rate, so every
      // anchor moves together — shifting the whole curve rather than flattening
      // it. Missing this would let one account quietly opt out of the fan.
      if (account.growthRateMethod === 'schedule') {
        return {
          ...account,
          growthRateSchedule: account.growthRateSchedule?.map((anchor) => ({
            ...anchor,
            rate: anchor.rate + deltaPercentagePoints,
          })),
        };
      }

      return account;
    }),
  };
}

/**
 * The rate a "Return X%" label should quote — the largest fixed rate among
 * market-exposed assets, which is the one driving the projection.
 *
 * Returns undefined when nothing in the plan has a market return, so callers
 * can hide the control rather than quote a rate that does not exist.
 */
export function headlineReturnRate(plan: Plan): number | undefined {
  const rates = plan.accounts
    .filter((a) => !a.isLiability && a.isIncluded)
    .flatMap((a) => {
      if (a.growthRateMethod === 'fixed') return [a.growthRate];
      // A scheduled account still has a market return; quote its peak so the
      // label and the fan agree about which accounts are in play.
      if (a.growthRateMethod === 'schedule') {
        return (a.growthRateSchedule ?? []).map((anchor) => anchor.rate);
      }
      return [];
    });
  return rates.length > 0 ? Math.max(...rates) : undefined;
}
