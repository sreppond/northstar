/**
 * The data behind the Timeline page (docs/REDESIGN-V5.md §5.4), kept pure so
 * lane assignment, stage derivation, label packing and the drag arithmetic
 * are testable without a DOM.
 *
 * A lane is one person's slice of the plan: an adult's working life and the
 * events that are theirs, the household's shared milestones, or a child's
 * stages from birth to college. The page only draws what this returns.
 */
import type { Anchor, Participant, Plan, PlanEvent } from '@northstar/engine';
import { resolveAnchor } from '@northstar/engine';
import { careerSegments, type CareerSegment } from './caregiving';
import { clampYear, packLabelLanes, quantiseYear } from './chartMath';
import { money } from './format';
import { toneFor, type EventTone } from './presentation';

/** One year's column width (§5.4: "64px / year"). */
export const YEAR_PX = 64;

/** Same click-vs-drag ambiguity threshold `NetWorthChart`'s own event drag
    uses: a pointer that hasn't moved more than this many px yet is still a
    plain click, not a drag (docs/ROADMAP-10.md C7). */
export const DRAG_THRESHOLD_PX = 4;

/**
 * How many years a drag has moved an event, from how many px the pointer has
 * moved. Ported from the old Gantt (`EventsTab.tsx`, docs/ROADMAP-10.md C7).
 * DELTA-based rather than absolute-position-based on purpose: a pointer that
 * grabbed the label's far end would otherwise snap the event's year to
 * wherever it happened to be grabbed, a jump the instant the drag crosses the
 * click threshold. Tracking the pointer's OWN displacement since drag-start
 * and adding that to the event's original year has no such discontinuity.
 * `pxPerYear` is `YEAR_PX` here; it stays a parameter so the arithmetic is
 * testable with any scale.
 */
export function yearFromDragDelta(
  deltaClientX: number,
  pxPerYear: number,
  originYear: number,
  startYear: number,
  endYear: number,
): number {
  const deltaYears = pxPerYear > 0 ? deltaClientX / pxPerYear : 0;
  return clampYear(quantiseYear(originYear + deltaYears), startYear, endYear);
}

export type LaneKind = 'adult' | 'household' | 'child';
export const HOUSEHOLD_LANE = 'household';

export interface LaneEvent {
  event: PlanEvent;
  tone: EventTone;
  shape: 'dot' | 'diamond';
  /** Switched off in the plan: drawn dimmed and hollow, can't be dragged. */
  excluded: boolean;
  draggable: boolean;
  /** Whose is it? Shown as a small "Who?" on the label (§5.4). */
  needsOwner: boolean;
}

export interface StageSegment {
  kind: 'daycare' | 'school' | 'college';
  label: string;
  from: number;
  /** Exclusive. */
  to: number;
}

export interface Lane {
  id: string;
  kind: LaneKind;
  person?: Participant;
  career: CareerSegment[];
  stages: StageSegment[];
  events: LaneEvent[];
  /** A child's birth year, when it falls inside the plan's years. */
  birthYear?: number;
}

/** Event kinds that belong to a person's working life. */
const OWNED_KINDS = new Set<PlanEvent['kind']>(['job', 'newJob', 'income', 'careerBreak', 'socialSecurity', 'retirement']);
const DIAMOND_KINDS = new Set<PlanEvent['kind']>(['retirement', 'buyAHome', 'haveAKid', 'endOfPlan', 'careerBreak']);

/**
 * Which lane an event lives on (§5.4):
 *  - owned kinds (`job`, `income`, `careerBreak`, `socialSecurity`,
 *    `retirement`) go to their `participantId`'s lane. Retirement does carry a
 *    `participantId`, so it follows the same rule, and Household is only the
 *    fallback when it has none.
 *  - `haveAKid` goes to the child it created, when there is one.
 *  - everything else, and anything unassigned, goes to Household.
 * A plan with a single adult has no ambiguity about whose pay it is, so an
 * unassigned owned event lands on that adult, the same call
 * `household.ts`'s migration makes. That is the one place this differs from
 * "unassigned goes to Household".
 */
