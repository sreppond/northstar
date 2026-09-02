import { headlineReturnRate } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { HoverCard } from '../HoverCard';
import { planDetail } from '../detail';
import { AnimatedFigure } from '../AnimatedFigure';
import { DataBanner } from '../DataBanner';
import { NetWorthChart } from '../NetWorthChart';
import { money, percent } from '../format';

/**
 * The hero + chart-as-spine (docs/REDESIGN.md §4.1) — what used to be the
 * `view === 'netWorth'` branch of `Planner()` before the sidebar/multi-page
 * port. The ledger (Accounts / Cash Flow / Events) moved out to its own
 * top-level pages; everything else here is unchanged.
 */
export function OverviewPage() {
  const {
    plan,
    result,
    stored,
    reading,
    heroFigure,
    compare,
    spreadAtEnd,
    showFan,
    toggleFan,
    fan,
    markers,
    selected,
    setSelected,
    setScrubYear,
    setDragDraft,
    editor,
    upsertEvent,
    setAssumptionsDraft,
    monarch,
  } = usePlanner();

  return (
    <>
      <section className="ns-card">
        <div className="ns-hero-actions">
          <HoverCard detail={planDetail(plan, result.endYear)} side="bottom">
            <button
              type="button"
              className="ns-btn"
              onClick={() => setAssumptionsDraft(structuredClone(stored))}
            >
              Edit assumptions
            </button>
          </HoverCard>
          <button type="button" className="ns-btn ns-btn-primary" onClick={editor.startNew}>
            + Add event
          </button>
        </div>

        <DataBanner
          status={monarch.status}
          busy={monarch.busy}
          onConnect={monarch.openConnect}
          onRefresh={() => void monarch.refresh()}
        />

        <div className="ns-hero">
          <AnimatedFigure className="ns-hero-figure" value={money(heroFigure)} />
          <p className="ns-hero-read">{reading.read}</p>

          {spreadAtEnd && !reading.isAlarm && (
            <button
              type="button"
              className="ns-hero-risk"
              aria-pressed={showFan}
              onClick={toggleFan}
            >
              Between <b>{money(spreadAtEnd.low)}</b> and <b>{money(spreadAtEnd.high)}</b>{' '}
              depending on how markets run.
            </button>
          )}
        </div>
      </section>

      <section className="ns-spine">
        <NetWorthChart
          result={result}
          plan={plan}
          rateLabel={percent(headlineReturnRate(plan) ?? 0)}
          selected={selected}
          compare={compare}
          fan={fan}
          markers={markers}
          canFan={headlineReturnRate(plan) !== undefined}
          onToggleFan={toggleFan}
          onSelect={setSelected}
          onScrubYear={setScrubYear}
          onDragPreview={setDragDraft}
          onDragCommit={(eventId, year) => {
            const event = stored.events.find((e) => e.id === eventId);
            if (event) upsertEvent(stored.id, { ...event, startYear: year });
          }}
        />

        <div className="ns-selection">
          {selected ? (
            <>
              <span className={`ns-ref${selected.tone === 'cost' ? ' ns-ref-cost' : ''}`}>
                {selected.code}
              </span>
              <span className="ns-selection-label">{selected.label}</span>
              <span className="ns-subtle ns-num">
                {selected.year}
                {selected.detail ? ` · ${selected.detail}` : ''}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="ns-btn-ghost"
                  onClick={() => {
                    const event = stored.events.find((e) => e.id === selected.eventId);
                    if (event) editor.edit(event);
                  }}
                >
                  Edit
                </button>
                <button type="button" className="ns-btn-ghost" onClick={() => setSelected(null)}>
                  Clear
                </button>
              </div>
            </>
          ) : (
            <span className="ns-hint">
              Hover the chart for any year, or tap an event marker to see its details.
            </span>
          )}
        </div>

        {result.warnings.length > 0 && (
          <div className="ns-warning">
            <strong>{result.warnings.length} warning{result.warnings.length > 1 ? 's' : ''}:</strong>
            <span>{result.warnings[0]}</span>
          </div>
        )}
      </section>
    </>
  );
}
