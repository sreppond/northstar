/**
 * The Budget page's reading of one year (docs/REDESIGN-V4.md §4.2): what the
 * household brings home each month and where every dollar of it goes —
 * shared bills (fixed vs flexible), each adult, each child, and what's left
 * to save — read straight off the engine's result so the page and the
 * forecast can never disagree.
 *
 * Monthly figures divide by the months the year actually covers: the plan's
 * first year starts partway through, and dividing its prorated total by 12
 * would understate every line.
 */
import type { BudgetLine, LineItem, Participant, Plan, YearSnapshot } from '@northstar/engine';
import { yearFractionRemaining } from '@northstar/engine';
import type { DangerBand } from './charts/types';
import { incomeWithTax } from './incomeTax';

export type OwnerKey = 'shared' | string;

export interface BudgetRow {
  key: string;
  label: string;
  monthly: number;
  /** Fixed / non-discretionary. */
  essential: boolean;
  /** Present when a budget line produced it — the row is editable. */
  line?: BudgetLine;
  /** Present when an event produced it — the row opens that event. */
  sourceEventId?: string;
}

export interface BudgetSection {
  owner: OwnerKey;
  title: string;
  role: 'shared' | 'adult' | 'child';
  monthly: number;
  rows: BudgetRow[];
}

export interface BudgetBucket {
  key: string;
  label: string;
  monthly: number;
  color: string;
}

export interface BudgetView {
  year: number;
  /**
   * Income after tax, per month — the SAME number Cash Flow headlines
   * (`yearFlow().afterTax`): gross minus income tax. Tax paid on money drawn
   * from accounts is a cost of covering a gap, not a tax on income, so it is
   * `withdrawalTax` below, not subtracted here (V5-REVIEW-1 F3: it used to be,
   * which made a retirement year read as negative income).
   */
  afterTax: number;
  income: number;
  taxes: number;
  /** Tax paid on withdrawals, per month. Its own line, so a drawdown year is not a "short" one. */
  withdrawalTax: number;
  /** The engine's `unfundedShortfall`, per month; 0 unless the year is genuinely short. */
  unfunded: number;
  /**
   * The danger path, three separate states (V5-REVIEW-2 N1). Savings were
   * called "From savings" in a short year even though they paid nothing, so
   * the one negative remainder is now split by what actually happened to it:
   *  - `intoSavings`: money set aside on purpose (the contribution rows), per month;
   *  - `fromSavings`: a real drawdown, the part of the gap the accounts covered;
   *  - `unfundedMonthly`: the part nothing covered (the engine's shortfall).
   * `afterTax + fromSavings + unfundedMonthly = spending + intoSavings +
   * withdrawalTax` in any gap year with no lump sums (tested).
   */
  intoSavings: number;
  /** What the year's outgoings (spending, set-aside money, tax on withdrawals) exceed after-tax income by; 0 in a surplus year. */
  gap: number;
  unfundedMonthly: number;
  fromSavings: number;
  /** `unfundedMonthly >= 0.5`: the year is short (the engine could not fund it). */
  shortfall: boolean;
  sections: BudgetSection[];
  /** Money moved into accounts on purpose (401(k), 529, a home fund), per month. */
  contributions: BudgetRow[];
  /**
   * Lump sums this year (a down payment, arrival costs) — NOT per month and
   * not in `sections`; they come out of savings, not the monthly budget.
   */
  oneTime: { key: string; label: string; amount: number; sourceEventId?: string }[];
  /**
   * After-tax income minus withdrawal tax minus RECURRING spending, per month:
   * negative when savings are drawn down. Lump sums are in `oneTime`, so
   * Cash Flow's saved = this − `oneTime` ÷ months (tested, F3).
   */
  saved: number;
  /** `saved` ÷ `afterTax`, percent; undefined with nothing coming in. */
  savingsRate?: number;
  /** The 100% bar, left to right in the order money leaves the shared pool. */
  buckets: BudgetBucket[];
}

