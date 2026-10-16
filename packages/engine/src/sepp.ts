/**
 * SEPP — Substantially Equal Periodic Payments (IRC §72(t)(2)(A)(iv), and its
 * §72(q)(2)(D) mirror for a nonqualified annuity).
 *
 * The one way to tap a tax-deferred account — or a nonqualified annuity —
 * before 59½ without the 10% early-distribution tax: commit to a payment
 * schedule and keep taking exactly what it says every year until the LATER
 * of five years from the first payment, or reaching the age this module
 * treats as 59½ (see the note on `MANDATORY_AGE` below). Break the schedule
 * early — skip a year, take more, take less — and the IRS retroactively
 * assesses the penalty on every payment already taken, plus interest. That
 * asymmetry is the whole reason this is its own module and its own tab
 * rather than a knob on the ordinary withdrawal waterfall: a plan-wide
 * shortfall waterfall pulls whatever a year happens to need, and a SEPP
 * payment is not allowed to work that way.
 *
 * IRS Notice 2022-6 §3.01 sanctions exactly three ways to size the payment,
 * and this module implements all three (`SeppMethod`):
 *
 *   - **Fixed Amortization** (`'amortization'`, the default, and the ONLY
 *     method this module supported before this file grew the other two):
 *     the balance amortizes like a loan running the other way — level
 *     annual payments over a term equal to the life-expectancy factor, at an
 *     assumed interest rate. This is what "you take out the same amount
 *     until you reach 60" (the plain-English version of the rule) actually
 *     describes, and it is fixed once at the start: the same payment every
 *     year regardless of what the balance does later.
 *   - **Fixed Annuitization** (`'annuitization'`): also fixed once at the
 *     start, but the divisor is an INSURANCE-STYLE annuity factor — the
 *     present value of $1/year for life, computed from `MORTALITY_RATES` and
 *     the assumed rate — rather than a life-expectancy table. See
 *     `annuityFactor` below.
 *   - **Required Minimum Distribution** (`'rmd'`): the ONE method that is
 *     NOT fixed — `payment = balance / lifeExpectancyFactor(age)`,
 *     redetermined every single year from that year's own balance and that
 *     year's own age. Notice 2022-6 §3.01(a) is explicit that this annual
 *     redetermination is not itself a forbidden "modification" — it is how
 *     the method is defined. It is also the smallest of the three for a
 *     given starting balance, and the only one that falls if the account's
 *     value falls.
 *
 * IMPORTANT — this is a modelling approximation, not tax advice:
 *   - `SINGLE_LIFE_EXPECTANCY_TABLE` reproduces the IRS Single Life
 *     Expectancy Table (Table I) that has applied since 2022, and
 *     `MORTALITY_RATES` reproduces Treas. Reg. §1.401(a)(9)-9(e)'s mortality
 *     table — both now read from `seppTables.ts`, transcribed from the primary
 *     sources and cross-checked against each other (ported from Northstar
 *     v2, which found this file's earlier copy off by 0.1 at ages 41, 43,
 *     47 and 49). Still verify against the current Publication 590-B
 *     before relying on a real SEPP election.
 *   - **Decision taken:** the RMD method here reads its divisor from the
 *     SAME `SINGLE_LIFE_EXPECTANCY_TABLE` / `lifeExpectancyFactor` the
 *     amortization method already used, rather than adding a second table
 *     (the IRS Uniform Lifetime Table `rmd.ts` already has, for FORCED
 *     post-73 distributions) plus a table-choice parameter. Notice 2022-6
 *     §3.02(a) explicitly permits EITHER table for the RMD method, so this
 *     is a legitimate choice, not a shortcut that gets the law wrong — and
 *     it keeps this module's dependency surface exactly what it was before
 *     this change. A future caller who specifically wants the Uniform
 *     Lifetime variant can already reach `rmd.ts`'s `uniformLifetimeDivisor`
 *     without this function's signature needing to change.
 *   - The assumed interest rate (`amortization`/`annuitization` only — the
 *     `rmd` method takes no rate at all) is capped by the IRS at the GREATER
 *     of 5% or 120% of the federal mid-term rate for either of the two
 *     months before the first payment — a number that changes monthly and
 *     is published at irs.gov/apr. This module cannot know that number;
 *     `DEFAULT_SEPP_RATE_PERCENT` is only a placeholder starting point, not
 *     a rate to actually use.
 *   - The plan only tracks birth YEAR, not a birthday, so "59½" is treated as
 *     age 60 by calendar year — the same whole-year convention the rest of
 *     the app uses for every other age-gated rule.
 *   - **Not modeled**: the Joint and Last Survivor Table (a second table
 *     indexed by two lives), which can only ever produce a LONGER
 *     distribution period — and therefore a SMALLER payment — than the
 *     Single Life Table used here. Omitting it cannot make this module
 *     overstate what the IRS allows, only decline to show one way to make
 *     the payment even smaller, which nobody sizing a SEPP is looking for.
 */
