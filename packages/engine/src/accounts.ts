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
 */
export function amortizeYear(
  openingBalance: number,
  annualRatePercent: number,
  annualPayment: number,
): YearAmortization {
  let balance = openingBalance;
  if (balance <= 0) return { interest: 0, principal: 0, payment: 0, closing: 0 };

  const monthlyRate = annualRatePercent / 100 / 12;
  const scheduled = annualPayment / 12;

  let interestPaid = 0;
  let principalPaid = 0;
  let paid = 0;

  for (let m = 0; m < 12 && balance > 0; m++) {
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

/** Annual debt service for an account, defaulting to a full amortization. */
export function scheduledAnnualPayment(account: Account, openingBalance: number): number {
  if (account.plannedPayment && account.plannedPayment > 0) return account.plannedPayment;
  if (account.termYears && account.termYears > 0) {
    return monthlyPayment(openingBalance, account.interestRate ?? 0, account.termYears) * 12;
  }
  if (account.minimumPayment && account.minimumPayment > 0) return account.minimumPayment;
  return 0;
}
