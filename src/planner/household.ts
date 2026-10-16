/**
 * Moving a plan onto the household model (docs/REDESIGN-V4.md §5,
 * "Migration"): kids become members whose costs are budget lines that follow
 * their age, the yearly living-expenses figure becomes a budget line of its
 * own, and pay is assigned to the person who earns it wherever the plan
 * makes that unambiguous.
 *
 * Pure and reversible (it is applied through `replacePlan`, so one undo puts
 * everything back). It returns a plain-language list of what it changed —
 * the review step shows it — and leaves alone anything it would have to
 * guess at, saying so instead.
 */
import type { Anchor, BudgetLine, HaveAKidConfig, Participant, Plan, PlanEvent } from '@northstar/engine';
import { haveAKidConfig } from '@northstar/engine';

export interface HouseholdMigration {
  plan: Plan;
  /** What changed, in the order it happened — one sentence each. */
  changes: string[];
  /** Things it could not decide on its own. */
  needsReview: string[];
}

const OWNED_KINDS = new Set<PlanEvent['kind']>(['job', 'newJob', 'income', 'careerBreak', 'socialSecurity', 'retirement']);

export function isHouseholdModel(plan: Plan): boolean {
  return plan.budget !== undefined;
}

export function toHouseholdModel(plan: Plan): HouseholdMigration {
  const changes: string[] = [];
  const needsReview: string[] = [];
  const startYear = plan.settings.startYear;

  const adults: Participant[] = plan.participants.map((p) => (p.role ? p : { ...p, role: 'adult' }));
  const children: Participant[] = [];
  const budget: BudgetLine[] = [...(plan.budget ?? [])];
  const kidIdByEventId = new Map<string, string>();

  // --- kids: an event → a member plus lines that follow their age ---------
  const kidEvents = plan.events.filter((e) => e.kind === 'haveAKid' && e.isIncluded);
  for (const event of kidEvents) {
    const parsed = haveAKidConfig.safeParse(event.config ?? {});
    if (!parsed.success) {
      needsReview.push(`${event.name}'s settings couldn't be read, so it was left as an event.`);
      continue;
    }
    const config: HaveAKidConfig = parsed.data;
    const id = `kid-${event.id}`;
    kidIdByEventId.set(event.id, id);
    children.push({ id, name: event.name, birthYear: event.startYear, lifeExpectancy: 95, isIncluded: true, role: 'child' });

    const age = (n: number): Anchor => ({ kind: 'age', participantId: id, age: n });
    const growth: BudgetLine['growth'] =
      config.costGrowthRate === plan.settings.inflationRate
        ? { kind: 'inflation' }
        : { kind: 'fixed', rate: config.costGrowthRate };
    const base = { owner: id, essential: true, kind: 'expense' as const, isIncluded: true, growth };

    if (config.upfrontCost > 0) {
      budget.push({ ...base, id: `${id}-arrival`, name: `${event.name} — arrival`, category: 'other', cadence: 'once', amount: config.upfrontCost, from: age(0) });
    }
    if (config.annualCost > 0 && config.supportYears > 0) {
      budget.push({
        ...base,
        id: `${id}-raising`,
        name: `${event.name} — everyday costs`,
        category: 'childcare',
        cadence: 'monthly',
        amount: config.annualCost / 12,
        from: age(0),
        until: age(config.supportYears),
      });
    }
    if (config.collegeStartAge !== undefined && config.collegeAnnualCost > 0 && config.collegeYears > 0) {
      budget.push({
        ...base,
        id: `${id}-college`,
        name: `${event.name} — college`,
        category: 'education',
        cadence: 'monthly',
        amount: config.collegeAnnualCost / 12,
        from: age(config.collegeStartAge),
        until: age(config.collegeStartAge + config.collegeYears),
      });
    }

    const monthly = Math.round(config.annualCost / 12);
    changes.push(
      `${event.name} (${event.startYear}) is now a member of the household, costing $${monthly.toLocaleString()}/mo in today's dollars until age ${config.supportYears}.`,
    );
    if (event.startYear > startYear) {
      needsReview.push(
        `${event.name}'s costs now read as today's dollars and grow from ${startYear}, not from ${event.startYear} — about ${pctMore(growth, plan, event.startYear - startYear)}% more by the time they arrive. Adjust if you meant ${event.startYear} prices.`,
      );
    }
  }

  // --- events: kids removed, anchors to them re-pointed at the child ------
  const events = plan.events
    .filter((e) => !kidIdByEventId.has(e.id))
    .map((e) => repointAnchors(e, kidIdByEventId));

  // --- living expenses → a line of its own --------------------------------
  let baselineExpenses = plan.settings.baselineExpenses;
  if (baselineExpenses > 0) {
    budget.push({
      id: 'other-shared',
      name: 'Other shared spending',
      owner: 'shared',
      category: 'other',
      essential: false,
      kind: 'expense',
      cadence: 'monthly',
      amount: baselineExpenses / 12,
      isIncluded: true,
    });
    changes.push(
      `Yearly living expenses ($${Math.round(baselineExpenses).toLocaleString()}) became "Other shared spending" at $${Math.round(baselineExpenses / 12).toLocaleString()}/mo.`,
    );
    needsReview.push('Split rent out of "Other shared spending" so it can end when you buy a home.');
    baselineExpenses = 0;
  }

  // --- whose pay is it? ----------------------------------------------------
  const owned = events.map((e) => {
    if (!OWNED_KINDS.has(e.kind)) return e;
    const config = (e.config ?? {}) as { participantId?: string };
    if (config.participantId) return e;
    const owner = guessOwner(e.name, adults);
    if (!owner) {
      if (adults.length > 1 && e.kind !== 'retirement') needsReview.push(`Say whose ${e.name} is.`);
      return e;
    }
    if (adults.length > 1) changes.push(`${e.name} is now ${owner.name}'s.`);
    return { ...e, config: { ...config, participantId: owner.id } };
  });

  return {
    plan: {
      ...plan,
      settings: { ...plan.settings, baselineExpenses },
      participants: [...adults, ...children],
      events: owned,
      budget,
    },
    changes,
    needsReview,
  };
}

/** The one adult a name points at — the only adult, or the only one named in it. */
function guessOwner(eventName: string, adults: Participant[]): Participant | undefined {
  const included = adults.filter((p) => p.isIncluded);
  if (included.length === 1) return included[0];
  const named = included.filter((p) => new RegExp(`\\b${escape(p.name)}`, 'i').test(eventName));
  return named.length === 1 ? named[0] : undefined;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A job phase that started "when First child arrives" now starts at the child's birth. */
function repointAnchors(event: PlanEvent, kidIdByEventId: Map<string, string>): PlanEvent {
  if (event.kind !== 'job') return event;
  const config = event.config as { phases?: { from: Anchor }[] };
  if (!config.phases?.some((p) => p.from.kind === 'event' && kidIdByEventId.has(p.from.eventId))) return event;
  return {
    ...event,
    config: {
      ...config,
      phases: config.phases.map((p) =>
        p.from.kind === 'event' && kidIdByEventId.has(p.from.eventId)
          ? { ...p, from: { kind: 'age', participantId: kidIdByEventId.get(p.from.eventId)!, age: (p.from.offset ?? 0) } }
          : p,
      ),
    },
  };
}

function pctMore(growth: BudgetLine['growth'], plan: Plan, years: number): number {
  const rate = growth?.kind === 'fixed' ? growth.rate : plan.settings.inflationRate;
  return Math.round((Math.pow(1 + rate / 100, years) - 1) * 100);
}
