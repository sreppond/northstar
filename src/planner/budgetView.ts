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
  /** Income minus taxes, per month — what the household actually has to spend or save. */
  afterTax: number;
  income: number;
  taxes: number;
  sections: BudgetSection[];
  /** Money moved into accounts on purpose (401(k), 529, a home fund), per month. */
  contributions: BudgetRow[];
  /**
   * Lump sums this year (a down payment, arrival costs) — NOT per month and
   * not in `sections`; they come out of savings, not the monthly budget.
   */
  oneTime: { key: string; label: string; amount: number; sourceEventId?: string }[];
  /** After-tax income minus spending, per month — negative when savings are drawn down. */
  saved: number;
  /** `saved` ÷ `afterTax`, percent; undefined with nothing coming in. */
  savingsRate?: number;
  /** The 100% bar, left to right in the order money leaves the shared pool. */
  buckets: BudgetBucket[];
}

/** Owner hues — categorical data colours (docs/DESIGN-DIRECTION.md "colour is data"). */
const ADULT_COLORS = ['var(--mix-4)', 'var(--mix-3)'];
const CHILD_COLORS = ['var(--mix-6)', 'var(--mix-5)', 'var(--mix-2)'];
export const SHARED_FIXED_COLOR = 'var(--mix-1)';
export const SHARED_FLEX_COLOR = 'color-mix(in srgb, var(--mix-1) 50%, var(--surface))';
export const SAVED_COLOR = 'var(--in)';

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

  const income = perMonth(snapshot.totalIncome);
  const taxes = perMonth(snapshot.totalTaxes);
  const afterTax = income - taxes;
  const spending = sections.reduce((sum, s) => sum + s.monthly, 0);
  // The monthly picture: what's left after RECURRING spending. A lump sum
  // this year is shown separately (`oneTime`), drawn from savings.
  const saved = afterTax - spending;

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
  buckets.push({ key: 'saved', label: saved >= 0 ? 'Saved' : 'Drawn from savings', monthly: saved, color: SAVED_COLOR });

  return {
    year: snapshot.year,
    afterTax,
    income,
    taxes,
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
 * Monthly spending by owner for every year — the Budget page's life-stage
 * columns. Same arithmetic as `budgetView`, one entry per year.
 */
export function budgetSeries(plan: Plan, years: YearSnapshot[]): { year: number; afterTax: number; byOwner: Map<OwnerKey, number> }[] {
  return years.map((y) => {
    const view = budgetView(plan, y);
    return { year: y.year, afterTax: view.afterTax, byOwner: new Map(view.sections.map((s) => [s.owner, s.monthly])) };
  });
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
