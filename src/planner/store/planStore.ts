import { create } from 'zustand';
import type { Account, Plan, PlanEvent } from '@northstar/engine';
import { SAMPLE_PLANS } from '../samplePlan';

/**
 * The plan is the only source of truth. `PlanResult` is always derived in a
 * useMemo and never stored — storing it is how the chart and the tables end up
 * disagreeing (docs/PLAN.md §3.2).
 *
 * Undo keeps whole plan snapshots rather than a command log. A plan is a few
 * kilobytes; a command pattern would be a lot of machinery to save nothing.
 */

const STORAGE_KEY = 'northstar:plans:v1';
const UNDO_LIMIT = 50;

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
  updateSettings(planId: string, patch: Partial<Plan['settings']>): void;

  undo(): void;
  redo(): void;
  reset(): void;
}

export const usePlanStore = create<PlanState>((set, get) => ({
  plans: loadPlans(),
  activeId: loadPlans()[0]?.id ?? SAMPLE_PLANS[0].id,
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

  updateSettings(planId, patch) {
    set((state) => commit(state, (plans) =>
      plans.map((plan) =>
        plan.id === planId ? { ...plan, settings: { ...plan.settings, ...patch } } : plan,
      ),
    ));
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
    const fresh = structuredClone(SAMPLE_PLANS);
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

function loadPlans(): Plan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(SAMPLE_PLANS);
    const parsed = JSON.parse(raw) as Plan[];
    if (!Array.isArray(parsed) || parsed.length === 0) return structuredClone(SAMPLE_PLANS);
    return parsed;
  } catch {
    // Corrupt or unavailable storage should never blank the app.
    return structuredClone(SAMPLE_PLANS);
  }
}

function persist(plans: Plan[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch {
    // Private browsing or a full quota. Losing persistence is survivable;
    // throwing here would take the whole edit down with it.
  }
}
