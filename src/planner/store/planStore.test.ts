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
