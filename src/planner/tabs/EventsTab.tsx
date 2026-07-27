import type { PlanEvent, PlanResult } from '@northstar/engine';
import { codeFor, summarize, toneFor } from '../presentation';
import { eventDetail } from '../detail';
import { HoverCard } from '../HoverCard';
import { GearIcon } from '../icons';
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
}: {
  events: PlanEvent[];
  result: PlanResult;
  selected: ChartSelection | null;
  onSelect(selection: ChartSelection | null): void;
  onEdit(event: PlanEvent): void;
}) {
  const { startYear, endYear } = result;
  const span = Math.max(1, endYear - startYear);
  const leftFor = (year: number) => ((year - startYear) / span) * 100;

  const tickEvery = Math.max(1, Math.round(span / 5));
  const ticks: number[] = [];
  for (let y = startYear; y <= endYear; y += tickEvery) ticks.push(y);

  // Same filter the chart applies. An event beyond the horizon contributes
  // nothing to the projection, so showing a row with no bar just reads as a
  // rendering bug — and the two views must agree on what is in the plan.
  const visible = events
    .filter((e) => e.isIncluded && !e.isHidden)
    .filter((e) => e.startYear >= startYear && e.startYear <= endYear)
    .slice()
    .sort((a, b) => a.startYear - b.startYear);

  const beyond = events.filter(
    (e) => e.isIncluded && !e.isHidden && e.startYear > endYear,
  ).length;

  return (
    <div className="ns-table-scroll">
      <div className="ns-gantt-head">
        <div>Life events</div>
        <div className="ns-gantt-ticks">
          {ticks.map((year, i) => (
            <div
              key={year}
              className="ns-gantt-tick"
              style={{
                left: `${leftFor(year)}%`,
                // The final tick would hang off the right edge centred.
                ...(i === ticks.length - 1 ? { transform: 'translateX(-100%)' } : {}),
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

        return (
          <div key={event.id} className="ns-gantt-row">
            <div className="ns-gantt-label">
              <HoverCard detail={eventDetail(event)} side="bottom">
                <span className={`ns-code ns-code-${tone}`}>{code}</span>
              </HoverCard>
              <span className="ns-gantt-name" title={event.name}>
                {event.name}
              </span>
              {/* Same contract as the balance sheet: hover for the assumptions,
                  click to edit the very same ones. */}
              <HoverCard detail={eventDetail(event)} side="bottom">
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
              ) : (
                <button
                  type="button"
                  className={`ns-bar ns-bar-${tone}`}
                  title={detail ? `${event.name} · ${event.startYear} · ${detail}` : event.name}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    ...(isSelected ? { outline: '2px solid var(--blue)', outlineOffset: '1px' } : {}),
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
    case 'newJob':
      return Math.min(planEnd, c.endYear ?? planEnd);
    default:
      return planEnd;
  }
}