export function laneIdFor(event: PlanEvent, adults: Participant[], kids: Participant[]): { laneId: string; needsOwner: boolean } {
  const pid = (event.config as { participantId?: string } | undefined)?.participantId;
  if (OWNED_KINDS.has(event.kind)) {
    if (pid && adults.some((a) => a.id === pid)) return { laneId: pid, needsOwner: false };
    if (adults.length === 1) return { laneId: adults[0].id, needsOwner: false };
    return { laneId: HOUSEHOLD_LANE, needsOwner: adults.length > 1 && event.kind !== 'retirement' };
  }
  if (event.kind === 'haveAKid') {
    const kid = kids.find((k) => k.id === `kid-${event.id}`) ?? kids.find((k) => k.name === event.name && k.birthYear === event.startYear);
    if (kid) return { laneId: kid.id, needsOwner: false };
  }
  return { laneId: HOUSEHOLD_LANE, needsOwner: false };
}

export function buildLanes(plan: Plan, startYear: number, endYear: number): Lane[] {
  const people = plan.participants.filter((p) => p.isIncluded);
  const adults = people.filter((p) => p.role !== 'child');
  const kids = people.filter((p) => p.role === 'child').sort((a, b) => a.birthYear - b.birthYear);

  const lanes: Lane[] = [
    ...adults.map<Lane>((person) => ({
      id: person.id,
      kind: 'adult',
      person,
      career: careerSegments(plan, person.id, startYear, endYear),
      stages: [],
      events: [],
    })),
    { id: HOUSEHOLD_LANE, kind: 'household', career: [], stages: [], events: [] },
    ...kids.map<Lane>((person) => ({
      id: person.id,
      kind: 'child',
      person,
      career: [],
      stages: kidStages(plan, person, startYear, endYear),
      events: [],
      birthYear: person.birthYear >= startYear && person.birthYear <= endYear ? person.birthYear : undefined,
    })),
  ];
  const byId = new Map(lanes.map((l) => [l.id, l]));

  const events = plan.events
    .filter((e) => !e.isHidden && e.startYear >= startYear && e.startYear <= endYear)
    .slice()
    .sort((a, b) => a.startYear - b.startYear);
  for (const event of events) {
    const { laneId, needsOwner } = laneIdFor(event, adults, kids);
    // A job that has its own bar on the lane is that bar: a chip beside it
    // would say the same thing twice. One with no bar (switched off) stays.
    if ((event.kind === 'job' || event.kind === 'newJob') && byId.get(laneId)?.career.some((c) => c.eventId === event.id)) continue;
    const tone = toneFor(event.kind);
    const excluded = !event.isIncluded;
    (byId.get(laneId) ?? byId.get(HOUSEHOLD_LANE)!).events.push({
      event,
      tone,
      shape: DIAMOND_KINDS.has(event.kind) ? 'diamond' : 'dot',
      excluded,
      draggable: tone !== 'end' && !excluded,
      needsOwner,
    });
  }
  return lanes;
}

/**
 * A child's stages from their budget lines' anchors (§5.4). The template in
 * `kids.ts` writes childcare from birth to 5, optional private school from 5,
 * and college from 18; public school has no line of its own, so school is the
 * stretch between the two. A child with no lines at all has no stages to
 * draw. Lines the user wrote by hand work too: it only reads categories and
 * resolved years.
 */