import {
  MAX_TABLE_AGE,
  MORTALITY_RATES,
  SINGLE_LIFE_TABLE,
  annuityFactor as tableAnnuityFactor,
  singleLifeExpectancy,
} from './seppTables.js';
import type { Account, Plan, PlanResult, SeppElection } from './types.js';

/**
 * IRS Single Life Expectancy Table (Table I), effective for distribution
 * years 2022 and later (Treas. Reg. §1.401(a)(9)-9, as updated). Keyed by the
 * age attained in the distribution year — the "IRS rules on age definition"
 * this module's age comes from.
 */
export const SINGLE_LIFE_EXPECTANCY_TABLE: Readonly<Record<number, number>> = SINGLE_LIFE_TABLE;

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

/**
 * The three ways Notice 2022-6 §3.01 permits sizing a SEPP payment — see the
 * module doc for what each one means and where its divisor comes from.
 * `'amortization'` is the default, and the only method this module supported
 * before it grew the other two, so every existing caller that never passes
 * `method` keeps getting exactly what it always got.
 */
export type SeppMethod = 'amortization' | 'annuitization' | 'rmd';

/** Nearest tabulated factor, clamped to the table's ends rather than extrapolated. */
export function lifeExpectancyFactor(age: number): number {
  return singleLifeExpectancy(Math.round(age));
}

/**
 * Table 4 to Treas. Reg. §1.401(a)(9)-9(e) — the probability of death at
 * each age — as published in T.D. 9930 (85 FR 72427, 2020-11-12). Notice
 * 2022-6 §3.01(c) names this exact table as the one the fixed annuitization
 * method's annuity factor must be derived from. This is a DIFFERENT table
 * from `SINGLE_LIFE_EXPECTANCY_TABLE` above (a curtate life EXPECTANCY, one
 * number per age) — this one is a per-age mortality PROBABILITY, the input
 * `annuityFactor` below survival-weights and discounts year by year to
 * build a full annuity factor. Ages 115–120 are all 0.4 in the published
 * table.
 */
export { MORTALITY_RATES };

/** The oldest age `MORTALITY_RATES` is defined for. */
export const MAX_MORTALITY_AGE = MAX_TABLE_AGE;

/**
 * Fixed Annuitization Method's divisor: the present value, at `ratePercent`,
 * of $1 per year payable for the rest of a life aged `age`, using
 * `MORTALITY_RATES`.
 *
 * Computed as a life annuity-DUE — the t = 0 payment is worth a full $1 —
 * because Notice 2022-6 §3.01(c) describes the annuity as "beginning at the
 * employee's age", i.e. the first payment happens immediately rather than a
 * year later. Sanity check on that reading: at age 50 and 4% this returns
 * ≈19.16, within half a percent of the 19.087 factor the IRS's own worked
 * example uses for a 50-year-old at irs.gov/retirement-plans/substantially-
 * equal-periodic-payments — the small residual gap is explained by that
 * example predating Notice 2022-6's current mortality table. The
 * annuity-immediate reading would land a full 1.0 away from that figure, so
 * annuity-due is the correct one.
 *
 * Age and rate are clamped/floored the same defensive way the rest of this
 * module treats its inputs: `age` floors to a whole year and clamps to
 * `MAX_MORTALITY_AGE` rather than extrapolating past the table.
 */
