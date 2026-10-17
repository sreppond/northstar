import { describe, expect, it } from 'vitest';
import { KID_DEFAULTS, addChild } from './kids';
import { basePlan, event } from './planFixtures';
import {
  HOUSEHOLD_LANE,
  addAdult,
  buildLanes,
  kidStages,
  packChips,
  verticalYears,
  yearFromDragDelta,
} from './timeline';

/**
 * `yearFromDragDelta` is the Timeline's event-drag math, ported from the old
 * Gantt (`EventsTab`, deleted with it; docs/
 * ROADMAP-10.md C7: "bars drag along the timeline to change start year:
 * pointer events, quantized to years"). DELTA-based: how far the pointer
 * has moved since the drag started, converted to a year offset from the
 * event's ORIGINAL year — not an absolute pointer-position-to-year mapping,
 * which would snap the bar's start to wherever it was grabbed (see the
 * function's own doc comment for why that's wrong for a bar with width).
 */
describe('yearFromDragDelta', () => {
  const startYear = 2026;
  const endYear = 2046;
  const pxPerYear = 50; // a 1000px track over a 20-year span

  it('returns the origin year when the pointer has not moved', () => {
    expect(yearFromDragDelta(0, pxPerYear, 2030, startYear, endYear)).toBe(2030);
  });

  it('moves forward by whole years for a rightward drag', () => {
    expect(yearFromDragDelta(150, pxPerYear, 2030, startYear, endYear)).toBe(2033);
  });

  it('moves backward by whole years for a leftward drag', () => {
    expect(yearFromDragDelta(-100, pxPerYear, 2030, startYear, endYear)).toBe(2028);
  });

  it('quantizes to the nearest whole year rather than a fractional one', () => {
    // 55px at 50px/yr is 1.1 years — rounds down to +1, not up to +2.
    expect(yearFromDragDelta(55, pxPerYear, 2030, startYear, endYear)).toBe(2031);
    // 80px at 50px/yr is 1.6 years — rounds up to +2.
    expect(yearFromDragDelta(80, pxPerYear, 2030, startYear, endYear)).toBe(2032);
  });

  it('clamps to startYear rather than a year before the plan begins', () => {
    expect(yearFromDragDelta(-1000, pxPerYear, 2030, startYear, endYear)).toBe(startYear);
  });

  it('clamps to endYear rather than a year past the plan horizon', () => {
    expect(yearFromDragDelta(1000, pxPerYear, 2030, startYear, endYear)).toBe(endYear);
  });

  it('is independent of WHERE on the bar the pointer grabbed it — only the delta matters', () => {
    // Grabbing near the bar's left edge vs. deep into its width, then
    // dragging the same 150px, lands on the same year either way: the
    // offset from the origin year is all that's tracked, never the
    // pointer's absolute position.
    const originYear = 2028; // a long haveAKid-style bar starting here
    const draggedSameAmount = yearFromDragDelta(150, pxPerYear, originYear, startYear, endYear);
    expect(draggedSameAmount).toBe(2031);
  });

  it('treats a zero px-per-year (not yet measured) as no movement rather than dividing by zero', () => {
    expect(yearFromDragDelta(200, 0, 2030, startYear, endYear)).toBe(2030);
  });
});

const twoAdults = () =>
  basePlan({
    participants: [
      { id: 'a', name: 'Alex', birthYear: 1990, lifeExpectancy: 95, isIncluded: true, role: 'adult' },
      { id: 'b', name: 'Bo', birthYear: 1992, lifeExpectancy: 95, isIncluded: true, role: 'adult' },
    ],
  });

