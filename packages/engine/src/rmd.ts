/**
 * Required Minimum Distributions (IRC §401(a)(9)).
 *
 * Nothing elsewhere in the engine ever forces money out of a tax-deferred
 * account — left alone, it compounds untouched to the horizon, which a real
 * one cannot do. Starting at `RMD_START_AGE` the IRS requires a withdrawal of
 * at least balance / divisor every year, whether or not the household needs
 * the cash, taxed as ordinary income at the account's own rate. Skipping it
 * doesn't skip the tax bill; it just isn't modelled as optional.
 *
 * IMPORTANT — this is a modelling approximation, not tax advice:
 *   - `UNIFORM_LIFETIME_TABLE` reproduces the IRS Uniform Lifetime Table
 *     (Treas. Reg. §1.401(a)(9)-9, Table III) effective for distribution
 *     years 2022 and later, from training data rather than a live fetch of
 *     Publication 590-B. Verify the current table before relying on it.
 *   - `RMD_START_AGE` is 73, correct for anyone born 1951–1959 (SECURE 2.0).
 *     Those born 1960 or later face 75 instead. The plan tracks birth YEAR
 *     only, the same whole-year convention `sepp.ts` uses for its own
 *     age-gated rule, so this module picks the single most common threshold
 *     rather than modelling the cohort split.
 *   - The Uniform Lifetime Table itself assumes a beneficiary ten years
 *     younger; a spouse who is the sole beneficiary and more than ten years
 *     younger gets a longer Joint Life table instead. Not modelled here.
 */

/**
 * IRS Uniform Lifetime Table (Table III), effective for distribution years
 * 2022 and later. Keyed by the age the account owner attains in the
 * distribution year.
 */
export const UNIFORM_LIFETIME_TABLE: Record<number, number> = {
  72: 27.4,
  73: 26.5,
  74: 25.5,
  75: 24.6,
  76: 23.7,
  77: 22.9,
  78: 22.0,
  79: 21.1,
  80: 20.2,
  81: 19.4,
  82: 18.5,
  83: 17.7,
  84: 16.8,
  85: 16.0,
  86: 15.2,
  87: 14.4,
  88: 13.7,
  89: 12.9,
  90: 12.2,
  91: 11.5,
  92: 10.8,
  93: 10.1,
  94: 9.5,
  95: 8.9,
  96: 8.4,
  97: 7.8,
  98: 7.3,
  99: 6.8,
  100: 6.4,
  101: 6.0,
  102: 5.6,
  103: 5.2,
  104: 4.9,
  105: 4.6,
  106: 4.3,
  107: 4.1,
  108: 3.9,
  109: 3.7,
  110: 3.5,
  111: 3.4,
  112: 3.3,
  113: 3.1,
  114: 3.0,
  115: 2.9,
  116: 2.8,
  117: 2.7,
  118: 2.5,
  119: 2.3,
  120: 2.0,
};

/** SECURE 2.0, for anyone born 1951–1959 — see the module doc. */
export const RMD_START_AGE = 73;

/** Nearest tabulated divisor, clamped to the table's ends rather than extrapolated. */
export function uniformLifetimeDivisor(age: number): number {
  const ages = Object.keys(UNIFORM_LIFETIME_TABLE).map(Number);
  const min = Math.min(...ages);
  const max = Math.max(...ages);
  const clamped = Math.round(Math.max(min, Math.min(max, age)));
  return UNIFORM_LIFETIME_TABLE[clamped];
}

/** The forced withdrawal for one account: 0 before `RMD_START_AGE` or once drained. */
export function requiredMinimumDistribution(balance: number, age: number): number {
  if (age < RMD_START_AGE || balance <= 0) return 0;
  return balance / uniformLifetimeDivisor(age);
}
