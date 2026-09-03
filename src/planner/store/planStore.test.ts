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

/**
 * The Compare page's What-If: edit the live plan directly, with the
 * pre-edit content preserved as a hidden `isWhatIfSnapshot` plan the whole
 * time, so "keep" / "revert" / "fork" can each resolve it without ever
 * having required the user to duplicate a plan by hand first.
 */
describe('What-If (startWhatIf / keepWhatIf / revertWhatIf / forkWhatIf)', () => {
  it('starting one snapshots the current content as a hidden plan and points compareToPlanId at it', () => {
    const { plan } = houseEvent();
    const planCountBefore = usePlanStore.getState().plans.length;

    usePlanStore.getState().startWhatIf(plan.id);

    const state = usePlanStore.getState();
    expect(state.plans).toHaveLength(planCountBefore + 1);
    const live = state.plans.find((p) => p.id === plan.id)!;
    const snapshot = state.plans.find((p) => p.id === live.settings.compareToPlanId);
    expect(snapshot?.isWhatIfSnapshot).toBe(true);
    expect(snapshot?.events).toEqual(plan.events);
    // The live plan itself is untouched by starting one — only its pointer changed.
    expect(live.events).toEqual(plan.events);
  });

  it('keeping the changes discards the snapshot and leaves the edits standing', () => {
    const { plan, event } = houseEvent();
    const editedYear = event.startYear - 2;

    usePlanStore.getState().startWhatIf(plan.id);
    const snapshotId = usePlanStore.getState().plans.find((p) => p.id === plan.id)!.settings.compareToPlanId!;
    usePlanStore.getState().upsertEvent(plan.id, { ...event, startYear: editedYear });

    usePlanStore.getState().keepWhatIf(plan.id);

    const state = usePlanStore.getState();
    expect(state.plans.some((p) => p.id === snapshotId)).toBe(false);
    const live = state.plans.find((p) => p.id === plan.id)!;
    expect(live.settings.compareToPlanId).toBeUndefined();
    expect(live.events.find((e) => e.id === 'house')?.startYear).toBe(editedYear);
  });

  it('reverting restores the pre-What-If content and discards the snapshot', () => {
    const { plan, event } = houseEvent();
    const originalYear = event.startYear;

    usePlanStore.getState().startWhatIf(plan.id);
    const snapshotId = usePlanStore.getState().plans.find((p) => p.id === plan.id)!.settings.compareToPlanId!;
    usePlanStore.getState().upsertEvent(plan.id, { ...event, startYear: originalYear - 2 });

    usePlanStore.getState().revertWhatIf(plan.id);

    const state = usePlanStore.getState();
    expect(state.plans.some((p) => p.id === snapshotId)).toBe(false);
    const live = state.plans.find((p) => p.id === plan.id)!;
    expect(live.id).toBe(plan.id);
    expect(live.name).toBe(plan.name);
    expect(live.settings.compareToPlanId).toBeUndefined();
    expect(live.events.find((e) => e.id === 'house')?.startYear).toBe(originalYear);
  });

  it('forking saves the edits as a new named plan and reverts the live plan to the snapshot', () => {
    const { plan, event } = houseEvent();
    const originalYear = event.startYear;
    const editedYear = originalYear - 2;

    usePlanStore.getState().startWhatIf(plan.id);
    usePlanStore.getState().upsertEvent(plan.id, { ...event, startYear: editedYear });

    usePlanStore.getState().forkWhatIf(plan.id, 'Earlier house');

    const state = usePlanStore.getState();
    const live = state.plans.find((p) => p.id === plan.id)!;
    expect(live.events.find((e) => e.id === 'house')?.startYear).toBe(originalYear);
    expect(live.settings.compareToPlanId).toBeUndefined();

    const forked = state.plans.find((p) => p.name === 'Earlier house');
    expect(forked).toBeDefined();
    expect(forked!.id).not.toBe(plan.id);
    expect(forked!.isWhatIfSnapshot).toBeUndefined();
    expect(forked!.events.find((e) => e.id === 'house')?.startYear).toBe(editedYear);

    // Snapshot cleaned up: only the original plan count plus the one fork remain.
    expect(state.plans.filter((p) => p.isWhatIfSnapshot).length).toBe(0);
  });
});

describe('progress points', () => {
  beforeEach(() => {
    usePlanStore.setState({ progressPoints: [] });
  });

  it('upsertProgressPoint adds a new point, then updates it in place on a repeat id', () => {
    usePlanStore.getState().upsertProgressPoint({ id: 'pp-1', date: '2024-01-01', netWorth: 100, assets: 120, liabilities: 20 });
    expect(usePlanStore.getState().progressPoints).toHaveLength(1);

    usePlanStore.getState().upsertProgressPoint({ id: 'pp-1', date: '2024-01-01', netWorth: 150, assets: 170, liabilities: 20 });

    const points = usePlanStore.getState().progressPoints;
    expect(points).toHaveLength(1);
    expect(points[0].netWorth).toBe(150);
  });

  it('deleteProgressPoint removes it', () => {
    usePlanStore.getState().upsertProgressPoint({ id: 'pp-1', date: '2024-01-01', netWorth: 100, assets: 120, liabilities: 20 });

    usePlanStore.getState().deleteProgressPoint('pp-1');

    expect(usePlanStore.getState().progressPoints).toHaveLength(0);
  });
});
