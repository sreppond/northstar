import { create } from 'zustand';
import type { Account, Goal, Plan, PlanEvent } from '@northstar/engine';
import { mergeGoalRules } from '@northstar/engine';
import { SAMPLE_PLANS } from '../samplePlan';

/**
 * The plan is the only source of truth. `PlanResult` is always derived in a
 * useMemo and never stored — storing it is how the chart and the tables end up
 * disagreeing (docs/PLAN.md §3.2).
 *
 * Undo keeps whole plan snapshots rather than a command log. A plan is a few
 * kilobytes; a command pattern would be a lot of machinery to save nothing.
 */

export const STORAGE_KEY = 'northstar:plans:v1';
const UNDO_LIMIT = 50;

/**
 * Server sync.
 *
 * localStorage stays the primary write on every change: it is synchronous, it
 * cannot fail, and it is what makes the app work with no backend at all (the
 * GitHub Pages build). The server is a durable copy written just behind it.
 *
 * Ordering matters here. Writing localStorage first and the server second means
 * a dropped network request costs nothing — the next change retries the whole
 * set, because the sync is a whole-set replace rather than a diff. There is no
 * queue to drain and no conflict to resolve.
 */
type Sync = (plans: Plan[]) => void;

let syncToServer: Sync | null = null;

/** Called once, after the app knows it is talking to a backend. */
export function enableServerSync(sync: Sync): void {
  syncToServer = sync;
}

interface PlanState {
  plans: Plan[];
  activeId: string;
  past: Plan[][];
  future: Plan[][];

  activePlan(): Plan;
  setActive(id: string): void;

  upsertEvent(planId: string, event: PlanEvent): void;
  upsertAccount(planId: string, account: Account): void;
  deleteEvent(planId: string, eventId: string): void;
  upsertGoal(planId: string, goal: Goal): void;
  deleteGoal(planId: string, goalId: string): void;
  reorderGoals(planId: string, goalIds: string[]): void;
  updateSettings(planId: string, patch: Partial<Plan['settings']>): void;
  replacePlan(plan: Plan): void;
  createPlan(name: string): void;
  /**
   * The first-run authoring flow (docs/REDESIGN.md §6 item 6): creates the
   * user's own first plan, with one participant at the birth year they gave,
   * and makes it active. `Onboarding.tsx` is the only caller — everywhere
   * else a plan already exists by the time the UI can reach `createPlan`.
   */
  startPlan(name: string, birthYear: number): void;
  duplicatePlan(planId: string): void;
  renamePlan(planId: string, name: string): void;
  deletePlan(planId: string): void;

  undo(): void;
  redo(): void;
  reset(): void;
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plans: loadPlans(),
  // No `?? SAMPLE_PLANS[0].id` fallback here on purpose (docs/REDESIGN.md §6
  // item 6): on a genuinely first run `loadPlans()` now returns `[]`, and an
  // id pointing at a plan that is not in `plans` would be a dangling
  // reference. An empty string is the correct "nothing active yet" value —
  // `App.tsx` renders `Onboarding` instead of the planner while `plans` is
  // empty, so nothing ever reads `activeId` in that state.
  activeId: loadPlans()[0]?.id ?? '',
  past: [],
  future: [],

  activePlan() {
    const { plans, activeId } = get();
    return plans.find((p) => p.id === activeId) ?? plans[0];
  },

  setActive(id) {
    set({ activeId: id });
  },

  upsertEvent(planId, event) {
    set((state) => commit(state, (plans) =>
      plans.map((plan) => {
        if (plan.id !== planId) return plan;
        const exists = plan.events.some((e) => e.id === event.id);
        return {
          ...plan,
          events: exists
            ? plan.events.map((e) => (e.id === event.id ? event : e))
            : [...plan.events, event],
        };
      }),
    ));
  },

  upsertAccount(planId, account) {
    set((state) => commit(state, (plans) =>
      plans.map((plan) => {
        if (plan.id !== planId) return plan;
        const exists = plan.accounts.some((a) => a.id === account.id);
        return {
          ...plan,
          accounts: exists
            ? plan.accounts.map((a) => (a.id === account.id ? account : a))
            : [...plan.accounts, account],
        };
      }),
    ));
  },

  deleteEvent(planId, eventId) {
    set((state) => commit(state, (plans) =>
      plans.map((plan) => {
        if (plan.id !== planId) return plan;
        return {
          ...plan,
          events: plan.events.filter((e) => e.id !== eventId),
          // Synthetic accounts are owned by the event that created them.
          // The engine rebuilds them on every run, but any the user has
          // persisted must go too, or they outlive their owner.
          accounts: plan.accounts.filter((a) => a.sourceEventId !== eventId),
          rules: plan.rules.filter((r) => !r.accountId.startsWith(`${eventId}:`)),
        };
      }),
    ));
  },