export function kidStages(plan: Plan, child: Participant, startYear: number, endYear: number): StageSegment[] {
  const scope = { events: plan.events, participants: plan.participants };
  const lines = (plan.budget ?? []).filter((l) => l.owner === child.id && l.isIncluded && l.kind === 'expense' && l.cadence === 'monthly');
  if (lines.length === 0) return [];

  const span = (l: (typeof lines)[number], fallbackLen: number) => {
    const from = l.from ? resolveAnchor(l.from as Anchor, scope) : undefined;
    const start = from ?? child.birthYear;
    const until = l.until ? resolveAnchor(l.until as Anchor, scope) : undefined;
    return { from: start, to: until ?? start + fallbackLen };
  };
  const hull = (spans: { from: number; to: number }[]) => ({
    from: Math.min(...spans.map((s) => s.from)),
    to: Math.max(...spans.map((s) => s.to)),
  });

  const care = lines.filter((l) => l.category === 'childcare').map((l) => span(l, 5)).filter((s) => s.from < child.birthYear + 5);
  const education = lines.filter((l) => l.category === 'education').map((l) => ({ line: l, ...span(l, 4) }));
  const college = education.filter((s) => s.from >= child.birthYear + 16);
  const privateSchool = education.some((s) => s.from < child.birthYear + 16);

  const out: StageSegment[] = [];
  let schoolFrom = child.birthYear + 5;
  if (care.length > 0) {
    const h = hull(care);
    const named = lines.find((l) => l.category === 'childcare');
    const label = named?.name.includes('—') ? named.name.split('—').pop()!.trim() : 'Childcare';
    out.push({ kind: 'daycare', label: label.charAt(0).toUpperCase() + label.slice(1), from: h.from, to: h.to });
    schoolFrom = h.to;
  } else {
    // No childcare line (a parent at home, or costs that arrived as one
    // lump): the years before school still deserve a stretch of their own.
    out.push({ kind: 'daycare', label: 'Early years', from: child.birthYear, to: schoolFrom });
  }
  const collegeSpan = college.length > 0 ? hull(college) : undefined;
  const schoolTo = collegeSpan?.from ?? child.birthYear + 18;
  if (schoolTo > schoolFrom) {
    out.push({ kind: 'school', label: privateSchool ? 'Private school' : 'School', from: schoolFrom, to: schoolTo });
  }
  if (collegeSpan) out.push({ kind: 'college', label: 'College', from: collegeSpan.from, to: collegeSpan.to });

  return out
    .map((s) => ({ ...s, from: Math.max(startYear, s.from), to: Math.min(endYear + 1, s.to) }))
    .filter((s) => s.to > s.from);
}

/** A new adult for the plan. Everyone else's life expectancy is the best guess for theirs. */
export function addAdult(plan: Plan, input: { name: string; birthYear: number }): Plan {
  const adults = plan.participants.filter((p) => p.role !== 'child');
  const id = `adult-${Math.random().toString(36).slice(2, 8)}`;
  return {
    ...plan,
    participants: [
      ...plan.participants,
      {
        id,
        name: input.name.trim() || `Person ${adults.length + 1}`,
        birthYear: input.birthYear,
        lifeExpectancy: adults[0]?.lifeExpectancy ?? 95,
        isIncluded: true,
        role: 'adult',
      },
    ],
  };
}

// --- label packing -----------------------------------------------------------

/** Geometry of one event's chip, kept in step with `.tl-event` in timeline.css. */
const CHIP_LEAD = 11; // px from the chip's left edge to the dot's centre
const CHIP_CHROME = 33; // padding + dot + gap, everything except the text
const PACK_GAP = 4;

let measureCtx: CanvasRenderingContext2D | null | undefined;
function measure(text: string): number {
  if (measureCtx === undefined) {
    measureCtx =
      typeof document === 'undefined' ? null : (document.createElement('canvas').getContext('2d') ?? null);
    if (measureCtx) measureCtx.font = '500 13px -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
  }
  return measureCtx ? measureCtx.measureText(text).width : text.length * 6.7;
}

/** The short figure that rides beside a name: a price or an amount. */
export function eventDetail(event: PlanEvent): string {
  const c = (event.config ?? {}) as Record<string, number | undefined>;
  switch (event.kind) {
    case 'buyAHome':
      return c.price ? money(c.price) : '';
    case 'windfall':
    case 'otherExpense':
      return c.amount ? money(c.amount) : '';
    case 'job':
    case 'newJob':
      return c.salary ? `${money(c.salary)}/yr` : '';
    case 'income':
    case 'annualExpense':
      return c.amount ? `${money(c.amount)}/yr` : '';
    default:
      return '';
  }
}

