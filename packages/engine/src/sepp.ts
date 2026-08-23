/**
 * SEPP — Substantially Equal Periodic Payments (IRC §72(t)(2)(A)(iv)).
 *
 * The one way to tap a tax-deferred account before 59½ without the 10% early
 * withdrawal penalty: commit to a fixed annual payment and keep taking
 * exactly that amount every year until the LATER of five years from the
 * first payment, or reaching the age this module treats as 59½ (see the note
 * on `MANDATORY_AGE` below). Break the schedule early — skip a year, take
 * more, take less — and the IRS retroactively assesses the penalty on every
 * payment already taken, plus interest. That asymmetry is the whole reason
 * this is its own module and its own tab rather than a knob on the ordinary
 * withdrawal waterfall: a plan-wide shortfall waterfall pulls whatever a year
 * happens to need, and a SEPP payment is not allowed to work that way.
 *
 * This models exactly one of the three IRS-approved methods — **Fixed
 * Amortization** — because it is the one the size of the payment actually
 * comes from a formula (life expectancy × an assumed interest rate) rather
 * than a fresh RMD-style recalculation every year, which is what "you take
 * out the same amount until you reach 60" (the plain-English version of the
 * rule) actually describes. The RMD method (payment recalculated annually)
 * and the Annuitization method (an insurer's mortality table) are not
 * modelled here.
 *
 * IMPORTANT — this is a modelling approximation, not tax advice:
 *   - `SINGLE_LIFE_EXPECTANCY_TABLE` reproduces the IRS Single Life
 *     Expectancy Table (Table I) that has applied since 2022, from training
 *     data rather than a live fetch of Publication 590-B. Verify the current
 *     table before relying on a real SEPP election.
 *   - The assumed interest rate is capped by the IRS at 120% of the federal
 *     mid-term rate for either of the two months before the first payment —
 *     a number that changes monthly and is published at irs.gov/apr. This
 *     module cannot know that number; `DEFAULT_SEPP_RATE_PERCENT` is only a
 *     placeholder starting point, not a rate to actually use.
 *   - The plan only tracks birth YEAR, not a birthday, so "59½" is treated as
 *     age 60 by calendar year — the same whole-year convention the rest of
 *     the app uses for every other age-gated rule.
 */

/**
 * IRS Single Life Expectancy Table (Table I), effective for distribution
 * years 2022 and later (Treas. Reg. §1.401(a)(9)-9, as updated). Keyed by the
 * age attained in the distribution year — the "IRS rules on age definition"
 * this module's age comes from.
 */
export const SINGLE_LIFE_EXPECTANCY_TABLE: Record<number, number> = {
  20: 65.0,
  21: 64.1,
  22: 63.1,
  23: 62.1,
  24: 61.1,
  25: 60.2,
  26: 59.2,
  27: 58.2,
  28: 57.3,
  29: 56.3,
  30: 55.3,
  31: 54.4,
  32: 53.4,
  33: 52.5,
  34: 51.5,
  35: 50.5,
  36: 49.6,
  37: 48.6,
  38: 47.7,
  39: 46.7,
  40: 45.7,
  41: 44.7,
  42: 43.8,
  43: 42.8,
  44: 41.9,
  45: 41.0,
  46: 40.0,
  47: 39.1,
  48: 38.1,
  49: 37.2,
  50: 36.2,
  51: 35.3,
  52: 34.3,
  53: 33.4,
  54: 32.5,
  55: 31.6,
  56: 30.6,
  57: 29.8,
  58: 28.9,
  59: 28.0,
  60: 27.1,
  61: 26.2,
  62: 25.4,
  63: 24.5,
  64: 23.7,
  65: 22.9,
  66: 22.0,
  67: 21.2,
  68: 20.4,
  69: 19.6,
  70: 18.8,
};

/**
 * Only a starting point — see the module doc. Roughly in line with 120% of
 * the federal mid-term rate across recent years, but that number is
 * published monthly and this one is not: the user must confirm the real
 * figure before relying on it.
 */
export const DEFAULT_SEPP_RATE_PERCENT = 5;

/** The whole-year proxy this module uses for "59½" — see the module doc. */
export const MANDATORY_AGE = 60;

/** Minimum number of payments SEPP requires, regardless of starting age. */
export const MINIMUM_YEARS = 5;

/** Nearest tabulated factor, clamped to the table's ends rather than extrapolated. */
export function lifeExpectancyFactor(age: number): number {
  const ages = Object.keys(SINGLE_LIFE_EXPECTANCY_TABLE).map(Number);
  const min = Math.min(...ages);
  const max = Math.max(...ages);
  const clamped = Math.round(Math.max(min, Math.min(max, age)));
  return SINGLE_LIFE_EXPECTANCY_TABLE[clamped];
}

