import type { Plan, PlanEvent, PlanResult } from '@northstar/engine';
import { codeFor, summarize, toneFor } from '../presentation';
import { eventDetail } from '../detail';
import { HoverCard } from '../HoverCard';
import { GearIcon } from '../icons';
import { IconBadge } from '../IconBadge';
import { Badge } from '../ui';
import type { ChartSelection } from '../NetWorthChart';

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
  plan,
}: {
  events: PlanEvent[];
  result: PlanResult;
  selected: ChartSelection | null;
  onSelect(selection: ChartSelection | null): void;
  onEdit(event: PlanEvent): void;
  /** Optional — enables the "Referenced by" section on each event's hover card. */
  plan?: Plan;
}) {
  const { startYear, endYear } = result;
  const span = Math.max(1, endYear - startYear);
  const leftFor = (year: number) => ((year - startYear) / span) * 100;
  const todayX = leftFor(todayYearFraction(plan, startYear));

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
              {year}
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
                  className={`ns-bar ns-bar-${tone}`}
                  title={detail ? `${event.name} · ${event.startYear} · ${detail}` : event.name}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    ...(isSelected ? { outline: '2px solid var(--accent)', outlineOffset: '1px' } : {}),
                  }}
                  onClick={() =>
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
                    )
                  }
                >
                  {/* A short bar cannot hold the detail; showing it just leaves
                      a clipped "2026 ·" dangling. The title carries it instead. */}
                  {event.startYear}
                  {detail && width >= 8 ? ` · ${detail}` : ''}
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