  // Goals are a friendly surface over the allocation waterfall
  // (docs/REDESIGN.md §2.2) — every mutation re-derives that plan's
  // goal-tagged rules via `mergeGoalRules` so `plan.rules` never drifts from
  // what `plan.goals` actually implies. `run.ts` only ever reads `plan.rules`;
  // it has no goal-specific logic of its own.
  upsertGoal(planId, goal) {
    set((state) => commit(state, (plans) =>
      plans.map((plan) => {
        if (plan.id !== planId) return plan;
        const goals = plan.goals ?? [];
        const exists = goals.some((g) => g.id === goal.id);
        const nextGoals = exists ? goals.map((g) => (g.id === goal.id ? goal : g)) : [...goals, goal];
        const withGoals = { ...plan, goals: nextGoals };
        return { ...withGoals, rules: mergeGoalRules(withGoals) };
      }),
    ));
  },

  deleteGoal(planId, goalId) {
    set((state) => commit(state, (plans) =>
      plans.map((plan) => {
        if (plan.id !== planId) return plan;
        const withGoals = { ...plan, goals: (plan.goals ?? []).filter((g) => g.id !== goalId) };
        return { ...withGoals, rules: mergeGoalRules(withGoals) };
      }),
    ));
  },

  reorderGoals(planId, goalIds) {
    set((state) => commit(state, (plans) =>
      plans.map((plan) => {
        if (plan.id !== planId) return plan;
        const byId = new Map((plan.goals ?? []).map((g) => [g.id, g]));
        // Priority order is position in the array, so a goal id this plan
        // doesn't have is silently ignored rather than inserted.
        const reordered = goalIds.map((id) => byId.get(id)).filter((g): g is Goal => g !== undefined);
        const withGoals = { ...plan, goals: reordered };
        return { ...withGoals, rules: mergeGoalRules(withGoals) };
      }),
    ));
  },

  updateSettings(planId, patch) {
    set((state) => commit(state, (plans) =>
      plans.map((plan) =>
        plan.id === planId ? { ...plan, settings: { ...plan.settings, ...patch } } : plan,
      ),
    ));
  },

  replacePlan(plan) {
    set((state) => commit(state, (plans) => plans.map((p) => (p.id === plan.id ? plan : p))));
  },

  createPlan(name) {
    const fresh = blankPlan(newId(), name, get().plans[0]);
    set((state) => ({ ...commit(state, (plans) => [...plans, fresh]), activeId: fresh.id }));
  },

  startPlan(name, birthYear) {
    const id = newId();
    // `blankPlan` with no `like` plan already produces exactly the right
    // shape for a genuine first run — no accounts, no financial data, just
    // the required end-of-plan event — the one thing missing is a household,
    // since there is no earlier plan to borrow one from.
    const plan = blankPlan(id, name.trim() || 'My plan', undefined);
    plan.participants = [
      { id: `p-${Math.random().toString(36).slice(2, 8)}`, name: 'You', birthYear, lifeExpectancy: 90, isIncluded: true },
    ];
    set((state) => ({ ...commit(state, (plans) => [...plans, plan]), activeId: plan.id }));
  },

  duplicatePlan(planId) {
    const source = get().plans.find((p) => p.id === planId);
    if (!source) return;
    const copy: Plan = { ...structuredClone(source), id: newId(), name: `${source.name} copy` };
    // A duplicate that still points at a comparison would render itself
    // against its own twin, which reads as a bug.
    delete copy.settings.compareToPlanId;
    set((state) => ({ ...commit(state, (plans) => [...plans, copy]), activeId: copy.id }));
  },

  renamePlan(planId, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((state) => commit(state, (plans) =>
      plans.map((p) => (p.id === planId ? { ...p, name: trimmed } : p)),
    ));
  },

  deletePlan(planId) {
    const { plans } = get();
    // Never leave the app with no plan to show.
    if (plans.length <= 1) return;
    set((state) => {
      const remaining = state.plans
        .filter((p) => p.id !== planId)
        // Drop any dangling comparison pointing at the deleted plan.
        .map((p) =>
          p.settings.compareToPlanId === planId
            ? { ...p, settings: { ...p.settings, compareToPlanId: undefined } }
            : p,
        );
      return {
        ...commit(state, () => remaining),
        activeId: state.activeId === planId ? remaining[0].id : state.activeId,
      };
    });
  },

  undo() {
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      persist(previous);
      return {
        plans: previous,
        past: state.past.slice(0, -1),
        future: [state.plans, ...state.future].slice(0, UNDO_LIMIT),
      };
    });
  },

  redo() {
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      persist(next);
      return {
        plans: next,
        past: [...state.past, state.plans].slice(-UNDO_LIMIT),
        future: state.future.slice(1),
      };
    });
  },

  reset() {
    const fresh = structuredClone(SAMPLE_PLANS).map(withAsOfDate);
    persist(fresh);
    set({ plans: fresh, activeId: fresh[0].id, past: [], future: [] });
  },
}));