export function chipWidth(name: string, detail: string, extra = ''): number {
  const text = [name, detail, extra].filter(Boolean).join('  ');
  return CHIP_CHROME + Math.ceil(measure(text));
}

/**
 * Stacks a lane's chips into rows so none overlap (§5.4), using the same
 * packer the old net-worth chart used for its pin labels. Items must arrive
 * sorted by year; the result is a row index per id.
 */
export function packChips(
  items: { id: string; year: number; width: number }[],
  firstYear: number,
): Map<string, number> {
  const packed = packLabelLanes(
    items.map((i) => {
      const left = (i.year - firstYear) * YEAR_PX + YEAR_PX / 2 - CHIP_LEAD;
      return { id: i.id, x: left + i.width / 2, width: i.width };
    }),
    PACK_GAP,
  );
  return new Map(packed.map((p) => [p.id, p.lane]));
}

/** Left edge of a year's column. */
export const columnLeft = (year: number, firstYear: number) => (year - firstYear) * YEAR_PX;
/** Left edge of an event chip, so its dot sits at the column's centre. */
export const chipLeft = (year: number, firstYear: number) => columnLeft(year, firstYear) + YEAR_PX / 2 - CHIP_LEAD;

// --- the phone's vertical list ---------------------------------------------

export type VerticalItem =
  | { type: 'event'; key: string; label: string; detail: string; event: LaneEvent }
  | { type: 'career'; key: string; label: string; detail: string; segment: CareerSegment }
  | { type: 'stage'; key: string; label: string; detail: string; stage: StageSegment }
  | { type: 'birth'; key: string; label: string; detail: string };

export interface VerticalGroup {
  lane: Lane;
  items: VerticalItem[];
}
export interface VerticalYear {
  year: number;
  groups: VerticalGroup[];
}

const MODE_WORD: Record<CareerSegment['mode'], string> = {
  full: 'Full-time',
  part: 'Part-time',
  leave: 'Leave',
  off: 'Not working',
};

/**
 * One row per year that has something in it, grouped by person (§5.4,
 * "Phone"). Today's row is always there so the list has an anchor, and
 * `alsoYears` forces rows that carry a mark of their own (the year it runs dry).
 */
export function verticalYears(lanes: Lane[], todayYear: number, alsoYears: number[] = []): VerticalYear[] {
  const byYear = new Map<number, Map<string, VerticalGroup>>();
  const add = (year: number, lane: Lane, item: VerticalItem) => {
    const groups = byYear.get(year) ?? new Map<string, VerticalGroup>();
    const group = groups.get(lane.id) ?? { lane, items: [] };
    group.items.push(item);
    groups.set(lane.id, group);
    byYear.set(year, groups);
  };
  for (const lane of lanes) {
    for (const seg of lane.career) {
      // "Part-time 60%" already says it; don't say "Part-time" again beside it.
      const word = seg.label.toLowerCase().startsWith(MODE_WORD[seg.mode].toLowerCase()) ? '' : MODE_WORD[seg.mode];
      add(seg.from, lane, { type: 'career', key: `c-${seg.eventId}-${seg.from}`, label: seg.label, detail: word, segment: seg });
    }
    for (const stage of lane.stages) {
      add(stage.from, lane, { type: 'stage', key: `s-${lane.id}-${stage.kind}`, label: stage.label, detail: 'starts', stage });
    }
    if (lane.birthYear !== undefined) add(lane.birthYear, lane, { type: 'birth', key: `b-${lane.id}`, label: 'Born', detail: '' });
    for (const ev of lane.events) {
      add(ev.event.startYear, lane, { type: 'event', key: `e-${ev.event.id}`, label: ev.event.name, detail: eventDetail(ev.event), event: ev });
    }
  }
  for (const y of [todayYear, ...alsoYears]) if (!byYear.has(y)) byYear.set(y, new Map());
  return [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, groups]) => ({
      year,
      groups: [...groups.values()].sort((a, b) => lanes.indexOf(a.lane) - lanes.indexOf(b.lane)),
    }));
}
