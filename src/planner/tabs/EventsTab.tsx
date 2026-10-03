import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Plan, PlanEvent, PlanResult } from '@northstar/engine';
import { codeFor, summarize, toneFor } from '../presentation';
import { eventDetail } from '../detail';
import { HoverCard } from '../HoverCard';
import { GearIcon } from '../icons';
import { IconBadge } from '../IconBadge';
import { Badge, DeltaTag } from '../ui';
import { moneyDelta } from '../ledger';
import { clampYear, quantiseYear } from '../chartMath';
import type { ChartSelection } from '../NetWorthChart';

/** Below this percent-of-track distance from the first tick, the left-anchored
    "TODAY" label (a few chars wider than a bare year) would overlap it. */
const FIRST_TICK_COLLISION_PCT = 8;

/** Same click-vs-drag ambiguity threshold `NetWorthChart`'s own event drag
    uses — a pointer that hasn't moved more than this many px yet is still a
    plain click, not a drag (docs/ROADMAP-10.md C7). */
const DRAG_THRESHOLD_PX = 4;

/**
 * How many years a Gantt drag has moved, from how many px the pointer has
 * moved — pure so the quantization arithmetic is testable without a real
 * pointer event or a measured DOM rect (docs/ROADMAP-10.md C7). DELTA-based
 * rather than absolute-position-based on purpose: the bar can be grabbed
 * anywhere along its own width (its support-window length, say, puts its
 * horizontal center years away from its own start year), so converting the
 * pointer's raw position straight into a year would snap the bar's START to
 * wherever it happened to be grabbed — a jump the instant the drag crosses
 * the click threshold, not a drag from the grabbed point. Tracking the
 * pointer's OWN displacement since drag-start and adding that to the
 * event's original year has no such discontinuity. `pxPerYear` is the
 * track's own measured width ÷ its year span, from `getBoundingClientRect()`
 * at drag start.
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

/** One bar's in-progress drag: pointer capture id (so a second pointer
    can't hijack it), the track's own measured px-per-year (to convert a
    pointer displacement back to a year delta), the year it started at (the
    ghost's position, frozen for the whole gesture) and the live candidate
    year the pointer has dragged it to. `moved` gates the click-vs-drag
    threshold — same shape as `NetWorthChart.tsx`'s `DragState`, just for
    this Gantt's simpler percent-of-track geometry instead of an SVG
    viewBox. */
interface DragState {
  eventId: string;
  pointerId: number;
  pxPerYear: number;
  startClientX: number;
  originYear: number;
  candidateYear: number;
  moved: boolean;
}

/**
 * A Gantt of the plan. Bars span from an event's start year to where its effect
 * ends: a kid's support window, a mortgage term, or the plan horizon.
 */