/** Apply a change, push the previous state onto the undo stack, persist. */
function commit(
  state: PlanState,
  change: (plans: Plan[]) => Plan[],
): Partial<PlanState> {
  const plans = change(state.plans);
  persist(plans);
  return {
    plans,
    past: [...state.past, state.plans].slice(-UNDO_LIMIT),
    future: [],
  };
}

function newId(): string {
  return `plan-${Math.random().toString(36).slice(2, 10)}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A genuinely empty plan: no accounts, no events but the required horizon.
 * It borrows the household and start year from an existing plan, since those
 * describe the person rather than the scenario, but nothing financial —
 * inheriting the sample balance sheet made every new scenario a lie.
 */
function blankPlan(id: string, name: string, like: Plan | undefined): Plan {
  const startYear = like?.settings.startYear ?? new Date().getFullYear();
  const horizon = like?.events.find((e) => e.kind === 'endOfPlan')?.startYear ?? startYear + 20;

  return {
    id,
    name,
    settings: {
      startYear,
      // A brand-new scenario's balances are current as of right now — the
      // first year of its own projection is whatever is left of this one.
      asOfDate: todayISO(),
      projectionYears: horizon - startYear + 1,
      inflationRate: like?.settings.inflationRate ?? 2.5,
      dollarMode: like?.settings.dollarMode ?? 'futureDollars',
      baselineIncome: 0,
      baselineExpenses: 0,
      incomeTaxRate: like?.settings.incomeTaxRate ?? 25,
    },
    participants: like ? structuredClone(like.participants) : [],
    accounts: [],
    events: [
      {
        id: `end-${id}`,
        kind: 'endOfPlan',
        name: 'End of plan',
        startYear: horizon,
        isIncluded: true,
        isRequired: true,
        config: {},
      },
    ],
    rules: [],
  };
}

/**
 * A genuinely first-run browser (`raw === null`, nothing has EVER been saved
 * here) now returns no plans at all, rather than silently seeding
 * `SAMPLE_PLANS` as if two fabricated "Amazon" scenarios were the user's own
 * money (docs/REDESIGN.md §6 item 6). `App.tsx` renders `Onboarding` instead
 * of the planner while `plans` is empty; `SAMPLE_PLANS` stays reachable only
 * through that screen's explicit "Load an example" choice (`reset()`).
 *
 * A raw value that fails to parse or no longer matches today's `Plan` shape
 * is a DIFFERENT situation — someone's real data, corrupted or from an old
 * build — and still recovers to the sample plans rather than stranding the
 * app; that recovery path is unchanged.
 */
function loadPlans(): Plan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Plan[];
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isPlanShape)) {
      return structuredClone(SAMPLE_PLANS).map(withAsOfDate);
    }
    return parsed.map(withAsOfDate);
  } catch {
    // Corrupt or unavailable storage should never blank the app.
    return structuredClone(SAMPLE_PLANS).map(withAsOfDate);
  }
}

// A plan saved before `asOfDate` existed has no opinion about how far into
// its first year the projection should start — default it to today rather
// than silently reverting every such plan to the old full-year-one behaviour.
function withAsOfDate(plan: Plan): Plan {
  if (plan.settings.asOfDate) return plan;
  return { ...plan, settings: { ...plan.settings, asOfDate: todayISO() } };
}

// A plan saved by an older build can be missing a field the engine now
// indexes into unconditionally (e.g. `rules`). Reject anything that doesn't
// match today's shape rather than let a stale record crash the first render.
function isPlanShape(p: unknown): p is Plan {
  if (typeof p !== 'object' || p === null) return false;
  const plan = p as Partial<Plan>;
  return (
    Array.isArray(plan.participants) &&
    Array.isArray(plan.accounts) &&
    Array.isArray(plan.events) &&
    Array.isArray(plan.rules) &&
    typeof plan.settings === 'object' &&
    plan.settings !== null
  );
}

function persist(plans: Plan[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch {
    // Private browsing or a full quota. Losing persistence is survivable;
    // throwing here would take the whole edit down with it.
  }

  // Local write first, server second, and never awaited: a slow or failed
  // request must not make typing in a drawer feel slow, and the next edit
  // resends the whole set anyway.
  syncToServer?.(plans);
}

/** Replace everything from the server, without disturbing undo history. */
export function hydrateFromServer(plans: Plan[]): void {
  if (plans.length === 0) return;
  persist(plans);
  usePlanStore.setState({ plans, activeId: plans[0].id, past: [], future: [] });
}