/** Owner hues — categorical data colours (docs/DESIGN-DIRECTION.md "colour is data"). */
// Never --mix-1 (Shared). More than two adults or children get a lighter tint
// of the same hues rather than a repeat of someone else's colour (V5-REVIEW-1
// F21). The pairs are the ones V5-REVIEW-2 N4 validated against U7's re-stepped
// tokens: adults mix-5/mix-4, children mix-3/mix-2.
const tint = (hue: string) => `color-mix(in srgb, ${hue} 55%, var(--surface))`;
const ADULT_COLORS = ['var(--mix-5)', 'var(--mix-4)', tint('var(--mix-5)'), tint('var(--mix-4)')];
const CHILD_COLORS = ['var(--mix-3)', 'var(--mix-2)', tint('var(--mix-3)'), tint('var(--mix-2)')];
export const SHARED_FIXED_COLOR = 'var(--mix-1)';
export const SHARED_FLEX_COLOR = 'color-mix(in srgb, var(--mix-1) 50%, var(--surface))';
export const SAVED_COLOR = 'var(--in)';
/** Drawn from savings is money out, not an error: the orange "out" hue, never the danger red. */
export const FROM_SAVINGS_COLOR = 'var(--out)';
/** Money nothing covered (V5-REVIEW-2 N1): the danger red, drawn hatched wherever it is a shape. */
export const UNFUNDED_COLOR = 'var(--danger)';
export const WITHDRAWAL_TAX_COLOR = 'var(--muted-light)';
/** One hue for the Kids envelope; each child keeps their own in `ownerColor`. */
export const KIDS_COLOR = CHILD_COLORS[0];

/** Lines an event produces that a household can't trim month to month. */
const ESSENTIAL_CATEGORIES = new Set(['housing', 'children', 'education', 'debt', 'childcare', 'health', 'insurance', 'utilities']);

export function ownerColor(plan: Pick<Plan, 'participants'>, owner: OwnerKey): string {
  if (owner === 'shared') return SHARED_FIXED_COLOR;
  const adults = plan.participants.filter((p) => p.role !== 'child');
  const children = plan.participants.filter((p) => p.role === 'child');
  const a = adults.findIndex((p) => p.id === owner);
  if (a >= 0) return ADULT_COLORS[a % ADULT_COLORS.length];
  const c = children.findIndex((p) => p.id === owner);
  return CHILD_COLORS[Math.max(0, c) % CHILD_COLORS.length];
}

export function monthsIn(plan: Pick<Plan, 'settings'>, year: number): number {
  return 12 * yearFractionRemaining(year, plan.settings.startYear, plan.settings.asOfDate);
}