/**
 * Fixed Amortization Method: the account amortizes like a loan running the
 * other way — level annual payments over a term equal to the life-expectancy
 * factor, at the assumed rate. `payment = balance × r / (1 − (1+r)^−n)`.
 */
export function amortizedSeppPayment(
  balance: number,
  ratePercent: number,
  years: number,
): number {
  if (balance <= 0 || years <= 0) return 0;
  const r = ratePercent / 100;
  if (r === 0) return balance / years;
  return (balance * r) / (1 - Math.pow(1 + r, -years));
}

/** The last year a just-started SEPP schedule is still mandatory. */
export function mandatoryEndYear(startYear: number, birthYear: number): number {
  return Math.max(startYear + MINIMUM_YEARS - 1, birthYear + MANDATORY_AGE);
}

export interface SeppYear {
  year: number;
  age: number;
  open: number;
  growth: number;
  /** The fixed payment while the schedule is active; 0 once it ends. */
  payment: number;
  /** Ordinary income tax only — a SEPP-compliant payment owes no penalty. */
  tax: number;
  close: number;
  /** Whether this year's payment was still mandatory under the schedule. */
  active: boolean;
}

export interface SeppPlan {
  startYear: number;
  startAge: number;
  lifeExpectancyFactor: number;
  annualPayment: number;
  mandatoryEndYear: number;
  years: SeppYear[];
}

export function planSepp(params: {
  startingBalance: number;
  birthYear: number;
  startYear: number;
  growthRatePercent: number;
  seppRatePercent: number;
  incomeTaxRatePercent: number;
  horizonYear: number;
}): SeppPlan {
  const startAge = params.startYear - params.birthYear;
  const factor = lifeExpectancyFactor(startAge);
  const annualPayment = amortizedSeppPayment(params.startingBalance, params.seppRatePercent, factor);
  const endYear = mandatoryEndYear(params.startYear, params.birthYear);

  const years: SeppYear[] = [];
  let balance = params.startingBalance;

  for (let year = params.startYear; year <= params.horizonYear; year++) {
    const open = balance;
    // Growth first, payment at year-end — the ordinary-annuity convention
    // the closed-form amortization formula above assumes. Paying first would
    // need the (1+r) annuity-DUE variant of that formula instead, or the
    // fixed payment would not actually amortize the account to zero over
    // exactly `factor` years the way it is meant to.
    const growth = open * (params.growthRatePercent / 100);
    const afterGrowth = open + growth;
    const active = year <= endYear;
    const payment = active ? Math.min(annualPayment, afterGrowth) : 0;
    const tax = payment * (params.incomeTaxRatePercent / 100);
    const close = afterGrowth - payment;

    years.push({ year, age: year - params.birthYear, open, growth, payment, tax, close, active });
    balance = close;
  }

  return {
    startYear: params.startYear,
    startAge,
    lifeExpectancyFactor: factor,
    annualPayment,
    mandatoryEndYear: endYear,
    years,
  };
}

export interface SeppScenario {
  startYear: number;
  startAge: number;
  annualPayment: number;
  mandatoryEndYear: number;
  /** Sum of payments actually taken through `referenceYear`. */
  totalReceivedByReference: number;
  /** Account balance at `referenceYear`, after any payments taken. */
  balanceAtReference: number;
}

/**
 * Runs `planSepp` for a range of candidate start years, growing today's
 * balance forward to each one first — the tradeoff the timing of a SEPP
 * election turns on: starting later means a bigger balance and a bigger
 * factor-driven payment, but a shorter runway before ordinary, unrestricted
 * withdrawals are available anyway (docs/PLAN.md §4.5b).
 */
export function seppStartAgeSweep(params: {
  currentBalance: number;
  asOfYear: number;
  birthYear: number;
  candidateStartYears: number[];
  growthRatePercent: number;
  seppRatePercent: number;
  referenceYear: number;
}): SeppScenario[] {
  return params.candidateStartYears
    .filter((startYear) => startYear >= params.asOfYear && startYear <= params.referenceYear)
    .map((startYear) => {
      const yearsOfGrowth = startYear - params.asOfYear;
      const startingBalance =
        params.currentBalance * Math.pow(1 + params.growthRatePercent / 100, yearsOfGrowth);

      const result = planSepp({
        startingBalance,
        birthYear: params.birthYear,
        startYear,
        growthRatePercent: params.growthRatePercent,
        seppRatePercent: params.seppRatePercent,
        incomeTaxRatePercent: 0,
        horizonYear: params.referenceYear,
      });

      const last = result.years[result.years.length - 1];
      return {
        startYear,
        startAge: result.startAge,
        annualPayment: result.annualPayment,
        mandatoryEndYear: result.mandatoryEndYear,
        totalReceivedByReference: result.years.reduce((sum, y) => sum + y.payment, 0),
        balanceAtReference: last ? last.close : startingBalance,
      };
    });
}
