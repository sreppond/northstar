import { useCallback, useState } from 'react';
import type { EventKind, Plan, PlanEvent } from '@northstar/engine';
import { EVENT_MODULES } from '@northstar/engine';

/**
 * Drawer state, kept out of the App component.
 *
 * Holds a DRAFT clone. The parent merges the draft into the plan for the live
 * preview, but the store is not touched until `commit` — so Cancel costs
 * nothing and a half-finished edit never lands in localStorage.
 */
export interface EventEditor {
  open: boolean;
  draft: PlanEvent | null;
  isNew: boolean;
  startNew(): void;
  edit(event: PlanEvent): void;
  pickKind(kind: EventKind, plan: Plan): void;
  change(draft: PlanEvent): void;
  close(): void;
}

export function useEventEditor(): EventEditor {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PlanEvent | null>(null);
  const [isNew, setIsNew] = useState(false);

  const startNew = useCallback(() => {
    setDraft(null);
    setIsNew(true);
    setOpen(true);
  }, []);

  const edit = useCallback((event: PlanEvent) => {
    // Clone so field edits never mutate the stored event.
    setDraft(structuredClone(event));
    setIsNew(false);
    setOpen(true);
  }, []);

  const pickKind = useCallback((kind: EventKind, plan: Plan) => {
    const mod = EVENT_MODULES[kind];
    const startYear = defaultStartYear(plan);
    setDraft({
      id: `e${Math.random().toString(36).slice(2, 10)}`,
      kind,
      name: mod.label,
      startYear,
      isIncluded: true,
      config: mod.defaults({
        settings: plan.settings,
        participants: plan.participants,
        startYear: plan.settings.startYear,
        endYear: startYear,
        inflationAt: () => 1,
      }),
    });
  }, []);

  const change = useCallback((next: PlanEvent) => setDraft(next), []);

  const close = useCallback(() => {
    setOpen(false);
    setDraft(null);
    setIsNew(false);
  }, []);

  return { open, draft, isNew, startNew, edit, pickKind, change, close };
}

/** A few years out, so a new event is visible on the chart without scrolling. */
function defaultStartYear(plan: Plan): number {
  return plan.settings.startYear + 2;
}

/** The plan as it would be with the draft applied — used for live preview. */
export function withDraft(plan: Plan, draft: PlanEvent | null): Plan {
  if (!draft) return plan;
  const exists = plan.events.some((e) => e.id === draft.id);
  return {
    ...plan,
    events: exists
      ? plan.events.map((e) => (e.id === draft.id ? draft : e))
      : [...plan.events, draft],
  };
}