export function budgetView(plan: Plan, snapshot: YearSnapshot): BudgetView {
  const months = monthsIn(plan, snapshot.year) || 12;
  const perMonth = (v: number) => v / months;
  const linesById = new Map((plan.budget ?? []).map((l) => [l.id, l]));
  const people = plan.participants.filter((p) => p.isIncluded);

  const sectionFor = new Map<OwnerKey, BudgetSection>();
  const section = (owner: OwnerKey): BudgetSection => {
    let s = sectionFor.get(owner);
    if (!s) {
      const person = people.find((p) => p.id === owner);
      s = {
        owner,
        title: person ? person.name : 'Shared',
        role: owner === 'shared' || !person ? 'shared' : person.role === 'child' ? 'child' : 'adult',
        monthly: 0,
        rows: [],
      };
      sectionFor.set(owner, s);
    }
    return s;
  };

  const contributions: BudgetRow[] = [];
  const oneTime: BudgetView['oneTime'] = [];
  snapshot.expenses.forEach((item, i) => {
    if (item.oneTime || item.category === 'annuityCharge') {
      oneTime.push({ key: `once:${i}`, label: item.label, amount: item.amount, sourceEventId: item.sourceEventId });
      return;
    }
    const row = toRow(item, i, linesById, perMonth);
    if (item.category === 'contribution') {
      contributions.push(row);
      return;
    }
    const owner = item.ownerId && people.some((p) => p.id === item.ownerId) ? item.ownerId : 'shared';
    const s = section(owner);
    s.rows.push(row);
    s.monthly += row.monthly;
  });

  // Shared first, then adults, then children — the order money leaves the pool.
  const order = (s: BudgetSection) => (s.role === 'shared' ? 0 : s.role === 'adult' ? 1 : 2);
  const sections = [...sectionFor.values()].sort(
    (a, b) => order(a) - order(b) || people.findIndex((p) => p.id === a.owner) - people.findIndex((p) => p.id === b.owner),
  );

  const tax = incomeWithTax(snapshot);
  const income = perMonth(snapshot.totalIncome);
  const taxes = perMonth(snapshot.totalTaxes);
  const withdrawalTax = perMonth(tax.withdrawalTax);
  // The same arithmetic as `yearFlow` (cashFlowView.ts), so the two pages
  // agree to the dollar: income tax comes off income, withdrawal tax does not.
  const afterTax = perMonth(tax.total.gross - (tax.total.tax - tax.withdrawalTax));
  const spending = sections.reduce((sum, s) => sum + s.monthly, 0);
  // The monthly picture: what's left after RECURRING spending and the tax on
  // withdrawals. A lump sum this year is shown separately (`oneTime`).
  const saved = afterTax - withdrawalTax - spending;

  // The danger path (V5-REVIEW-2 N1). `saved` above counts only spending, so a
  // year that still pays its contributions while short read as "from savings"
  // for money no account ever paid. Split the gap by what really happened.
  const intoSavings = contributions.reduce((sum, r) => sum + r.monthly, 0);
  const gap = Math.max(0, spending + intoSavings + withdrawalTax - afterTax);
  const unfundedMonthly = perMonth(snapshot.unfundedShortfall ?? 0);
  const fromSavings = Math.max(0, gap - unfundedMonthly);

  const shared = sectionFor.get('shared');
  const buckets: BudgetBucket[] = [];
  if (shared) {
    const fixed = shared.rows.filter((r) => r.essential).reduce((sum, r) => sum + r.monthly, 0);
    buckets.push({ key: 'shared-fixed', label: 'Shared · fixed', monthly: fixed, color: SHARED_FIXED_COLOR });
    buckets.push({ key: 'shared-flex', label: 'Shared · flexible', monthly: shared.monthly - fixed, color: SHARED_FLEX_COLOR });
  }
  for (const s of sections) {
    if (s.role === 'shared') continue;
    buckets.push({ key: `person:${s.owner}`, label: s.title, monthly: s.monthly, color: ownerColor(plan, s.owner) });
  }
  if (withdrawalTax >= 0.5) buckets.push({ key: 'wtax', label: 'Tax on withdrawals', monthly: withdrawalTax, color: WITHDRAWAL_TAX_COLOR });
  if (gap >= 0.5) {
    // A gap year: three separate buckets, never one "From savings" (V5-REVIEW-2 N1).
    buckets.push({ key: 'into-savings', label: 'Into savings', monthly: intoSavings, color: SAVED_COLOR });
    buckets.push({ key: 'from-savings', label: 'From savings', monthly: fromSavings, color: FROM_SAVINGS_COLOR });
    buckets.push({ key: 'unfunded', label: 'Unfunded', monthly: unfundedMonthly, color: UNFUNDED_COLOR });
  } else {
    buckets.push({ key: 'saved', label: 'Saved', monthly: saved, color: SAVED_COLOR });
  }

  return {
    year: snapshot.year,
    afterTax,
    income,
    taxes,
    withdrawalTax,
    unfunded: unfundedMonthly,
    intoSavings,
    gap,
    unfundedMonthly,
    fromSavings,
    shortfall: unfundedMonthly >= 0.5,
    sections,
    contributions,
    oneTime,
    saved,
    savingsRate: afterTax > 0 ? (saved / afterTax) * 100 : undefined,
    buckets: buckets.filter((b) => Math.abs(b.monthly) >= 0.5),
  };
}

function toRow(
  item: LineItem,
  index: number,
  linesById: Map<string, BudgetLine>,
  perMonth: (v: number) => number,
): BudgetRow {
  const line = item.budgetLineId ? linesById.get(item.budgetLineId) : undefined;
  return {
    key: item.budgetLineId ?? `${item.sourceEventId ?? item.accountId ?? 'plan'}:${item.label}:${index}`,
    label: item.label,
    monthly: perMonth(item.amount),
    essential: line ? line.essential : ESSENTIAL_CATEGORIES.has(item.category ?? ''),
    ...(line ? { line } : {}),
    ...(item.sourceEventId ? { sourceEventId: item.sourceEventId } : {}),
  };
}

/**
 * A danger band in a page's own unit (V5-REVIEW-1 F2/F10): `healthDangerBand`
 * returns the unfunded shortfall for the whole year, and a /mo view divides
 * it by the months THAT year covers (the first year is partial, so a flat 12
 * would understate it). Pass `divisor` as 1 for /yr.
 */
export function inUnit(band: DangerBand | undefined, divisor: (year: number) => number): DangerBand | undefined {
  if (!band) return band;
  const shortFor = band.shortFor;
  return { ...band, shortFor: shortFor && ((year) => { const v = shortFor(year); return v === undefined ? v : v / divisor(year); }) };
}

