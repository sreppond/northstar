// The IRS actuarial tables a SEPP calculation reads from, verbatim.
//
// These are transcribed from primary sources, not from memory or from a
// third-party calculator, and each one records where it came from so a
// future maintainer can re-verify it rather than trusting this file:
//
//   SINGLE_LIFE_TABLE        Treas. Reg. §1.401(a)(9)-9(b), as published in
//                            IRS Publication 590-B Appendix B, Table I
//                            ("2022 and thereafter"). Effective for
//                            distribution years beginning on or after
//                            2022-01-01 (T.D. 9930, 85 FR 72427).
//
//   SEPP_UNIFORM_LIFETIME_TABLE
//                            Appendix A to IRS Notice 2022-6. NOT the same
//                            table as rmd.ts's UNIFORM_LIFETIME_TABLE: the
//                            values agree exactly for every age they share
//                            (72-120), but Notice 2022-6 extends the table
//                            down to age 10 precisely so a SEPP taken
//                            decades before RMD age has a divisor at all.
//                            rmd.ts's copy is deliberately left alone —
//                            it is scoped to forced RMDs, which never
//                            happen before 73.
//
//   MORTALITY_RATES          Table 4 to Treas. Reg. §1.401(a)(9)-9(e), as
//                            published in T.D. 9930 (85 FR 72427,
//                            2020-11-12) — the probability of death at each
//                            age. Notice 2022-6 §3.01(c) names this exact
//                            table as the one the fixed annuitization
//                            method's annuity factor must be derived from.
//
// Verified 2026-08-30 by an independent cross-check rather than by eye:
// re-deriving curtate life expectancy from MORTALITY_RATES and adding the
// half-year adjustment reproduces SINGLE_LIFE_TABLE to the published tenth
// at every age sampled (0 → 84.6, 30 → 55.3, 50 → 36.2, 70 → 18.8, 90 →
// 5.7). Two tables from two different documents agreeing to that precision
// is strong evidence neither was mis-transcribed. `seppTables.test.ts`
// keeps that check running.

/** Treas. Reg. §1.401(a)(9)-9(b) / Pub. 590-B Table I, 2022 and later. */
export const SINGLE_LIFE_TABLE: Readonly<Record<number, number>> = {
  0: 84.6, 1: 83.7, 2: 82.8, 3: 81.8, 4: 80.8, 5: 79.8,
  6: 78.8, 7: 77.9, 8: 76.9, 9: 75.9, 10: 74.9, 11: 73.9,
  12: 72.9, 13: 71.9, 14: 70.9, 15: 69.9, 16: 69.0, 17: 68.0,
  18: 67.0, 19: 66.0, 20: 65.0, 21: 64.1, 22: 63.1, 23: 62.1,
  24: 61.1, 25: 60.2, 26: 59.2, 27: 58.2, 28: 57.3, 29: 56.3,
  30: 55.3, 31: 54.4, 32: 53.4, 33: 52.5, 34: 51.5, 35: 50.5,
  36: 49.6, 37: 48.6, 38: 47.7, 39: 46.7, 40: 45.7, 41: 44.8,
  42: 43.8, 43: 42.9, 44: 41.9, 45: 41.0, 46: 40.0, 47: 39.0,
  48: 38.1, 49: 37.1, 50: 36.2, 51: 35.3, 52: 34.3, 53: 33.4,
  54: 32.5, 55: 31.6, 56: 30.6, 57: 29.8, 58: 28.9, 59: 28.0,
  60: 27.1, 61: 26.2, 62: 25.4, 63: 24.5, 64: 23.7, 65: 22.9,
  66: 22.0, 67: 21.2, 68: 20.4, 69: 19.6, 70: 18.8, 71: 18.0,
  72: 17.2, 73: 16.4, 74: 15.6, 75: 14.8, 76: 14.1, 77: 13.3,
  78: 12.6, 79: 11.9, 80: 11.2, 81: 10.5, 82: 9.9, 83: 9.3,
  84: 8.7, 85: 8.1, 86: 7.6, 87: 7.1, 88: 6.6, 89: 6.1,
  90: 5.7, 91: 5.3, 92: 4.9, 93: 4.6, 94: 4.3, 95: 4.0,
  96: 3.7, 97: 3.4, 98: 3.2, 99: 3.0, 100: 2.8, 101: 2.6,
  102: 2.5, 103: 2.3, 104: 2.2, 105: 2.1, 106: 2.1, 107: 2.1,
  108: 2.0, 109: 2.0, 110: 2.0, 111: 2.0, 112: 2.0, 113: 1.9,
  114: 1.9, 115: 1.8, 116: 1.8, 117: 1.6, 118: 1.4, 119: 1.1,
  120: 1.0,
};

