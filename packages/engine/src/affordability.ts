/**
 * When can we buy a home, and how much can we spend? (docs/REDESIGN-V4.md
 * §4.6.)
 *
 * Not a lender's rule of thumb run beside the plan. Each candidate (a year, a
 * price) IS the plan with that purchase in it, run through the same engine,
 * so the down payment drains the same accounts, rent ends where the budget
 * says it ends, and the kids' costs in that year are already counted. A
 * price "fits" a zone when the purchase year's plan passes every one of the
 * zone's rules; the most that fits is found by bisection, since every rule
 * only gets harder as the price rises.
 *
 * All money here is NOMINAL (the purchase year's own dollars) — presentation
 * deflates.
 */
import { buyAHomeConfig, type BuyAHomeConfig } from './events/buyAHome.js';
import { withHorizon } from './horizon.js';
import { runPlan } from './run.js';
import type { Plan, PlanEvent, PlanResult, YearSnapshot } from './types.js';

export const HYPOTHETICAL_HOME_ID = 'affordability-home';

export interface AffordabilityZone {
  id: 'comfortable' | 'stretch';
  /** Housing cost as a share of after-tax income, at most (percent). */
  maxHousingShare: number;
  /** Savings rate the first full year after buying, at least (percent). */
  minSavingsRate: number;
  /** Cash and taxable investments left after closing, in months of spending. */
  minReserveMonths: number;
}

/** docs/REDESIGN-V4.md §8 decision 2. */
export const DEFAULT_ZONES: AffordabilityZone[] = [
  { id: 'comfortable', maxHousingShare: 25, minSavingsRate: 15, minReserveMonths: 6 },
  { id: 'stretch', maxHousingShare: 35, minSavingsRate: 5, minReserveMonths: 3 },
];

/** Years after the purchase the plan must still pay every bill. */
export const CARRY_YEARS = 10;

export interface HomeReading {
  year: number;
  price: number;
  /** Down payment + closing costs. */
  cashAtClosing: number;
  /** Mortgage + property tax + insurance + upkeep + HOA, per month, first full year. */
  housingMonthly: number;
  afterTaxMonthly: number;
  /** `housingMonthly` ÷ `afterTaxMonthly`, percent. */
  housingShare: number;
  /** First full year: (after-tax − recurring spending) ÷ after-tax, percent. */
  savingsRate: number;
  /** Cash + taxable investments at the end of the purchase year. */
  liquidAfterClosing: number;
  /** `liquidAfterClosing` in months of the first full year's recurring spending. */
  reserveMonths: number;
  /** First year in [purchase, purchase + CARRY_YEARS] the plan can't pay its bills. */
  shortfallYear?: number;
}

/** The home a plan has — the earliest included purchase — or undefined. */
export function primaryHome(plan: Plan): PlanEvent | undefined {
  return plan.events
    .filter((e) => e.kind === 'buyAHome' && e.isIncluded)
    .sort((a, b) => a.startYear - b.startYear)[0];
}

/**
 * `plan` with its home bought in `year` for `price`. Moves the plan's own
 * home event when it has one — keeping its financing, and keeping every
 * anchor to it (rent "until Buy a home") pointing at the moved purchase —
 * and adds a hypothetical one, on default terms, when it doesn't.
 */
export function withHomePurchase(plan: Plan, year: number, price: number, terms: Partial<BuyAHomeConfig> = {}): Plan {
  const home = primaryHome(plan);
  if (home) {
    return {
      ...plan,
      events: plan.events.map((e) =>
        e.id === home.id ? { ...e, startYear: year, config: { ...(e.config as object), ...terms, price } } : e,
      ),
    };
  }
  const config = buyAHomeConfig.parse({ ...terms, price });
  return {
    ...plan,
    events: [
      ...plan.events,
      { id: HYPOTHETICAL_HOME_ID, kind: 'buyAHome', name: 'Buy a home', startYear: year, isIncluded: true, config },
    ],
  };
}

/** `plan` with no home purchase at all — the "keep renting" baseline. */
export function withoutHomePurchase(plan: Plan): Plan {
  return { ...plan, events: plan.events.filter((e) => e.kind !== 'buyAHome') };
}