export function annuityFactor(age: number, ratePercent: number): number {
  return tableAnnuityFactor(age, ratePercent);
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

export interface SeppMethodPayment {
  method: SeppMethod;
  /** The life-expectancy factor (amortization/rmd) or annuity factor
   * (annuitization) that produced `annualPayment` — the one number the UI
   * needs to show its work. */
  factor: number;
  annualPayment: number;
}

/**
 * One method's payment for a single year, given THAT year's balance and age.
 * `planSepp` below calls this once (at the start year) for the two FIXED
 * methods, whose payment then never changes, and once PER YEAR for the RMD
 * method, which redetermines it every time — the one structural difference
 * between "fixed" and "RMD" the module doc describes. Exported on its own so
 * each method's arithmetic is independently testable without running a whole
 * multi-year schedule.
 */
export function seppMethodPayment(
  balance: number,
  age: number,
  method: SeppMethod,
  ratePercent: number,
): SeppMethodPayment {
  switch (method) {
    case 'rmd': {
      const factor = lifeExpectancyFactor(age);
      return { method, factor, annualPayment: balance <= 0 ? 0 : balance / factor };
    }
    case 'annuitization': {
      const factor = annuityFactor(age, ratePercent);
      return { method, factor, annualPayment: balance <= 0 ? 0 : balance / factor };
    }
    case 'amortization':
    default: {
      const factor = lifeExpectancyFactor(age);
      return { method, factor, annualPayment: amortizedSeppPayment(balance, ratePercent, factor) };
    }
  }
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
  /**
   * The factor `annualPayment` was computed from in the start year: a life
   * expectancy factor for `'amortization'`/`'rmd'`, an insurance-style
   * annuity factor (`annuityFactor`) for `'annuitization'`. Named for the
   * amortization method this field predates — kept rather than renamed so
   * every existing caller (including the SEPP tool's own view) keeps
   * compiling and reading exactly the number it always has.
   */
  lifeExpectancyFactor: number;
  /** The start-year payment: fixed for `'amortization'`/`'annuitization'`,
   * or simply the first year's number for `'rmd'`, which recomputes every
   * year afterward (see `years`). */
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
  /** One of the three IRS-sanctioned methods (see the module doc). Defaults
   * to `'amortization'` — every call site written before this parameter
   * existed keeps getting exactly the schedule it always got. */
  method?: SeppMethod;
}): SeppPlan {
  const method = params.method ?? 'amortization';
  const startAge = params.startYear - params.birthYear;
  // The two FIXED methods lock their payment in from the start-year balance
  // and never recompute it; only `seppMethodPayment`'s `'rmd'` branch inside
  // the loop below ever runs again after this.
  const first = seppMethodPayment(params.startingBalance, startAge, method, params.seppRatePercent);
  const fixedPayment = method === 'rmd' ? undefined : first.annualPayment;
  const endYear = mandatoryEndYear(params.startYear, params.birthYear);

  const years: SeppYear[] = [];
  let balance = params.startingBalance;

  for (let year = params.startYear; year <= params.horizonYear; year++) {
    const open = balance;
    const age = year - params.birthYear;
    // Growth first, payment at year-end — the ordinary-annuity convention
    // the closed-form amortization formula above assumes. Paying first would
    // need the (1+r) annuity-DUE variant of that formula instead, or the
    // fixed payment would not actually amortize the account to zero over
    // exactly `factor` years the way it is meant to.
    const growth = open * (params.growthRatePercent / 100);
    const afterGrowth = open + growth;
    const active = year <= endYear;

    let payment: number;
    if (!active) {
      payment = 0;
    } else if (fixedPayment !== undefined) {
      payment = Math.min(fixedPayment, afterGrowth);
    } else {
      // RMD method: redetermined every year from THIS year's OPENING
      // balance (the same "prior year-end value" convention a real RMD
      // uses, not the grown-up `afterGrowth`) and THIS year's own age —
      // Notice 2022-6 §3.03(a) says the shortened final payment this
      // produces when the method runs an account down is not itself a
      // forbidden modification, so clamping to `afterGrowth` below is
      // correct behavior, not a silent breach of the schedule.
      const due = seppMethodPayment(open, age, method, params.seppRatePercent).annualPayment;
      payment = Math.min(due, afterGrowth);
    }

    const tax = payment * (params.incomeTaxRatePercent / 100);
    const close = afterGrowth - payment;

    years.push({ year, age, open, growth, payment, tax, close, active });
    balance = close;
  }

  return {
    startYear: params.startYear,
    startAge,
    lifeExpectancyFactor: first.factor,
    annualPayment: fixedPayment ?? (years[0]?.payment ?? 0),
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
  /** Defaults to `'amortization'`, same as `planSepp` — see its doc. */
  method?: SeppMethod;
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
        method: params.method,
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

// ---------------------------------------------------------------------------
// A SEPP inside the plan (Account.seppElection, run.ts step 7.6)
// ---------------------------------------------------------------------------

/** `plan` with `accountId`'s SEPP set — or removed, with `undefined`. */
export function withSeppElection(plan: Plan, accountId: string, election: SeppElection | undefined): Plan {
  return {
    ...plan,
    accounts: plan.accounts.map((a) => {
      if (a.id !== accountId) return a;
      const next = { ...a };
      if (election) next.seppElection = election;
      else delete next.seppElection;
      return next;
    }),
  };
}

/** Whose age a SEPP on `account` runs on: its owner, else the oldest adult — the same rule `runPlan` uses. */
export function seppOwnerBirthYear(plan: Plan, account: Account): number | undefined {
  const adults = plan.participants.filter((p) => p.isIncluded && p.role !== 'child');
  const owner = account.ownerParticipantId ? adults.find((p) => p.id === account.ownerParticipantId) : undefined;
  if (owner) return owner.birthYear;
  return adults.length ? Math.min(...adults.map((p) => p.birthYear)) : undefined;
}

export interface SeppStartOption {
  startYear: number;
  age: number;
  /** The balance the payment is sized from: the account at the start of `startYear`, with no SEPP. */
  balance: number;
  annualPayment: number;
  lockedUntil: number;
}

/**
 * "How much is the SEPP I could begin taking in that year?" — for each
 * candidate start year, the payment the method allows on the balance the
 * account would have by then (read from a run of the plan without any SEPP
 * on it, so contract fees and every other flow are already in it).
 */
export function seppStartOptions(
  plan: Plan,
  withoutSepp: PlanResult,
  accountId: string,
  years: number[],
  method: SeppMethod,
  ratePercent: number,
): SeppStartOption[] {
  const account = plan.accounts.find((a) => a.id === accountId);
  const birthYear = account ? seppOwnerBirthYear(plan, account) : undefined;
  if (!account || birthYear === undefined) return [];
  return years.flatMap((startYear) => {
    const before = withoutSepp.years.find((y) => y.year === startYear - 1)?.accounts.find((a) => a.accountId === accountId);
    const balance = before ? before.close : startYear <= withoutSepp.startYear ? account.initialBalance : 0;
    if (balance <= 0) return [];
    const age = startYear - birthYear;
    return [
      {
        startYear,
        age,
        balance,
        annualPayment: seppMethodPayment(balance, age, method, ratePercent).annualPayment,
        lockedUntil: mandatoryEndYear(startYear, birthYear),
      },
    ];
  });
}

export interface SeppYearRow {
  year: number;
  age?: number;
  open: number;
  /** Growth net of contract fees. */
  growth: number;
  fees: number;
  payment: number;
  /** The part of `payment` that is gain (taxable); the rest is basis coming back tax-free. */
  taxable: number;
  tax: number;
  close: number;
  basisLeft?: number;
  locked: boolean;
}

/** The account year by year as `runPlan` ran it — the Annuity page's table. */
export function seppYearRows(plan: Plan, result: PlanResult, accountId: string): SeppYearRow[] {
  const account = plan.accounts.find((a) => a.id === accountId);
  const birthYear = account ? seppOwnerBirthYear(plan, account) : undefined;
  const e = account?.seppElection;
  let prevBasis = account?.nonTaxableBase;
  return result.years.flatMap((y) => {
    const row = y.accounts.find((a) => a.accountId === accountId);
    if (!row) return [];
    const payment = y.income.filter((l) => l.accountId === accountId && l.category === 'sepp').reduce((s, l) => s + l.amount, 0);
    const tax = y.taxes.filter((l) => l.accountId === accountId && l.label.startsWith('SEPP tax')).reduce((s, l) => s + l.amount, 0);
    const basisLeft = row.nonTaxableBaseRemaining;
    const basisUsed = prevBasis !== undefined && basisLeft !== undefined ? Math.max(0, prevBasis - basisLeft) : 0;
    prevBasis = basisLeft ?? prevBasis;
    return [
      {
        year: y.year,
        age: birthYear !== undefined ? y.year - birthYear : undefined,
        open: row.open,
        growth: row.growth,
        fees: row.annuityFeesDeducted ?? 0,
        payment,
        taxable: Math.max(0, payment - basisUsed),
        tax,
        close: row.close,
        basisLeft,
        locked: !!e && birthYear !== undefined && y.year >= e.startYear && y.year <= mandatoryEndYear(e.startYear, birthYear),
      },
    ];
  });
}
