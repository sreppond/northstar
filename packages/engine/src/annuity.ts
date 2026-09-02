/**
 * Annuity contract mechanics that do not belong in `tax.ts` (which is about
 * how a WITHDRAWAL is taxed) or `run.ts` (which is about the year loop's
 * ordering, not the arithmetic inside one step): contract-level fee drag on
 * growth, and the surrender charge a withdrawal can trigger.
 *
 * Both features are opt-in and additive. An account that never sets
 * `annuityFlatFeeAnnual` / `annuityAssetFeePercent` / `annuityAdvisoryFeePercent`
 * pays `annuityFeeForYear` exactly 0, and one that never sets
 * `annuitySurrenderSchedule` pays `surrenderCharge` exactly 0 — so a plain
 * 401(k), IRA, or brokerage that has never heard of either field runs through
 * `run.ts`/`priority.ts` completely unchanged.
 *
 * What is deliberately NOT modeled here (see also `tax.ts` and `sepp.ts`):
 *   - **Annuitization payout mode.** Converting a deferred contract to a
 *     lifetime income stream switches its tax treatment to the §72(b)
 *     exclusion ratio (basis ÷ expected return, applied to each payment)
 *     instead of LIFO or pro-rata withdrawals. That is a genuinely different
 *     mode — a different kind of cash flow, not just a different tax
 *     formula — and nothing in this engine represents it. (Do not confuse
 *     this with the fixed ANNUITIZATION *method* `sepp.ts` supports for
 *     sizing a §72(t)/(q) SEPP payment: that is one way to size a
 *     distribution from a still-deferred contract, not this payout mode.)
 *   - **§72(e)(11)/(12) contract aggregation.** Multiple deferred annuities
 *     issued by the same carrier to the same owner in the same calendar year
 *     are supposed to be treated as one contract when computing the taxable
 *     amount. Each account here is taxed standalone; a household with two
 *     same-carrier, same-year contracts sees a slightly optimistic split.
 *   - **The 3.8% net investment income tax (§1411).** The taxable part of a
 *     nonqualified annuity distribution is investment income under §1411,
 *     but the whole engine is federal-ordinary-income-only with no
 *     MAGI-threshold surtax layer for it to live in.
 *   - **State tax**, consistent with the rest of the engine.
 *
 * None of this is tax advice.
 */
import type { Account, SurrenderScheduleEntry } from './types.js';

const EPSILON = 0.005;

/**
 * Contract fees for one year: a flat dollar charge plus an asset-based
 * percentage (M&E, administrative, advisory — `annuityAssetFeePercent` and
 * `annuityAdvisoryFeePercent` are summed, since both are just a percent of
 * value and the split between them is only about who is charging it, not
 * how). Returns 0 for an account that sets neither, so this is a no-op for
 * every account type that predates the annuity feature.
 *
 * The asset-based portion is assessed on the year's MID-point value —
 * `open + grossGrowth / 2` — rather than on the opening balance. A carrier
 * charges this daily against whatever the contract happens to be worth that
 * day; pricing a whole year's charge off the balance the account opened with
 * systematically understates the fee in a growing year and overstates it in
 * a falling one. The midpoint is the cheapest correction that gets the sign
 * right both ways, and it is well within the precision an annual-step engine
 * can honestly claim (ported from a sibling engine's `feesForYear` — see
 * docs/PLAN.md for the pointer).
 *
 * `yearFraction` scales BOTH the flat fee and the asset-based rate the same
 * way `growthRateFor` is already scaled in `run.ts` — a contract that starts
 * partway through the plan's first year (docs/PLAN.md §4.3) is charged only
 * for the months it existed, exactly like growth and every other recurring
 * flow that year. This is what lets fee drag compose with the existing
 * opening-balance-net-of-withdrawals growth rule instead of fighting it:
 * `annuityFeeForYear` only ever shrinks the SAME `grossGrowth` number
 * `run.ts` already computed, so `close = growthBase + contributions +
 * (grossGrowth - fees)` keeps reconciling exactly the way `close = open +
 * contributions - withdrawals + growth` always has.
 *
 * The fee can never drive the year's value below zero — a nearly-exhausted
 * contract is closed out, not driven negative, the same clamp `run.ts`
 * already applies to every other balance.
 */
export function annuityFeeForYear(
  account: Pick<Account, 'annuityFlatFeeAnnual' | 'annuityAssetFeePercent' | 'annuityAdvisoryFeePercent'>,
  openingBalance: number,
  grossGrowth: number,
  yearFraction: number,
): number {
  const flat = account.annuityFlatFeeAnnual ?? 0;
  const assetBasedPercent = (account.annuityAssetFeePercent ?? 0) + (account.annuityAdvisoryFeePercent ?? 0);
  if (flat <= 0 && assetBasedPercent <= 0) return 0;

  const midYearValue = Math.max(0, openingBalance + grossGrowth / 2);
  const assetBasedFee = midYearValue * (assetBasedPercent / 100) * yearFraction;
  const flatFee = flat * yearFraction;

  const availableToCharge = Math.max(0, openingBalance + grossGrowth);
  return Math.min(availableToCharge, flatFee + assetBasedFee);
}

/**
 * The CONTRACT year a calendar year falls in: 1 for the year the account
 * came into existence, 2 for the next, and so on. Falls back to the plan's
 * start year for an account that never set its own `startYear`, mirroring
 * `run.ts`'s own `const begins = account.startYear ?? startYear` — the same
 * "defaults to plan start" rule `types.ts` documents for `Account.startYear`.
 */
export function contractYearFor(
  accountStartYear: number | undefined,
  planStartYear: number,
  year: number,
): number {
  const issueYear = accountStartYear ?? planStartYear;
  return year - issueYear + 1;
}

/**
 * The surrender charge a withdrawal triggers: `withdrawalGross` times
 * whatever percent `schedule` names for `contractYear`, or 0 if `schedule`
 * is unset, empty, or simply has no entry for that year.
 *
 * "No entry" is deliberately NOT "hold the last rate" the way
 * `rateFromSchedule` treats a growth schedule (`accounts.ts`) — a surrender
 * schedule is sold as a shrinking, FINITE list ("7% in year 1 … 0% from year
 * 8 on"), and a contract past its surrender period should cost nothing to
 * leave, not freeze at whatever the last listed year happened to charge.
 * Declare every contract year the charge applies to; anything else is free.
 *
 * This is a genuine cost of taking the money out, not a tax — it is computed
 * here rather than folded into `effectiveWithdrawalRate` / `costBasisTax` /
 * `proRataTax` so that a tax rate and a contract charge never blur into one
 * number, and so a caller can show them on separate lines. `priority.ts`
 * subtracts it from `net` the same way it subtracts `tax`, which means a
 * heavily-surrender-charged withdrawal can leave a shortfall unfunded even
 * though the account had the gross dollars to give — the correct behavior,
 * since the household never actually receives what the carrier keeps.
 */
export function surrenderCharge(
  withdrawalGross: number,
  contractYear: number,
  schedule: SurrenderScheduleEntry[] | undefined,
): number {
  if (withdrawalGross <= EPSILON || !schedule || schedule.length === 0) return 0;
  const entry = schedule.find((e) => e.year === contractYear);
  if (!entry) return 0;
  const percent = Math.max(0, Math.min(100, entry.percent));
  return withdrawalGross * (percent / 100);
}
