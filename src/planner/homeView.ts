/**
 * The Home page's readings (docs/REDESIGN-V4.md §4.6), on top of the
 * engine's affordability solver: which zone a purchase lands in, what owning
 * costs each month next to the rent it replaces, the house-poor scorecard,
 * and the price ladder. Pure; the page only draws.
 */
import type { BuyAHomeConfig, HomeReading, Plan, PlanResult } from '@northstar/engine';
import {
  DEFAULT_ZONES,
  buyAHomeConfig,
  primaryHome,
  readHome,
  runPlan,
  withHomePurchase,
  withoutHomePurchase,
} from '@northstar/engine';
import { impactMetrics, presentResult, type ImpactMetrics } from './impact';

export type Zone = 'comfortable' | 'stretch' | 'housePoor';

export const ZONE_LABEL: Record<Zone, string> = {
  comfortable: 'Comfortable',
  stretch: 'A stretch',
  housePoor: 'House-poor',
};

export function zoneOf(reading: HomeReading): Zone {
  const [comfortable, stretch] = DEFAULT_ZONES;
  const passes = (z: typeof comfortable) =>
    reading.shortfallYear === undefined &&
    reading.housingShare <= z.maxHousingShare &&
    reading.savingsRate >= z.minSavingsRate &&
    reading.reserveMonths >= z.minReserveMonths;
  return passes(comfortable) ? 'comfortable' : passes(stretch) ? 'stretch' : 'housePoor';
}

/** Nominal dollars in `year` → the units the user reads. Same flow factor `deflate` uses. */
export function toDisplay(plan: Pick<Plan, 'settings'>, nominal: number, year: number): number {
  if (plan.settings.dollarMode !== 'todaysDollars') return nominal;
  return nominal / Math.pow(1 + plan.settings.inflationRate / 100, year - plan.settings.startYear);
}

export function fromDisplay(plan: Pick<Plan, 'settings'>, shown: number, year: number): number {
  if (plan.settings.dollarMode !== 'todaysDollars') return shown;
  return shown * Math.pow(1 + plan.settings.inflationRate / 100, year - plan.settings.startYear);
}

export interface HomeTerms {
  year: number;
  /** Nominal, purchase-year dollars. */
  price: number;
  terms: Pick<BuyAHomeConfig, 'downPaymentPercent' | 'mortgageRate' | 'termYears'>;
}

/** The plan's own purchase, or a sensible first guess when it has none. */
export function currentTerms(plan: Plan): HomeTerms {
  const home = primaryHome(plan);
  const config = buyAHomeConfig.parse(home?.config ?? { price: 750_000 });
  return {
    year: home?.startYear ?? plan.settings.startYear + 3,
    price: config.price,
    terms: { downPaymentPercent: config.downPaymentPercent, mortgageRate: config.mortgageRate, termYears: config.termYears },
  };
}

export function applyTerms(plan: Plan, t: HomeTerms): Plan {
  return withHomePurchase(plan, t.year, t.price, t.terms);
}

export interface OwnCost {
  /** Monthly, nominal, first full year — mortgage first, then each carrying cost. */
  parts: { label: string; monthly: number }[];
  total: number;
  /** What housing cost the year before the purchase (rent, from the budget), monthly, nominal. */
  rentBefore: number;
}

export function ownCost(plan: Plan, result: PlanResult): OwnCost | undefined {
  const home = primaryHome(plan);
  if (!home) return undefined;
  const first = result.years.find((y) => y.year === home.startYear + 1) ?? result.years.find((y) => y.year === home.startYear);
  const before = result.years.find((y) => y.year === home.startYear - 1);
  if (!first) return undefined;

  const parts: OwnCost['parts'] = [];
  const mortgage = first.expenses.find((e) => e.accountId === `${home.id}:mortgage`);
  if (mortgage) parts.push({ label: 'Mortgage', monthly: mortgage.amount / 12 });
  for (const e of first.expenses) {
    if (e.sourceEventId !== home.id || e.category !== 'housing' || e.oneTime) continue;
    const what = e.label.startsWith(`${home.name} — `) ? e.label.slice(home.name.length + 3) : e.label;
    parts.push({ label: what.charAt(0).toUpperCase() + what.slice(1), monthly: e.amount / 12 });
  }
  const rentBefore = before
    ? before.expenses.filter((e) => e.budgetLineId && e.category === 'housing' && !e.oneTime).reduce((s, e) => s + e.amount, 0) / 12
    : 0;
  return { parts, total: parts.reduce((s, p) => s + p.monthly, 0), rentBefore };
}

export interface LadderRow {
  key: string;
  label: string;
  reading: HomeReading;
  zone: Zone;
  impact: ImpactMetrics;
}

/**
 * The same purchase year at a few prices — "evaluate that decision" as a
 * table: each row is the whole plan run at that price.
 */
export function priceLadder(plan: Plan, t: HomeTerms, prices: { key: string; label: string; price: number }[]): LadderRow[] {
  return prices
    .filter((p) => p.price > 0)
    .map((p) => {
      const candidate = applyTerms(plan, { ...t, price: p.price });
      const nominal = runPlan(candidate);
      const reading = readHome(candidate, nominal)!;
      return {
        key: p.key,
        label: p.label,
        reading,
        zone: zoneOf(reading),
        impact: impactMetrics(candidate, presentResult(candidate, nominal), t.year + 1),
      };
    });
}

/**
 * Cash and taxable investments every year, with the purchase and without it
 * — the cushion the down payment takes out, and how long it takes to come
 * back.
 */
export function cashCushion(plan: Plan, withHome: PlanResult): { years: number[]; withHome: number[]; renting: number[] } {
  const renting = runPlan(withoutHomePurchase(plan));
  const liquid = (r: PlanResult) =>
    r.years.map((y) =>
      y.accounts.filter((a) => !a.isLiability && (a.accountClass === 'cash' || a.accountClass === 'taxableInvestment')).reduce((s, a) => s + a.close, 0),
    );
  return { years: withHome.years.map((y) => y.year), withHome: liquid(withHome), renting: liquid(renting) };
}

/** A price as people say one — to the nearest $5K — for prose and tables. Levers keep their own step. */
export function nicePrice(v: number): number {
  return Math.round(v / 5_000) * 5_000;
}
