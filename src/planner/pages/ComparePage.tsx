import { useState } from 'react';
import { headlineReturnRate } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { NetWorthChart } from '../NetWorthChart';
import { CompareDiff } from '../CompareDiff';
import { percent } from '../format';

/**
 * Two ways to compare, matching the two things "compare" means elsewhere in
 * the app: pick another saved plan (already possible from the ledger
 * toolbar's Compare dropdown — this page just gives it a proper home), or
 * start a What-If — snapshot the live plan, keep editing it directly, and
 * decide afterward whether to keep the edits, revert them, or spin them off
 * as a new plan. Both end up setting the exact same `compareToPlanId`, so
 * the chart's dashed line and `CompareDiff`'s two lists work unchanged
 * either way.
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

  function confirmFork() {
    const name = forkName.trim();
    if (!name) return;
    forkWhatIf(stored.id, name);
    setForkName('');
    setForking(false);
  }

  if (!comparePlan || !compare) {
    return (
      <div className="ns-card ns-card-view">
        <div className="ns-view-head">
          <div className="ns-view-title">Compare</div>
        </div>

        <div className="ns-compare-option">
          <div className="ns-section-title">What-If</div>
          <p className="ns-view-sub">
            Make changes anywhere in the plan and see how they compare to what you have now — nothing is
            committed until you say so, and you can always revert.
          </p>
          <button type="button" className="ns-btn ns-btn-primary" onClick={() => startWhatIf(stored.id)}>
            Start a What-If
          </button>
        </div>

        {otherPlans.length > 0 && (
          <div className="ns-compare-option">
            <div className="ns-section-title">Compare against a plan</div>
            <p className="ns-view-sub">
              Look at {stored.name} side by side with another saved plan, without editing either.
            </p>
            <div className="ns-compare-plan-picker">
              {otherPlans.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="ns-btn"
                  onClick={() => updateSettings(stored.id, { compareToPlanId: p.id })}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="ns-card ns-card-view">
      <div className="ns-view-head">
        <div className="ns-view-title">Compare</div>
        <p className="ns-view-sub">
          {isWhatIf
            ? `Comparing your edits to how ${stored.name} stood before this What-If.`
            : `Comparing ${stored.name} to ${comparePlan.name}.`}
        </p>
      </div>

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
    </div>
  );
}