/** What owning looks like in the purchase year and the first full year after it. */
export function readHome(plan: Plan, result: PlanResult): HomeReading | undefined {
  const home = primaryHome(plan);
  if (!home) return undefined;
  const config = buyAHomeConfig.parse(home.config ?? {});
  const year = home.startYear;
  const buyYear = result.years.find((y) => y.year === year);
  if (!buyYear) return undefined;
  const firstFull = result.years.find((y) => y.year === year + 1) ?? buyYear;

  const housing = sum(
    firstFull.expenses
      .filter(
        (e) =>
          !e.oneTime &&
          (e.accountId === `${home.id}:mortgage` || (e.sourceEventId === home.id && e.category === 'housing')),
      )
      .map((e) => e.amount),
  );
  const afterTax = firstFull.totalIncome - firstFull.totalTaxes;
  const spending = recurringSpending(firstFull);
  const liquid = sum(
    buyYear.accounts
      .filter((a) => !a.isLiability && (a.accountClass === 'cash' || a.accountClass === 'taxableInvestment'))
      .map((a) => a.close),
  );

  const months = 12;
  return {
    year,
    price: config.price,
    cashAtClosing: config.price * ((config.downPaymentPercent + config.closingCostPercent) / 100),
    housingMonthly: housing / months,
    afterTaxMonthly: afterTax / months,
    housingShare: afterTax > 0 ? (housing / afterTax) * 100 : Infinity,
    savingsRate: afterTax > 0 ? ((afterTax - spending) / afterTax) * 100 : -Infinity,
    liquidAfterClosing: liquid,
    reserveMonths: spending > 0 ? liquid / (spending / 12) : Infinity,
    shortfallYear: result.years.find(
      (y) => y.year >= year && y.year <= year + CARRY_YEARS && (y.unfundedShortfall ?? 0) > 1,
    )?.year,
  };
}

export function fitsZone(reading: HomeReading, zone: AffordabilityZone): boolean {
  return (
    reading.shortfallYear === undefined &&
    reading.housingShare <= zone.maxHousingShare &&
    reading.savingsRate >= zone.minSavingsRate &&
    reading.reserveMonths >= zone.minReserveMonths
  );
}

/** The plan only needs to run through the carry window to judge a purchase — much faster than a full lifetime. */
function forPurchase(plan: Plan, year: number, price: number, terms?: Partial<BuyAHomeConfig>): Plan {
  return withHorizon(withHomePurchase(plan, year, price, terms), { mode: 'year', year: year + CARRY_YEARS });
}

export function readCandidate(plan: Plan, year: number, price: number, terms?: Partial<BuyAHomeConfig>): HomeReading | undefined {
  const candidate = forPurchase(plan, year, price, terms);
  return readHome(candidate, runPlan(candidate));
}

/**
 * The most a home can cost, bought in `year`, while the plan passes every rule
 * of `zone` — 0 when even a very cheap one doesn't fit (the household can't
 * carry the bills that year regardless of price, or can't keep the reserve).
 * Bisection to `precision` dollars, between 0 and `ceiling`.
 */
export function maxAffordablePrice(
  plan: Plan,
  year: number,
  zone: AffordabilityZone,
  opts: { ceiling?: number; precision?: number; terms?: Partial<BuyAHomeConfig>; knownFits?: number } = {},
): number {
  const precision = opts.precision ?? 10_000;
  const fits = (price: number) => {
    const r = readCandidate(plan, year, price, opts.terms);
    return r !== undefined && fitsZone(r, zone);
  };
  // `knownFits`: a price already shown to pass (a stricter zone's answer),
  // so the search starts there instead of at zero.
  let lo = opts.knownFits ?? 0;
  let hi = opts.ceiling ?? 10_000_000;
  if (lo === 0 && !fits(precision)) return 0;
  if (fits(hi)) return hi;
  while (hi - lo > precision) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return Math.floor(lo / precision) * precision;
}

export interface AffordabilityPoint {
  year: number;
  /** Nominal, purchase-year dollars; 0 when nothing fits. */
  byZone: Record<AffordabilityZone['id'], number>;
}

/**
 * The affordability map's data: for each candidate year, the most each zone
 * allows. Zones go strictest first, and each looser zone's search starts at
 * the stricter one's answer — anything comfortable is also a stretch.
 */
export function affordabilityCurve(
  plan: Plan,
  years: number[],
  zones: AffordabilityZone[] = DEFAULT_ZONES,
  opts: { ceiling?: number; precision?: number; terms?: Partial<BuyAHomeConfig> } = {},
): AffordabilityPoint[] {
  return years.map((year) => {
    const byZone = {} as AffordabilityPoint['byZone'];
    let knownFits = 0;
    for (const zone of zones) {
      byZone[zone.id] = maxAffordablePrice(plan, year, zone, { ...opts, knownFits });
      knownFits = byZone[zone.id];
    }
    return { year, byZone };
  });
}

/** Recurring spending in a year: every expense that isn't a contribution or a one-time lump. */
export function recurringSpending(y: YearSnapshot): number {
  return sum(y.expenses.filter((e) => e.category !== 'contribution' && !e.oneTime).map((e) => e.amount));
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