export function EventsTab({
  events,
  result,
  selected,
  onSelect,
  onEdit,
  onDragCommit,
  impactByEventId,
  plan,
}: {
  events: PlanEvent[];
  result: PlanResult;
  selected: ChartSelection | null;
  onSelect(selection: ChartSelection | null): void;
  onEdit(event: PlanEvent): void;
  /** Fired once, on release or on an arrow-key nudge, only when the event's
      start year actually changed — one call per gesture, so it's one
      `upsertEvent`/one undo entry, the same contract `NetWorthChart.tsx`'s
      own drag uses. */
  onDragCommit(eventId: string, year: number): void;
  /** `|Δ net worth at horizon|` per event, from `NetWorthChart.tsx`'s
      `rankImpact` (docs/ROADMAP-10.md C7 — "each row shows its net-worth
      impact at the horizon"). Unsigned — the sign shown alongside it comes
      from this row's own income/cost tone, since `rankImpact` only ever
      returns a magnitude (see its own doc comment). Optional so a caller
      that hasn't computed it yet just gets no tag. */
  impactByEventId?: Map<string, number>;
  /** Optional — enables the "Referenced by" section on each event's hover card. */
  plan?: Plan;
}) {
  const { startYear, endYear } = result;
  const span = Math.max(1, endYear - startYear);
  const leftFor = (year: number) => ((year - startYear) / span) * 100;
  const todayX = leftFor(todayYearFraction(plan, startYear));

  const [drag, setDrag] = useState<DragState | null>(null);
  // A real drag's pointerup fires a click right after it — this swallows
  // that one click so releasing a drag never also opens the editor or
  // toggles the chart selection (same trick `NetWorthChart.tsx` uses).
  const suppressClickRef = useRef(false);

  const startDrag = (e: ReactPointerEvent<HTMLButtonElement>, event: PlanEvent) => {
    const track = e.currentTarget.parentElement;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      eventId: event.id,
      pointerId: e.pointerId,
      pxPerYear: rect.width / span,
      startClientX: e.clientX,
      originYear: event.startYear,
      candidateYear: event.startYear,
      moved: false,
    });
  };

  const handleDragMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startClientX;
    if (!drag.moved && Math.abs(dx) <= DRAG_THRESHOLD_PX) return; // still ambiguous with a click

    const candidateYear = yearFromDragDelta(dx, drag.pxPerYear, drag.originYear, startYear, endYear);
    setDrag({ ...drag, moved: true, candidateYear });
  };

  const releaseCapture = (e: ReactPointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Already released.
    }
  };

  const handleDragEnd = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    releaseCapture(e);
    if (drag.moved) {
      if (drag.candidateYear !== drag.originYear) onDragCommit(drag.eventId, drag.candidateYear);
      // `click` fires synchronously right after `pointerup`, before this
      // timeout runs, so the flag is still `true` when the click handler
      // below checks it.
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    setDrag(null);
  };

  const handleDragCancel = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!drag || drag.pointerId !== e.pointerId) return;
    releaseCapture(e);
    setDrag(null);
  };

  const tickEvery = Math.max(1, Math.round(span / 5));
  const ticks: number[] = [];
  for (let y = startYear; y <= endYear; y += tickEvery) ticks.push(y);

  // Same range the chart applies, but — unlike the chart, which only ever
  // plots what's actually in the projection — an EXCLUDED event still gets a
  // row here, dimmed with a Badge (docs/REDESIGN-V3.md "Events" — "include
  // /exclude state visible"), since this is the one place include/exclude
  // is actually set.
  const visible = events
    .filter((e) => !e.isHidden)
    .filter((e) => e.startYear >= startYear && e.startYear <= endYear)
    .slice()
    .sort((a, b) => a.startYear - b.startYear);

  const beyond = events.filter(
    (e) => e.isIncluded && !e.isHidden && e.startYear > endYear,
  ).length;

  return (
    <div className="ns-table-scroll">
      <div className="ns-gantt-head">
        {/* The SectionCard above already titles this "Life timeline" — this
            column header just needs to say what its own rows are. */}
        <div>Event</div>
        <div className="ns-gantt-ticks">
          {/* The dashed TODAY line runs down every row's track below, but the
              label only needs to appear once, at the top (REVIEW.md S19). */}
          <span className="ns-gantt-today-label" style={{ left: `${todayX}%` }}>
            Today
          </span>
          {ticks.map((year, i) => (
            <div
              key={year}
              className="ns-gantt-tick"
              style={{
                left: `${leftFor(year)}%`,
                // The first and last ticks would hang off their respective
                // edges if centred like the interior ticks.
                ...(i === 0
                  ? { transform: 'translateX(0)' }
                  : i === ticks.length - 1
                    ? { transform: 'translateX(-100%)' }
                    : {}),
              }}
            >
              {/* An as-of date near the start of the plan puts TODAY within a
                  few percent of this first tick, close enough that the two
                  left-anchored labels overlap. TODAY already says what this
                  tick would, so drop the redundant year instead of the more
                  useful label (docs/ROADMAP-10.md C1, "TODAY collides with
                  the first tick"). */}
              {i === 0 && todayX < FIRST_TICK_COLLISION_PCT ? null : year}
            </div>
          ))}
        </div>
      </div>

      {visible.length === 0 && <div className="ns-empty">No events in this plan yet.</div>}

      {visible.map((event) => {
        const tone = toneFor(event.kind);
        const code = codeFor(event.kind);
        const detail = summarize(event);
        const until = spanEnd(event, endYear);
        const left = leftFor(event.startYear);
        const width = Math.max(2, leftFor(until) - left);
        const isSelected = selected?.eventId === event.id;
        const excluded = !event.isIncluded;
        const draggable = tone !== 'end' && !excluded;
        const isDragging = drag?.eventId === event.id;
        // Live position while dragging THIS row's bar — every other row
        // (and this one, at rest) just uses its own real `left`/`width`.
        const liveLeft = isDragging ? leftFor(drag!.candidateYear) : left;
        const liveUntil = isDragging ? spanEnd({ ...event, startYear: drag!.candidateYear }, endYear) : until;
        const liveWidth = isDragging ? Math.max(2, leftFor(liveUntil) - liveLeft) : width;

        const impact = impactByEventId?.get(event.id);
        // `rankImpact` only ever returns a magnitude (see its own doc
        // comment) — the sign shown here is this row's own income/cost
        // tone, the same convention `IconBadge`/the pin colours already use,
        // not a second re-run of the plan just to recover a sign.
        const signedImpact = impact === undefined ? undefined : tone === 'cost' ? -impact : impact;
        const impactDelta = tone === 'end' ? undefined : moneyDelta(signedImpact);

        // The whole label opens the editor, not just its gear
        // (docs/REDESIGN-V3.md "Events" — "make each row a button that
        // opens the editor"). A `div` rather than a real `<button>` because
        // it wraps one already (the gear) — nesting buttons isn't valid
        // HTML; the click still bubbles up from the gear either way.
        const openEditor = () => onEdit(event);

        return (
          <div key={event.id} className="ns-gantt-row" data-excluded={excluded || undefined}>
            <div
              className="ns-gantt-label ns-row-clickable"
              role="button"
              tabIndex={0}
              onClick={openEditor}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openEditor();
                  return;
                }
                // ←/→ nudges the event a year at a time (docs/ROADMAP-10.md
                // C7) — the same commit path a drag's release uses, just one
                // year per keypress instead of wherever the pointer landed.
                if (draggable && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                  e.preventDefault();
                  const nextYear = clampYear(
                    event.startYear + (e.key === 'ArrowLeft' ? -1 : 1),
                    startYear,
                    endYear,
                  );
                  if (nextYear !== event.startYear) onDragCommit(event.id, nextYear);
                }
              }}
            >
              <HoverCard detail={eventDetail(event, plan)} side="bottom">
                <IconBadge kind={event.kind} tone={tone} />
              </HoverCard>
              <span className="ns-gantt-name" title={event.name}>
                {event.name}
              </span>
              {excluded && <Badge tone="neutral">Excluded</Badge>}
              {impactDelta && <DeltaTag value={impactDelta.value} tone={impactDelta.tone} />}
              {/* Same contract as the balance sheet: hover for the assumptions,
                  click to edit the very same ones. */}
              <HoverCard detail={eventDetail(event, plan)} side="bottom">
                <button
                  type="button"
                  className="ns-gear"
                  aria-label={`${event.name} settings`}
                  onClick={() => onEdit(event)}
                >
                  <GearIcon />
                </button>
              </HoverCard>
            </div>
            <div className="ns-gantt-track">
              <div className="ns-gantt-today" style={{ left: `${todayX}%` }} aria-hidden />
              {ticks.map((year) => (
                <div
                  key={year}
                  className="ns-gantt-gridline"
                  style={{ left: `${leftFor(year)}%` }}
                />
              ))}

              {/* The drag ghost — frozen at the bar's ORIGINAL position for
                  the whole gesture, so there's always a visible answer to
                  "where did this start." */}
              {isDragging && (
                <div
                  className={`ns-bar ns-bar-${tone} ns-bar-ghost`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  aria-hidden
                >
                  {event.startYear}
                </div>
              )}

              {tone === 'end' ? (
                <div className="ns-bar ns-bar-end" style={{ left: `${left}%` }}>
                  {event.startYear} · {detail}
                </div>
              ) : excluded ? (
                <div
                  className={`ns-bar ns-bar-${tone}`}
                  title={detail ? `${event.name} · ${event.startYear} · ${detail} · excluded` : `${event.name} · excluded`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                >
                  {event.startYear}
                  {detail && width >= 8 ? ` · ${detail}` : ''}
                </div>
              ) : (
                <button
                  type="button"
                  className={`ns-bar ns-bar-${tone}${isDragging ? ' ns-bar-live' : ''}`}
                  title={detail ? `${event.name} · ${event.startYear} · ${detail}` : event.name}
                  style={{
                    left: `${liveLeft}%`,
                    width: `${liveWidth}%`,
                    ...(isSelected ? { outline: '2px solid var(--accent)', outlineOffset: '1px' } : {}),
                  }}
                  onPointerDown={(e) => startDrag(e, event)}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragCancel}
                  onClick={() => {
                    if (suppressClickRef.current) return;
                    onSelect(
                      isSelected
                        ? null
                        : {
                            eventId: event.id,
                            label: event.name,
                            year: event.startYear,
                            detail,
                            tone,
                            code,
                          },
                    );
                  }}
                >
                  {/* A short bar cannot hold the detail; showing it just leaves
                      a clipped "2026 ·" dangling. The title carries it instead. */}
                  {isDragging ? drag!.candidateYear : event.startYear}
                  {!isDragging && detail && width >= 8 ? ` · ${detail}` : ''}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {beyond > 0 && (
        <div className="ns-empty">
          {beyond} event{beyond > 1 ? 's' : ''} start after the plan ends in {endYear} and are not
          projected.
        </div>
      )}
    </div>
  );
}

/**
 * TODAY as a fractional year (docs/REDESIGN-V3.md "Events" — "add a dotted
 * TODAY line") — the projection's first year is never an estimate, but a
 * plan can still start PARTWAY through it (`plan.settings.asOfDate`,
 * docs/PLAN.md §4.3), so the honest mark is `startYear` plus how much of
 * that calendar year has already elapsed, not the tick itself (which would
 * sit right on top of the track's own left border and mark nothing).
 * Computed in UTC for the same reason `format.ts`'s `asOfDateLabel` is — a
 * bare date string parsed with `new Date(str)` renders a day early for
 * anyone west of Greenwich.
 */
function todayYearFraction(plan: Plan | undefined, startYear: number): number {
  const asOf = plan?.settings.asOfDate;
  if (!asOf) return startYear;
  const [y, m, d] = asOf.split('-').map(Number);
  if (y !== startYear) return startYear;
  const dayOfYear = (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000;
  const daysInYear = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86_400_000;
  return startYear + dayOfYear / daysInYear;
}

/** How far an event's effect reaches, for the bar width. */
function spanEnd(event: PlanEvent, planEnd: number): number {
  const c = (event.config ?? {}) as Record<string, number | undefined>;
  switch (event.kind) {
    case 'haveAKid':
      return Math.min(planEnd, event.startYear + (c.supportYears ?? 18) - 1);
    case 'buyAHome':
      return Math.min(planEnd, c.sellYear ?? planEnd);
    case 'careerBreak':
      return Math.min(planEnd, event.startYear + (c.durationYears ?? 1));
    case 'otherExpense':
    case 'windfall':
      return Math.min(planEnd, event.startYear + 1);
    case 'income':
    case 'annualExpense':
    case 'job':
    case 'newJob':
      return Math.min(planEnd, c.endYear ?? planEnd);
    default:
      return planEnd;
  }
}