/** Appendix A to IRS Notice 2022-6 — the Uniform Lifetime Table extended
 * down to age 10 for SEPP use. See the module header on why this is a
 * separate constant from rmd.ts's table rather than a shared one. */
export const SEPP_UNIFORM_LIFETIME_TABLE: Readonly<Record<number, number>> = {
  10: 88.2, 11: 87.2, 12: 86.2, 13: 85.2, 14: 84.2, 15: 83.2,
  16: 82.2, 17: 81.2, 18: 80.2, 19: 79.2, 20: 78.2, 21: 77.2,
  22: 76.2, 23: 75.2, 24: 74.2, 25: 73.3, 26: 72.3, 27: 71.3,
  28: 70.3, 29: 69.3, 30: 68.3, 31: 67.3, 32: 66.3, 33: 65.3,
  34: 64.3, 35: 63.3, 36: 62.3, 37: 61.3, 38: 60.3, 39: 59.4,
  40: 58.4, 41: 57.4, 42: 56.4, 43: 55.4, 44: 54.4, 45: 53.4,
  46: 52.4, 47: 51.5, 48: 50.5, 49: 49.5, 50: 48.5, 51: 47.5,
  52: 46.5, 53: 45.6, 54: 44.6, 55: 43.6, 56: 42.6, 57: 41.6,
  58: 40.7, 59: 39.7, 60: 38.7, 61: 37.7, 62: 36.8, 63: 35.8,
  64: 34.9, 65: 33.9, 66: 33.0, 67: 32.0, 68: 31.1, 69: 30.1,
  70: 29.2, 71: 28.3, 72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6,
  76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4,
  82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4,
  88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
  94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8,
  100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6,
  106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4,
  112: 3.3, 113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7,
  118: 2.5, 119: 2.3, 120: 2.0,
};

/** Table 4 to Treas. Reg. §1.401(a)(9)-9(e): probability of death at each
 * age. Ages 115-120 are all 0.4 in the published table; this module treats
 * age 120 as the last age anyone can be alive at (see `annuityFactor`). */