/**
 * A short read of where the household is in a given year — "Renting · Kid 1
 * (2)" — so a year number on the Budget page means something.
 */
export function lifeStage(plan: Plan, year: number): string {
  const home = plan.events.find((e) => e.kind === 'buyAHome' && e.isIncluded && e.startYear <= year);
  const retired = plan.events.find((e) => e.kind === 'retirement' && e.isIncluded && e.startYear <= year);
  const kids = plan.participants
    .filter((p: Participant) => p.role === 'child' && p.isIncluded && p.birthYear <= year)
    .map((p) => `${p.name} (${year - p.birthYear})`);
  const legacyKids = plan.events.filter((e) => e.kind === 'haveAKid' && e.isIncluded && e.startYear <= year).length;

  const parts = [retired ? 'Retired' : home ? 'Homeowners' : 'Renting'];
  if (kids.length > 0) parts.push(kids.join(', '));
  else if (legacyKids > 0) parts.push(`${legacyKids} kid${legacyKids === 1 ? '' : 's'}`);
  else parts.push('No kids');
  return parts.join(' · ');
}

/**
 * When a line runs, in words — "until Buy a home", "ages 0–4", "from 2027" —
 * so a row says why it starts and stops, not just its amount.
 */
export function lineTiming(line: BudgetLine, plan: Pick<Plan, 'events' | 'participants'>): string | undefined {
  const describe = (a: NonNullable<BudgetLine['from']>, edge: 'from' | 'until'): string => {
    if (a.kind === 'year') return `${edge === 'from' ? 'from' : 'until'} ${a.year}`;
    if (a.kind === 'event') {
      const e = plan.events.find((x) => x.id === a.eventId);
      return `${edge === 'from' ? 'from' : 'until'} ${e ? e.name : 'a removed event'}`;
    }
    const p = plan.participants.find((x) => x.id === a.participantId);
    return `${edge === 'from' ? 'from' : 'until'} ${p?.name ?? 'someone'} is ${a.age}`;
  };

  if (line.cadence === 'once') return line.from ? describe(line.from, 'from').replace(/^from /, 'in ') : 'once';

  const { from, until } = line;
  // Both ends on the same person's age reads best as a range: "ages 0–4".
  if (from?.kind === 'age' && until?.kind === 'age' && from.participantId === until.participantId) {
    return `ages ${from.age}–${until.age - 1}`;
  }
  const parts = [from ? describe(from, 'from') : undefined, until ? describe(until, 'until') : undefined].filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

/* --- envelopes (docs/REDESIGN-V5.md §5.3) -------------------------------------
   The household thinks in four envelopes: the shared pool, an allowance each,
   the kids, and what's left. They are a READING of the budget lines, with two
   ways to write one back that never touch the engine: the shared envelope
   moves the "Other shared spending" remainder, an adult's moves their
   allowance line. */

export interface BudgetEnvelopes {
  /** Every shared line, per month. */
  shared: number;
  /** Each included adult's own spending (their allowance, plus anything else that's theirs alone). */
  perAdult: { id: string; name: string; monthly: number }[];
  /** Every cost a child owns. Computed from stage lines, never edited here. */
  kids: number;
  afterTax: number;
  /** Tax on withdrawals: shown as its own row in a drawdown year, never folded into after tax. */
  withdrawalTax: number;
  /** The engine's unfunded shortfall: the only part of a gap that is "Short". */
  unfunded: number;
  /** After tax minus the envelopes and withdrawal tax. Derived; negative when the year overspends. */
  saved: number;
  /** Money set aside on purpose, per month (`BudgetView.intoSavings`). */
  intoSavings: number;
  /** Outgoings beyond after tax, per month; > 0 makes it a gap year (`BudgetView.gap`). */
  gap: number;
  /** The part of the gap real accounts paid: a genuine drawdown, never the unfunded part. */
  fromSavings: number;
}

export function budgetEnvelopes(plan: Plan, snapshot: YearSnapshot, view: BudgetView = budgetView(plan, snapshot)): BudgetEnvelopes {
  const total = (role: BudgetSection['role']) => view.sections.filter((s) => s.role === role).reduce((sum, s) => sum + s.monthly, 0);
  return {
    shared: total('shared'),
    perAdult: plan.participants
      .filter((p) => p.isIncluded && p.role !== 'child')
      .map((p) => ({ id: p.id, name: p.name, monthly: view.sections.find((s) => s.owner === p.id)?.monthly ?? 0 })),
    kids: total('child'),
    afterTax: view.afterTax,
    withdrawalTax: view.withdrawalTax,
    unfunded: view.unfunded,
    saved: view.saved,
    intoSavings: view.intoSavings,
    gap: view.gap,
    fromSavings: view.fromSavings,
  };
}

/**
 * One year as shares of its money, for the Budget-by-year area (F8). The base
 * is what the year had to cover: after-tax income, or, in a year whose
 * spending, set-aside money and withdrawal tax exceed it (a gap year), those
 * outgoings themselves. The envelopes plus what was set aside (`intoSavings`)
 * then fill 100%, and the gap hangs BELOW zero in two separate pieces
 * (V5-REVIEW-2 N1): `fromSavings`, what accounts really paid, and `unfunded`,
 * what nothing paid. Percentages, 0-100; all zero when the year has neither
 * income nor spending.
 */
export function envelopeShare(e: BudgetEnvelopes) {
  const outflow = e.shared + e.perAdult.reduce((sum, a) => sum + a.monthly, 0) + e.kids + e.withdrawalTax;
  const base = Math.max(e.afterTax, outflow + e.intoSavings);
  const pct = (v: number) => (base > 0.5 ? (v / base) * 100 : 0);
  const gapYear = e.gap >= 0.5;
  const fromSavings = pct(e.fromSavings);
  return {
    shared: pct(e.shared),
    perAdult: e.perAdult.map((a) => ({ id: a.id, share: pct(a.monthly) })),
    kids: pct(e.kids),
    withdrawalTax: pct(e.withdrawalTax),
    // A surplus year saves what is left over; a gap year sets aside only what
    // it still paid in on purpose. Never both, so the upper stack is 100%.
    saved: gapYear ? 0 : pct(Math.max(0, e.saved)),
    intoSavings: gapYear ? pct(e.intoSavings) : 0,
    fromSavings,
    // Capped so a lump-sum year (its shortfall is not in the monthly base)
    // cannot push the lower half past the axis.
    unfunded: Math.min(pct(e.unfunded), Math.max(0, 100 - fromSavings)),
    /** The top of the spending stack: 100 in a gap year, less when something is saved. */
    spent: pct(outflow),
  };
}

/** The line a shared-envelope edit writes into. `household.ts` creates it as `other-shared`. */
export const REMAINDER_LINE_ID = 'other-shared';
export const REMAINDER_LINE_NAME = 'Other shared spending';

export function findRemainderLine(plan: Pick<Plan, 'budget'>): BudgetLine | undefined {
  return (plan.budget ?? []).find(
    (l) =>
      l.owner === 'shared' &&
      l.kind === 'expense' &&
      l.cadence === 'monthly' &&
      (l.id === REMAINDER_LINE_ID || l.name.trim().toLowerCase() === REMAINDER_LINE_NAME.toLowerCase()),
  );
}

/** A person's allowance line (the first, if there are several). */
export function findAllowanceLine(plan: Pick<Plan, 'budget'>, participantId: string): BudgetLine | undefined {
  const lines = (plan.budget ?? []).filter((l) => l.owner === participantId && l.kind === 'allowance' && l.cadence === 'monthly');
  return lines.find((l) => l.isIncluded) ?? lines[0];
}

/**
 * What one dollar of `line.amount` reads as in `snapshot`'s year: 1 in
 * today's dollars for an inflation-growing line, the line's growth in future
 * dollars. Read off the line's own row when it has one this year (so a
 * custom growth rate or a retirement spending cut is honoured), else from the
 * plan's inflation. An envelope is typed in the dollars the page shows;
 * dividing by this turns it back into the line's today's-dollar amount.
 */
function presentedFactor(plan: Plan, snapshot: YearSnapshot, line?: BudgetLine): number {
  if (line && line.isIncluded && line.amount > 0) {
    const row = snapshot.expenses.find((e) => e.budgetLineId === line.id && !e.oneTime);
    if (row) return row.amount / (monthsIn(plan, snapshot.year) || 12) / line.amount;
  }
  return plan.settings.dollarMode === 'futureDollars'
    ? Math.pow(1 + plan.settings.inflationRate / 100, snapshot.year - plan.settings.startYear)
    : 1;
}

/** The line's monthly figure in `snapshot`'s year, in the dollars shown; 0 when it isn't running. */
function presentedMonthly(plan: Plan, snapshot: YearSnapshot, line?: BudgetLine): number {
  if (!line) return 0;
  const row = snapshot.expenses.find((e) => e.budgetLineId === line.id && !e.oneTime);
  return row ? row.amount / (monthsIn(plan, snapshot.year) || 12) : 0;
}

const cents = (v: number) => Math.round(v * 100) / 100;

/**
 * Set the shared envelope to `monthly` (docs/REDESIGN-V5.md §5.3, Q3's
 * default): the DIFFERENCE goes into the "Other shared spending" remainder
 * line, so rent, groceries and every other line stay exactly as they are.
 * The line is created when missing. An edit that would push it below zero
 * stops at zero and reports `clamped`.
 *
 * `monthly` is in the dollars `snapshot` shows. Without a snapshot it is
 * today's dollars and the current envelope is the sum of the shared monthly
 * lines (every one treated as running).
 */
export function setSharedEnvelope(plan: Plan, monthly: number, snapshot?: YearSnapshot): { plan: Plan; clamped: boolean } {
  const remainder = findRemainderLine(plan);
  const current = snapshot
    ? budgetEnvelopes(plan, snapshot).shared
    : (plan.budget ?? [])
        .filter((l) => l.isIncluded && l.owner === 'shared' && l.kind === 'expense' && l.cadence === 'monthly')
        .reduce((sum, l) => sum + l.amount, 0);
  const remainderNow = snapshot ? presentedMonthly(plan, snapshot, remainder) : remainder?.isIncluded ? remainder.amount : 0;

  const wanted = remainderNow + (monthly - current);
  const clamped = wanted < 0;
  const next = Math.max(0, wanted);
  const amount = cents(snapshot ? next / presentedFactor(plan, snapshot, remainder) : next);

  const budget = plan.budget ?? [];
  if (remainder) {
    return { plan: { ...plan, budget: budget.map((l) => (l.id === remainder.id ? { ...l, amount, isIncluded: true } : l)) }, clamped };
  }
  if (amount <= 0) return { plan, clamped };
  const created: BudgetLine = {
    id: REMAINDER_LINE_ID,
    name: REMAINDER_LINE_NAME,
    owner: 'shared',
    category: 'other',
    essential: false,
    kind: 'expense',
    cadence: 'monthly',
    amount,
    isIncluded: true,
  };
  return { plan: { ...plan, budget: [...budget, created] }, clamped };
}

/**
 * Set one adult's envelope to `monthly` by writing their allowance line,
 * created when they have none. Only that line changes. When the adult also
 * owns other lines, the allowance takes the rest so the envelope as a whole
 * lands on `monthly`; below zero stops at zero and reports `clamped`.
 */
export function setAdultEnvelope(plan: Plan, participantId: string, monthly: number, snapshot?: YearSnapshot): { plan: Plan; clamped: boolean } {
  const person = plan.participants.find((p) => p.id === participantId);
  if (!person) return { plan, clamped: false };
  const allowance = findAllowanceLine(plan, participantId);

  const others = snapshot
    ? (budgetEnvelopes(plan, snapshot).perAdult.find((a) => a.id === participantId)?.monthly ?? 0) - presentedMonthly(plan, snapshot, allowance)
    : 0;
  const wanted = monthly - others;
  const clamped = wanted < 0;
  const next = Math.max(0, wanted);
  const amount = cents(snapshot ? next / presentedFactor(plan, snapshot, allowance) : next);

  const budget = plan.budget ?? [];
  if (allowance) {
    return { plan: { ...plan, budget: budget.map((l) => (l.id === allowance.id ? { ...l, amount, isIncluded: true } : l)) }, clamped };
  }
  if (amount <= 0) return { plan, clamped };
  const created: BudgetLine = {
    id: `allowance-${participantId}`,
    name: `${person.name}'s allowance`,
    owner: participantId,
    category: 'personal',
    essential: false,
    kind: 'allowance',
    cadence: 'monthly',
    amount,
    isIncluded: true,
  };
  return { plan: { ...plan, budget: [...budget, created] }, clamped };
}

/** "Spencer 40 · Sarah 40": the adults' ages in `year`, for a chart readout. */
export function adultAges(plan: Pick<Plan, 'participants'>, year: number): string {
  return plan.participants
    .filter((p) => p.isIncluded && p.role !== 'child' && p.birthYear <= year)
    .map((p) => `${p.name} ${year - p.birthYear}`)
    .join(' · ');
}
