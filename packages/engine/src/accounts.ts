import type { Account, RateAnchor } from './types.js';

/**
 * Rate in effect for a given year.
 *
 * A schedule is a sparse list of anchors. We STEP rather than interpolate:
 * "5% until 2030, then 3%" should mean exactly that. Interpolating would
 * invent precision the user never expressed.
 */
export function rateFromSchedule(schedule: RateAnchor[] | undefined, year: number): number {
  if (!schedule || schedule.length === 0) return 0;
  const sorted = [...schedule].sort((a, b) => a.year - b.year);
  let rate = sorted[0].rate;
  for (const anchor of sorted) {
    if (anchor.year <= year) rate = anchor.rate;
    else break;
  }
  return rate;
}

/**
 * The rate that actually applies over `fraction` of a year, COMPOUNDING
 * rather than prorating linearly (docs/PLAN.md §4.3, docs/MATH.md
 * "Partial-year growth compounds"). A full year (`fraction === 1`) reduces to
 * exactly `ratePercent / 100`, so this is safe to use unconditionally in
 * place of the old `rate * fraction` — it is not a special case for the
 * stub year, it is the general formula the stub year is also a case of.
 *
 * Worked check: 12%/yr with exactly a quarter of the year left credits
 * `1.12^0.25 - 1 ≈ 2.8737%`, not the linear `12% * 0.25 = 3%` a full year of
 * that return would proportionally suggest — compounding a partial period
 * earns slightly LESS than the linear share, because the linear share
 * secretly assumes the money re-invests its own fractional gains at the same
 * pace a full year would, which a shorter period cannot do.
 *
 * `ratePercent` at or below -100% would make `(1 + rate)` zero or negative,
 * and raising a negative base to a fractional power is `NaN` in JS — clamp
 * the base at 0 (a total, but finite, loss for the period) rather than let
 * one bad input poison a whole projection with `NaN`s.
 */
export function effectiveRateForFraction(ratePercent: number, fraction: number): number {
  const base = Math.max(0, 1 + ratePercent / 100);
  return Math.pow(base, fraction) - 1;
}

export function growthRateFor(account: Account, year: number): number {
  switch (account.growthRateMethod) {
    case 'noChange':
      return 0;
    case 'fixed':
      return account.growthRate;
    case 'schedule':
      return rateFromSchedule(account.growthRateSchedule, year);
    default:
      return 0;
  }
}

/** Whether the account exists yet in the given year. */
export function accountExistsIn(account: Account, year: number): boolean {
  return year >= (account.startYear ?? -Infinity);
}

/**
 * Level monthly payment that fully amortizes `principal` over `termYears`.
 *
 *   payment = P * r / (1 - (1 + r)^-n)
 */
export function monthlyPayment(principal: number, annualRatePercent: number, termYears: number): number {
  const n = Math.round(termYears * 12);
  if (n <= 0) return principal;
  const r = annualRatePercent / 100 / 12;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

export interface YearAmortization {
  interest: number;
  principal: number;
  payment: number;
  closing: number;
}

/**
 * One year of debt service, stepped MONTHLY and rolled up.
 *
 * Annual stepping would materially misstate interest on an amortizing loan --
 * this is the one place the extra precision earns its cost (docs/PLAN.md §4.1).
 * The final payment is trimmed so the balance lands exactly on zero.
 *
 * `monthsInYear` defaults to a full 12. The plan's current year can be
 * partial (docs/PLAN.md §4.3) — as of some date partway through it, only that
 * many months of interest and payments are still ahead of us.
 */
export function amortizeYear(
  openingBalance: number,
  annualRatePercent: number,
  annualPayment: number,
  monthsInYear = 12,
): YearAmortization {
  let balance = openingBalance;
  if (balance <= 0) return { interest: 0, principal: 0, payment: 0, closing: 0 };

  const monthlyRate = annualRatePercent / 100 / 12;
  const scheduled = annualPayment / 12;

  let interestPaid = 0;
  let principalPaid = 0;
  let paid = 0;

  for (let m = 0; m < monthsInYear && balance > 0; m++) {
    const interest = balance * monthlyRate;
    let principal = scheduled - interest;

    // Payment does not cover interest: the loan is negatively amortizing.
    // Accrue the shortfall rather than silently dropping it.
    if (principal < 0) {
      balance -= principal;
      interestPaid += interest;
      paid += scheduled;
      continue;
    }

    if (principal > balance) principal = balance;

    balance -= principal;
    interestPaid += interest;
    principalPaid += principal;
    paid += interest + principal;
  }

  return { interest: interestPaid, principal: principalPaid, payment: paid, closing: balance };
}

/**
 * Annual debt service for an account, defaulting to a full amortization.
 *
 * Defect fixed here (docs/MATH.md "Mortgage amortization"): the `termYears`
 * fallback used to amortize whichever balance the CALLER passed in — which
 * `run.ts` called with THAT YEAR's current balance, every year. A level-
 * payment loan's payment is fixed once at origination; re-deriving a fresh
 * `termYears`-long amortization off a shrinking balance every year makes the
 * payment shrink too, so the loan never actually retires on the stated
 * schedule (a 30-year loan run this way is still carrying a balance after
 * 30 years). `account.initialBalance` — the balance the account STARTS the
 * projection with, matching what `termYears` ("term remaining") is remaining
 * against — is what `monthlyPayment` must amortize, computed once and then
 * implicitly fixed for the life of the loan simply by never being
 * recomputed from a different balance again. This is exactly what
 * `buyAHome.ts` already does by hand (freezing `plannedPayment` at
 * issuance); this fallback now does the same for any OTHER loan/mortgage
 * account that sets `termYears` without setting `plannedPayment` itself.
 */
export function scheduledAnnualPayment(account: Account): number {
  if (account.plannedPayment && account.plannedPayment > 0) return account.plannedPayment;
  if (account.termYears && account.termYears > 0) {
    return monthlyPayment(account.initialBalance, account.interestRate ?? 0, account.termYears) * 12;
  }
  if (account.minimumPayment && account.minimumPayment > 0) return account.minimumPayment;
  return 0;
}