export const MORTALITY_RATES: Readonly<Record<number, number>> = {
  0: 0.001762, 1: 0.000441, 2: 0.000292, 3: 0.000232, 4: 0.000177,
  5: 0.000161, 6: 0.000153, 7: 0.000145, 8: 0.000132, 9: 0.000127,
  10: 0.000128, 11: 0.000135, 12: 0.000146, 13: 0.000164, 14: 0.000192,
  15: 0.000223, 16: 0.000253, 17: 0.000276, 18: 0.000293, 19: 0.000304,
  20: 0.000313, 21: 0.000343, 22: 0.000377, 23: 0.000421, 24: 0.000466,
  25: 0.00052, 26: 0.000581, 27: 0.00063, 28: 0.000677, 29: 0.00072,
  30: 0.000763, 31: 0.000799, 32: 0.000824, 33: 0.000833, 34: 0.00083,
  35: 0.000823, 36: 0.000819, 37: 0.000824, 38: 0.000836, 39: 0.000853,
  40: 0.000879, 41: 0.000909, 42: 0.000945, 43: 0.00098, 44: 0.001019,
  45: 0.001065, 46: 0.001132, 47: 0.001225, 48: 0.001345, 49: 0.001485,
  50: 0.001656, 51: 0.001874, 52: 0.002121, 53: 0.002397, 54: 0.002701,
  55: 0.003032, 56: 0.00339, 57: 0.003774, 58: 0.004181, 59: 0.004613,
  60: 0.005071, 61: 0.005554, 62: 0.006071, 63: 0.006624, 64: 0.007225,
  65: 0.007884, 66: 0.008238, 67: 0.008659, 68: 0.009163, 69: 0.009767,
  70: 0.010491, 71: 0.011358, 72: 0.012385, 73: 0.013598, 74: 0.015014,
  75: 0.01667, 76: 0.018587, 77: 0.020815, 78: 0.023391, 79: 0.026387,
  80: 0.02985, 81: 0.033883, 82: 0.038544, 83: 0.04388, 84: 0.049956,
  85: 0.056799, 86: 0.064436, 87: 0.072882, 88: 0.082137, 89: 0.092172,
  90: 0.102919, 91: 0.114344, 92: 0.126605, 93: 0.139936, 94: 0.154844,
  95: 0.171902, 96: 0.18721, 97: 0.204659, 98: 0.222921, 99: 0.241884,
  100: 0.261476, 101: 0.281536, 102: 0.301847, 103: 0.322371, 104: 0.34294,
  105: 0.361261, 106: 0.372886, 107: 0.381098, 108: 0.383358, 109: 0.385709,
  110: 0.388092, 111: 0.390353, 112: 0.392822, 113: 0.395188, 114: 0.397567,
  115: 0.4, 116: 0.4, 117: 0.4, 118: 0.4, 119: 0.4,
  120: 0.4,
};

/** The oldest age any of the tables above is defined for. */
export const MAX_TABLE_AGE = 120;

function lookup(table: Readonly<Record<number, number>>, age: number, minAge: number): number {
  const clamped = Math.max(minAge, Math.min(MAX_TABLE_AGE, Math.floor(age)));
  return table[clamped]!;
}

/** Life expectancy from the Single Life Table, clamped to the table's ends
 * rather than extrapolated past them. */
export function singleLifeExpectancy(age: number): number {
  return lookup(SINGLE_LIFE_TABLE, age, 0);
}

/** Distribution period from Notice 2022-6's Uniform Lifetime Table. Ages
 * below 10 clamp to the age-10 entry — the table simply does not go lower,
 * and nobody under 10 is electing a SEPP. */
export function seppUniformLifetimePeriod(age: number): number {
  return lookup(SEPP_UNIFORM_LIFETIME_TABLE, age, 10);
}

/**
 * The annuity factor the fixed annuitization method divides by: the present
 * value, at `ratePercent`, of $1 per year payable for life starting at
 * `age`, using the §1.401(a)(9)-9(e) mortality rates.
 *
 * Computed as a life annuity-DUE — the t = 0 payment is worth a full $1
 * because Notice 2022-6 §3.01(c) describes the annuity as "beginning at the
 * employee's age", i.e. the first payment is made immediately rather than a
 * year later. Sanity check on that reading: at age 50 and 4.0% this returns
 * 19.157, within 0.4% of the 19.087 factor the IRS's own worked example
 * uses for a 50-year-old (irs.gov/retirement-plans/substantially-equal-
 * periodic-payments) — and that example's residual difference is explained,
 * since it dates from Rev. Rul. 2002-62 and was computed on the older
 * mortality table this one superseded. The annuity-immediate reading is a
 * full 1.0 away from that figure, so it is not what the IRS means.
 */
export function annuityFactor(age: number, ratePercent: number): number {
  const startAge = Math.max(0, Math.min(MAX_TABLE_AGE, Math.floor(age)));
  const discount = 1 / (1 + ratePercent / 100);
  let survival = 1;
  let factor = 1; // the t = 0 payment, made at the start (annuity-due)
  for (let t = 1; t <= MAX_TABLE_AGE - startAge + 1; t++) {
    survival *= 1 - MORTALITY_RATES[startAge + t - 1]!;
    factor += survival * Math.pow(discount, t);
  }
  return factor;
}
