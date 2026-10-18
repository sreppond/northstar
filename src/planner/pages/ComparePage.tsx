import { useMemo, useState } from 'react';
import type { Plan } from '@northstar/engine';
import { deflate, runPlan } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { RangePicker, TimeSeriesChart, type ChartSeries } from '../charts';
import { diffOutcomes, diffPlans } from '../diff';
import { money, planMetaLine, signedMoney } from '../format';
import { useBreakpoint } from '../useBreakpoint';
import { DeltaTag, Page, PageHeader, SectionCard } from '../ui';
import { agesLabel, dangerBand, eventMarkers } from './netWorthData';

/**
 * Scenarios (docs/REDESIGN-V5.md §5.6; Q1: kept, retitled from "Compare").
 * Two ways in, matching what comparing means elsewhere in the app: pick
 * another saved plan (a card grid: net worth at horizon, a `DeltaTag` vs the
 * active plan, a sparkline) or start a What-If. Both set the same
 * `compareToPlanId`.
 *
 * Once a plan is chosen the page is one `TimeSeriesChart` with two series and
 * a readout that shows both numbers for the year under the pointer, on the
 * shared range and pinned year, with the active plan's danger band. The
 * other plan is simulated HERE, only while this page is open: it used to be
 * computed for every page on every plan edit (V5-REVIEW-1 D1).
 */
