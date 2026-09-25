import { useMemo, useState } from 'react';
import type { Plan } from '@northstar/engine';
import { headlineReturnRate, runPlan } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { NetWorthChart } from '../NetWorthChart';
import { CompareDiff } from '../CompareDiff';
import { detailMoney, percent, planMetaLine, signedMoney } from '../format';
import { DeltaTag, Page, PageHeader, SectionCard } from '../ui';

/**
 * Two ways to compare, matching the two things "compare" means elsewhere in
 * the app: pick another saved plan — now a grid of cards (name, net worth
 * at horizon, a `DeltaTag` vs the active plan, a tiny sparkline of its own
 * trajectory) rather than a row of plain buttons — or start a What-If,
 * given its own prominent `SectionCard` since it's the more-used path.
 * Clicking a card and starting a What-If both end up setting the exact same
 * `compareToPlanId`, so the chart's dashed line and `CompareDiff`'s two
 * lists work unchanged either way; the compare/diff flow itself (below)
 * keeps its existing shape entirely.
 */
export function ComparePage() {
  const {
    stored,
    plan,
    result,
    comparePlan,
    compare,
    markers,
    visiblePlans,
    updateSettings,
    startWhatIf,
    keepWhatIf,
    revertWhatIf,
    forkWhatIf,
  } = usePlanner();

  const [forking, setForking] = useState(false);
  const [forkName, setForkName] = useState('');

  const isWhatIf = Boolean(comparePlan?.isWhatIfSnapshot);
  const otherPlans = visiblePlans.filter((p) => p.id !== stored.id);
  const activeNetWorthAtHorizon = result.years.at(-1)?.netWorth ?? 0;

  function confirmFork() {
    const name = forkName.trim();
    if (!name) return;
    forkWhatIf(stored.id, name);
    setForkName('');
    setForking(false);
  }

  if (!comparePlan || !compare) {
    return (
      <Page>
        <PageHeader title="Compare" meta={planMetaLine(stored, result.endYear)} />

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
    <Page>
      <PageHeader title="Compare" meta={planMetaLine(stored, result.endYear)} />

      <SectionCard
        title={isWhatIf ? 'What-If' : 'Comparing plans'}
        meta={
          isWhatIf
            ? `Your edits vs. how ${stored.name} stood before`
            : `${stored.name} vs. ${comparePlan.name}`
        }
      >
        <NetWorthChart
          plan={plan}
          result={result}
          rateLabel={percent(headlineReturnRate(plan) ?? 0)}
          selected={null}
          compare={compare}
          fan={undefined}
          markers={markers}
          canFan={false}
          onToggleFan={() => {}}
          onSelect={() => {}}
          onScrubYear={() => {}}
          onDragPreview={() => {}}
          onDragCommit={() => {}}
        />

        {/* CompareDiff reads its first argument as "current" and its second as
            "the other one" — for a read-only plan-vs-plan comparison that's an
            arbitrary choice, but a What-If has a real direction: the snapshot
            IS the "before", the live plan IS the "after". Swapped so "moves
            OLD → NEW" and "what it costs" both read as the edit's effect,
            rather than backwards. */}
        {isWhatIf ? (
          <CompareDiff plan={comparePlan} comparePlan={plan} result={compare.result} compareResult={result} />
        ) : (
          <CompareDiff plan={plan} comparePlan={comparePlan} result={result} compareResult={compare.result} />
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
                <button
                  type="button"
                  className="ns-btn ns-btn-primary"
                  disabled={!forkName.trim()}
                  onClick={confirmFork}
                >
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
      </SectionCard>
    </Page>
  );
}

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
      <div className="ns-compare-card-value ns-num">{detailMoney(atActiveHorizon)}</div>
      <Sparkline values={windowed.map((y) => y.netWorth)} />
      <div className="ns-compare-card-meta">
        <span>Net worth at {activeEndYear}</span>
        <span>runs to {otherResult.endYear}</span>
      </div>
    </button>
  );
}

/** A bare polyline, no axes or gridlines — the "tiny sparkline" a Compare
    card asks for (docs/REDESIGN-V3.md "Compare"), not a scaled-down
    `MiniChart`. */
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
