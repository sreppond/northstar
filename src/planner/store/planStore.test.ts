import { beforeEach, describe, expect, it } from 'vitest';
import { usePlanStore } from './planStore';

/**
 * The invariant the drag-through-time gesture (docs/EXECUTION.md Phase 3)
 * depends on: `upsertEvent` pushes exactly one undo entry per call
 * (`commit()` in planStore.ts). A drag updates LOCAL component state on
 * every pointer-move for the live preview, and calls `upsertEvent` exactly
 * once, on release — never on every move — which is what this file checks
 * from the store side. (The pointer gesture itself lives in
 * NetWorthChart.tsx, a .tsx component; this repo's test runner only
 * collects `*.test.ts`, so the gesture is verified live in the browser
 * instead — see the Phase 3 report.)
 *
 * Targets the sample plan's `house` (`buyAHome`) event — the first sample
 * plan (`plans[0]`, "House Forecast") is built around it.
 */

beforeEach(() => {
  usePlanStore.getState().reset();
});

function houseEvent() {
  const plan = usePlanStore.getState().plans[0];
  const event = plan.events.find((e) => e.id === 'house');
  if (!event) throw new Error('fixture assumption: sample plan[0] has a "house" event');
  return { plan, event };
}

describe('upsertEvent and the undo stack', () => {
  it('one call pushes exactly one undo entry', () => {
    const { plan, event } = houseEvent();

    const before = usePlanStore.getState().past.length;
    usePlanStore.getState().upsertEvent(plan.id, { ...event, startYear: event.startYear - 2 });

    expect(usePlanStore.getState().past.length).toBe(before + 1);
  });

  it('the moved year is what a single drag actually commits', () => {
    const { plan, event } = houseEvent();
    const targetYear = event.startYear - 2;

    usePlanStore.getState().upsertEvent(plan.id, { ...event, startYear: targetYear });

    const updated = usePlanStore
      .getState()
      .plans.find((p) => p.id === plan.id)
      ?.events.find((e) => e.id === 'house');
    expect(updated?.startYear).toBe(targetYear);
  });

  it('one undo fully reverts a one-call drag commit, with nothing left to redo twice', () => {
    const { plan, event } = houseEvent();
    const originalYear = event.startYear;

    usePlanStore.getState().upsertEvent(plan.id, { ...event, startYear: originalYear - 2 });
    usePlanStore.getState().undo();

    const reverted = usePlanStore
      .getState()
      .plans.find((p) => p.id === plan.id)
      ?.events.find((e) => e.id === 'house');
    expect(reverted?.startYear).toBe(originalYear);
    expect(usePlanStore.getState().past.length).toBe(0);
  });

  it('by contrast, calling upsertEvent on every step (what a drag must NOT do) pushes one entry per step', () => {
    // Documents the failure mode the "commit once, on release" rule exists
    // to avoid: if a drag called upsertEvent on every pointer-move instead
    // of tracking a local draft, five moves would spam five undo entries
    // for what should read as one action.
    const { plan, event } = houseEvent();

    const before = usePlanStore.getState().past.length;
    for (const step of [1, 2, 3, 4, 5]) {
      usePlanStore.getState().upsertEvent(plan.id, { ...event, startYear: event.startYear - step });
    }

    expect(usePlanStore.getState().past.length).toBe(before + 5);
  });
});

/**
 * The first-run authoring flow (docs/REDESIGN.md §6 item 6): a genuinely
 * empty store no longer seeds the fabricated sample plans. `startPlan` is
 * what `Onboarding.tsx` calls once a person has actually typed a name and a
 * birth year, so it has to produce a plan with exactly that -- nothing
 * financial, one household member, and made active immediately.
 */
describe('startPlan (first-run onboarding)', () => {
  it('creates a plan with the given name and one participant at the given birth year, and no financial data', () => {
    usePlanStore.setState({ plans: [], activeId: '', past: [], future: [] });

    usePlanStore.getState().startPlan('My plan', 1990);

    const state = usePlanStore.getState();
    expect(state.plans).toHaveLength(1);
    const plan = state.plans[0];
    expect(plan.name).toBe('My plan');
    expect(plan.participants).toHaveLength(1);
    expect(plan.participants[0]).toMatchObject({ name: 'You', birthYear: 1990, isIncluded: true });
    expect(plan.accounts).toHaveLength(0);
    expect(state.activeId).toBe(plan.id);
  });

  it('falls back to a default name when given an empty one', () => {
    usePlanStore.setState({ plans: [], activeId: '', past: [], future: [] });

    usePlanStore.getState().startPlan('   ', 1985);

    expect(usePlanStore.getState().plans[0].name).toBe('My plan');
  });
});