export function ComparePage() {
  const {
    stored,
    plans,
    plan,
    result,
    health,
    focusYear,
    setFocusYear,
    chartRange,
    setChartRange,
    visiblePlans,
    updateSettings,
    startWhatIf,
    keepWhatIf,
    revertWhatIf,
    forkWhatIf,
  } = usePlanner();
  const heroHeight = useBreakpoint() === 'phone' ? 280 : 420;

  const [forking, setForking] = useState(false);
  const [forkName, setForkName] = useState('');

  const comparePlanId = plan.settings.compareToPlanId;
  const comparePlan = useMemo(
    () => (comparePlanId ? plans.find((p) => p.id === comparePlanId) : undefined),
    [plans, comparePlanId],
  );
  const { dollarMode, inflationRate } = plan.settings;
  const compareResult = useMemo(() => {
    if (!comparePlan) return undefined;
    const raw = runPlan(comparePlan);
    return dollarMode === 'todaysDollars' ? deflate(raw, inflationRate) : raw;
  }, [comparePlan, dollarMode, inflationRate]);

  const isWhatIf = Boolean(comparePlan?.isWhatIfSnapshot);
  const otherPlans = visiblePlans.filter((p) => p.id !== stored.id);
  const activeNetWorthAtHorizon = result.years.at(-1)?.netWorth ?? 0;

  // A What-If has a direction: the snapshot is the "before", the live plan the
  // "after". Plan-vs-plan has none, so the active plan leads.
  const activeLabel = isWhatIf ? 'Your edits' : stored.name;
  const otherLabel = isWhatIf ? 'Before' : (comparePlan?.name ?? '');

  const years = useMemo(() => result.years.map((y) => y.year), [result]);
  const series = useMemo<ChartSeries[]>(() => {
    if (!compareResult) return [];
    // The other plan may run longer or shorter: clip to this plan's x-axis,
    // and leave a gap (NaN) where it has no year.
    const byYear = new Map(compareResult.years.map((y) => [y.year, y.netWorth]));
    return [
      { id: 'active', label: activeLabel, color: 'var(--data-nw)', kind: 'area', values: result.years.map((y) => y.netWorth) },
      { id: 'other', label: otherLabel, color: 'var(--cmp)', values: years.map((y) => byYear.get(y) ?? NaN) },
    ];
  }, [compareResult, result, years, activeLabel, otherLabel]);
  const danger = useMemo(() => dangerBand(health, result), [health, result]);
  const markers = useMemo(() => eventMarkers(plan, years), [plan, years]);
  const diffs = useMemo(() => {
    if (!comparePlan || !compareResult) return null;
    // The diff reads its first argument as "current" and its second as "the
    // other one". A What-If swaps them so "OLD → NEW" and "what it costs" read
    // as the edit's effect rather than backwards.
    return isWhatIf
      ? { changes: diffPlans(comparePlan, plan), outcomes: diffOutcomes(compareResult, result) }
      : { changes: diffPlans(plan, comparePlan), outcomes: diffOutcomes(result, compareResult) };
  }, [comparePlan, compareResult, isWhatIf, plan, result]);

  function confirmFork() {
    const name = forkName.trim();
    if (!name) return;
    forkWhatIf(stored.id, name);
    setForkName('');
    setForking(false);
  }

  if (!comparePlan || !compareResult || !diffs) {
    return (
      <Page>
        <PageHeader title="Scenarios" meta={planMetaLine(stored, result.endYear)} />

        <SectionCard
          title="What-If"
          divider={false}
          actions={
            <button type="button" className="ns-btn ns-btn-primary" onClick={() => startWhatIf(stored.id)}>
              Start a What-If
            </button>
          }
        >
          <p className="ns-view-sub">
            Make changes anywhere in the plan and see how they compare to what you have now — nothing is
            committed until you say so, and you can always revert.
          </p>
        </SectionCard>

        {otherPlans.length > 0 && (
          <SectionCard title="Compare against a plan" meta={`${otherPlans.length} other`}>
            <div className="ns-compare-grid">
              {otherPlans.map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  activeEndYear={result.endYear}
                  activeNetWorthAtHorizon={activeNetWorthAtHorizon}
                  onClick={() => updateSettings(stored.id, { compareToPlanId: p.id })}
                />
              ))}
            </div>
          </SectionCard>
        )}
      </Page>
    );
  }

  return (
    <Page className="ns-scn">
      <PageHeader
        title="Scenarios"
        meta={isWhatIf ? `What-If · your edits vs. how ${stored.name} stood before` : `${stored.name} vs. ${comparePlan.name}`}
      />

      <section className="ns-scn-hero" aria-label="Net worth, two scenarios">
        <TimeSeriesChart
          years={years}
          series={series}
          range={chartRange}
          todayYear={result.startYear}
          height={heroHeight}
          focusYear={focusYear}
          onFocusYear={setFocusYear}
          danger={danger}
          onRequestRange={setChartRange}
          markers={markers}
          drawKey={comparePlan.id}
          readout={{
            label: `Net worth · ${activeLabel}`,
            primaryId: 'active',
            agesFor: (year) => agesLabel(plan, result.years.find((y) => y.year === year)),
            actions: <RangePicker value={chartRange} onChange={setChartRange} years={years} openingYear={result.startYear} />,
          }}
          ariaLabel={`Net worth: ${activeLabel} compared with ${otherLabel}`}
        />
      </section>

      {(diffs.changes.length > 0 || diffs.outcomes.length > 0) && (
        <div className="ns-scn-diff">
          {diffs.changes.length > 0 && (
            <div className="ns-scn-diff-col">
              <div className="ns-scn-diff-label">What's different</div>
              <ul className="ns-scn-diff-list">
                {diffs.changes.slice(0, MAX_DIFF_ROWS).map((c, i) => (
                  <li key={i}>{c.sentence}</li>
                ))}
                {diffs.changes.length > MAX_DIFF_ROWS && (
                  <li className="ns-subtle">+{diffs.changes.length - MAX_DIFF_ROWS} more</li>
                )}
              </ul>
            </div>
          )}
          {diffs.outcomes.length > 0 && (
            <div className="ns-scn-diff-col">
              <div className="ns-scn-diff-label">What it costs</div>
              <ul className="ns-scn-diff-list">
                {diffs.outcomes.map((o, i) => (
                  <li key={i}>
                    <span className="ns-scn-diff-outcome">{o.label}</span> {o.sentence}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="ns-compare-actions">
        {isWhatIf ? (
          forking ? (
            <div className="ns-compare-fork-form">
              <input
                className="ns-input"
                placeholder="Name this plan"
                value={forkName}
                onChange={(e) => setForkName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmFork();
                  if (e.key === 'Escape') setForking(false);
                }}
                autoFocus
              />
              <button type="button" className="ns-btn ns-btn-ghost" onClick={() => setForking(false)}>
                Cancel
              </button>
              <button type="button" className="ns-btn ns-btn-primary" disabled={!forkName.trim()} onClick={confirmFork}>
                Save
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="ns-btn ns-btn-ghost" onClick={() => revertWhatIf(stored.id)}>
                Revert changes
              </button>
              <button type="button" className="ns-btn ns-btn-ghost" onClick={() => setForking(true)}>
                Save as new plan
              </button>
              <button type="button" className="ns-btn ns-btn-primary" onClick={() => keepWhatIf(stored.id)}>
                Keep changes
              </button>
            </>
          )
        ) : (
          <button
            type="button"
            className="ns-btn ns-btn-primary"
            onClick={() => updateSettings(stored.id, { compareToPlanId: undefined })}
          >
            Done comparing
          </button>
        )}
      </div>
    </Page>
  );
}

const MAX_DIFF_ROWS = 6;

function PlanCard({
  plan,
  activeEndYear,
  activeNetWorthAtHorizon,
  onClick,
}: {
  plan: Plan;
  activeEndYear: number;
  activeNetWorthAtHorizon: number;
  onClick(): void;
}) {
  const otherResult = useMemo(() => runPlan(plan), [plan]);
  const years = otherResult.years;
  // S14: the sparkline used to run the other plan's FULL 61-year length
  // while the headline value reads at the ACTIVE plan's horizon — a card
  // whose line and number told two different stories. Clip both to the same
  // active-horizon window (falling back to everything this plan modeled,
  // if it's shorter than the active horizon).
  const clippedYears = years.filter((y) => y.year <= activeEndYear);
  const windowed = clippedYears.length > 0 ? clippedYears : years;
  const atActiveHorizon = windowed.at(-1)?.netWorth ?? 0;
  const delta = atActiveHorizon - activeNetWorthAtHorizon;

  return (
    <button type="button" className="ns-compare-card" onClick={onClick}>
      <div className="ns-compare-card-head">
        <span className="ns-compare-card-name">{plan.name}</span>
        <DeltaTag value={signedMoney(delta)} tone={delta >= 0 ? 'in' : 'out'} />
      </div>
      <div className="ns-compare-card-value ns-num">{money(atActiveHorizon)}</div>
      <Sparkline values={windowed.map((y) => y.netWorth)} />
      <div className="ns-compare-card-meta">
        <span>Net worth at {activeEndYear}</span>
        <span>runs to {otherResult.endYear}</span>
      </div>
    </button>
  );
}

/** A bare polyline, no axes or gridlines — the "tiny sparkline" a card asks
    for (docs/REDESIGN-V3.md "Compare"), not a scaled-down chart. */
function Sparkline({ values, color = 'var(--data-nw)' }: { values: number[]; color?: string }) {
  const width = 200;
  const height = 36;
  const pad = 2;
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = values.length <= 1 ? pad : pad + (i / (values.length - 1)) * (width - pad * 2);
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="ns-compare-sparkline" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