describe('buildLanes: which lane an event lands on (docs/REDESIGN-V5.md §5.4)', () => {
  it('orders adults, then Household, then children by birth', () => {
    let plan = twoAdults();
    plan = addChild(plan, { name: 'Younger', birthYear: 2032, options: KID_DEFAULTS });
    plan = addChild(plan, { name: 'Older', birthYear: 2028, options: KID_DEFAULTS });
    expect(buildLanes(plan, 2026, 2056).map((l) => l.person?.name ?? l.id)).toEqual(['Alex', 'Bo', HOUSEHOLD_LANE, 'Older', 'Younger']);
  });

  it('puts owned events on their person, and retirement too since it has a participantId', () => {
    const plan = twoAdults();
    plan.events = [
      event({ id: 'j', kind: 'income', startYear: 2026, config: { participantId: 'b' } }),
      event({ id: 'r', kind: 'retirement', startYear: 2055, config: { participantId: 'a' } }),
      event({ id: 'h', kind: 'buyAHome', startYear: 2030 }),
      event({ id: 'w', kind: 'windfall', startYear: 2031 }),
    ];
    const lanes = Object.fromEntries(buildLanes(plan, 2026, 2060).map((l) => [l.id, l.events.map((e) => e.event.id)]));
    expect(lanes).toEqual({ a: ['r'], b: ['j'], [HOUSEHOLD_LANE]: ['h', 'w'] });
  });

  it('sends an unassigned owned event to Household and flags it "Who?" — except retirement', () => {
    const plan = twoAdults();
    plan.events = [
      event({ id: 'j', kind: 'income', startYear: 2026 }),
      event({ id: 'r', kind: 'retirement', startYear: 2055 }),
    ];
    const household = buildLanes(plan, 2026, 2060).find((l) => l.id === HOUSEHOLD_LANE)!;
    expect(household.events.map((e) => [e.event.id, e.needsOwner])).toEqual([
      ['j', true],
      ['r', false],
    ]);
  });

  it('gives a lone adult their unassigned pay rather than leaving it on Household', () => {
    const plan = basePlan();
    plan.events = [event({ id: 'j', kind: 'income', startYear: 2026 })];
    expect(buildLanes(plan, 2026, 2060)[0].events.map((e) => e.event.id)).toEqual(['j']);
  });

  it('leaves a job to its career bar, and keeps the chip when the job is switched off', () => {
    const plan = twoAdults();
    plan.events = [
      event({ id: 'j', kind: 'job', startYear: 2026, config: { participantId: 'a' } }),
      event({ id: 'old', kind: 'job', startYear: 2020, isIncluded: false, config: { participantId: 'a' } }),
    ];
    const a = buildLanes(plan, 2026, 2060).find((l) => l.id === 'a')!;
    expect(a.career.map((s) => s.eventId)).toEqual(['j']);
    expect(a.events.map((e) => e.event.id)).toEqual([]);
    plan.events = [event({ id: 'off', kind: 'job', startYear: 2030, isIncluded: false, config: { participantId: 'a' } })];
    expect(buildLanes(plan, 2026, 2060).find((l) => l.id === 'a')!.events.map((e) => e.event.id)).toEqual(['off']);
  });

  it('keeps excluded events (dimmed, not draggable), drops hidden and out-of-range ones', () => {
    const plan = basePlan();
    plan.events = [
      event({ id: 'off', kind: 'windfall', startYear: 2030, isIncluded: false }),
      event({ id: 'hid', kind: 'windfall', startYear: 2030, isHidden: true }),
      event({ id: 'late', kind: 'windfall', startYear: 2099 }),
      event({ id: 'end', kind: 'endOfPlan', startYear: 2050 }),
    ];
    const household = buildLanes(plan, 2026, 2056).find((l) => l.id === HOUSEHOLD_LANE)!;
    expect(household.events.map((e) => [e.event.id, e.draggable])).toEqual([
      ['off', false],
      ['end', false],
    ]);
  });
});

describe('kidStages', () => {
  it('reads daycare, school and college off the template lines', () => {
    const plan = addChild(basePlan(), { name: 'Kit', birthYear: 2028, options: KID_DEFAULTS });
    const child = plan.participants.find((p) => p.role === 'child')!;
    expect(kidStages(plan, child, 2026, 2090).map((s) => [s.kind, s.from, s.to])).toEqual([
      ['daycare', 2028, 2033],
      ['school', 2033, 2046],
      ['college', 2046, 2050],
    ]);
  });

  it('calls it private school when a private-school line exists', () => {
    const plan = addChild(basePlan(), { name: 'Kit', birthYear: 2028, options: { ...KID_DEFAULTS, school: 'private' } });
    const child = plan.participants.find((p) => p.role === 'child')!;
    expect(kidStages(plan, child, 2026, 2090).find((s) => s.kind === 'school')?.label).toBe('Private school');
  });

  it('skips college when there is none, and clips to the plan', () => {
    const plan = addChild(basePlan(), { name: 'Kit', birthYear: 2020, options: { ...KID_DEFAULTS, college: 'none' } });
    const child = plan.participants.find((p) => p.role === 'child')!;
    const stages = kidStages(plan, child, 2026, 2030);
    expect(stages.map((s) => s.kind)).toEqual(['school']);
    expect(stages[0].from).toBe(2026);
    expect(stages[0].to).toBe(2031);
  });

  it('labels the years before school "Early years" when no childcare line exists', () => {
    const plan = addChild(basePlan(), { name: 'Kit', birthYear: 2028, options: { ...KID_DEFAULTS, childcare: 'parent' } });
    const child = plan.participants.find((p) => p.role === 'child')!;
    expect(kidStages(plan, child, 2026, 2090).map((s) => [s.label, s.from, s.to]).slice(0, 2)).toEqual([
      ['Early years', 2028, 2033],
      ['School', 2033, 2046],
    ]);
  });
});

describe('packChips', () => {
  it('keeps chips that clear each other on one row and stacks the ones that collide', () => {
    const rows = packChips(
      [
        { id: 'a', year: 2026, width: 140 },
        { id: 'b', year: 2027, width: 140 }, // starts 64px on: inside a's chip
        { id: 'c', year: 2031, width: 100 }, // well clear
      ],
      2026,
    );
    expect([rows.get('a'), rows.get('b'), rows.get('c')]).toEqual([0, 1, 0]);
  });
});

describe('verticalYears (the phone list)', () => {
  it('keeps one row per year with something in it, and always today', () => {
    const plan = twoAdults();
    plan.events = [event({ id: 'j', kind: 'job', startYear: 2026, config: { participantId: 'a' } }), event({ id: 'h', kind: 'buyAHome', startYear: 2034 })];
    const rows = verticalYears(buildLanes(plan, 2026, 2060), 2026);
    expect(rows.map((r) => r.year)).toEqual([2026, 2034]);
    expect(rows[1].groups.map((g) => g.lane.id)).toEqual([HOUSEHOLD_LANE]);
  });
});

describe('addAdult', () => {
  it('adds an included adult and falls back to a numbered name', () => {
    const next = addAdult(basePlan(), { name: ' ', birthYear: 1990 });
    const added = next.participants[1];
    expect([added.name, added.role, added.isIncluded, added.birthYear]).toEqual(['Person 2', 'adult', true, 1990]);
  });
});
