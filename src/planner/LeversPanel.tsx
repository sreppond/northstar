import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Plan, PlanResult } from '@northstar/engine';
import { deflate, headlineReturnRate, runPlan } from '@northstar/engine';
import { applyLevers, horizonDelta, type LeverInputs } from './levers';
import type { GhostSeries } from './NetWorthChart';
import { DeltaTag, type DeltaTone } from './ui';
import { money, percent, signedMoney, signedPercent } from './format';

/** The real minus sign (U+2212), matching `format.ts`'s own private
    constant — a years-delta ("−2 yrs") isn't money or a percent, so it
    doesn't go through `signedMoney`/`signedPercent`, but it should still
    read with the same typographic minus everything else in the app signs
    a delta with (docs/ROADMAP-10.md C2). */
const MINUS = '−';

const RETURN_SHIFT_MAX = 4;
const RETURN_SHIFT_STEP = 0.25;
const SPENDING_SHIFT_MAX = 40_000;
const SPENDING_SHIFT_STEP = 1_000;
const RETIRE_YEAR_SPAN = 10;

const DEFAULT_LEVERS: LeverInputs = { returnDelta: 0, spendingDelta: 0, retireYear: undefined };

function yearsDeltaLabel(delta: number): string {
  if (delta === 0) return '';
  const abs = Math.abs(delta);
  return ` (${delta > 0 ? '+' : MINUS}${abs} yr${abs === 1 ? '' : 's'})`;
}

function deltaTone(delta: number): DeltaTone {
  if (delta > 0) return 'in';
  if (delta < 0) return 'out';
  return 'neutral';
}

/**
 * "What if" (docs/ROADMAP-10.md C5): a compact, collapsible panel on
 * Overview with three independent knobs — market return, annual spending,
 * retirement year — each re-running the live `plan` on every change (no
 * debounce: `runPlan` costs microseconds, docs/DESIGN-DIRECTION.md "The
 * timeline is the interface") and drawing the result as a dashed ink ghost
 * line on `NetWorthChart` via `onGhostChange`. Apply bakes the levers into
 * the SAVED plan (`stored`, one `replacePlan` call — one undo entry, one
 * toast); Reset clears them without touching the plan at all.
 *
 * Open/closed is the only state this component persists nowhere but its own
 * `useState` — collapsed again on the next page visit, deliberately: this is
 * a scratch pad for a question, not a setting.
 */
export function Levers({
  plan,
  stored,
  result,
  replacePlan,
  onGhostChange,
}: {
  plan: Plan;
  stored: Plan;
  result: PlanResult;
  replacePlan(plan: Plan, toastMessage?: string): void;
  onGhostChange(ghost: GhostSeries | null): void;
}) {
  const [open, setOpen] = useState(false);
  const [levers, setLevers] = useState<LeverInputs>(DEFAULT_LEVERS);

  const retirement = plan.events.find((e) => e.kind === 'retirement');
  const baseRetireYear = retirement?.startYear;
  const retireYear = levers.retireYear ?? baseRetireYear;

  const isDirty =
    levers.returnDelta !== 0 ||
    levers.spendingDelta !== 0 ||
    (levers.retireYear !== undefined && levers.retireYear !== baseRetireYear);

  // Re-run on every slider move — the live ghost line. `levers` (not its
  // individual fields) is the dependency, so this recomputes exactly when
  // any knob actually changes, same as every other derived projection in
  // `PlannerContext.tsx`.
  const ghostResult = useMemo((): PlanResult | undefined => {
    if (!isDirty) return undefined;
    const nominal = runPlan(applyLevers(plan, levers));
    return plan.settings.dollarMode === 'todaysDollars' ? deflate(nominal, plan.settings.inflationRate) : nominal;
  }, [plan, levers, isDirty]);

  // Reported upward so `OverviewPage` can feed it to `NetWorthChart` as the
  // dashed ghost line — this component owns the levers, not the chart.
  useEffect(() => {
    onGhostChange(ghostResult ? { result: ghostResult } : null);
  }, [ghostResult, onGhostChange]);

  const readout = ghostResult ? horizonDelta(result, ghostResult) : undefined;
  const headline = headlineReturnRate(plan);

  const handleApply = () => {
    replacePlan(applyLevers(stored, levers), 'Applied What-if');
    setLevers(DEFAULT_LEVERS);
  };
  const handleReset = () => setLevers(DEFAULT_LEVERS);

  return (
    <div className="ns-ov-levers">
      <button
        type="button"
        className="ns-ov-levers-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight className={`ns-ov-levers-chevron${open ? ' is-open' : ''}`} size={14} aria-hidden />
        <span className="ns-ov-levers-title">What if</span>
        {!open && readout && (
          <DeltaTag value={`${signedMoney(readout.delta)} by ${readout.endYear}`} tone={deltaTone(readout.delta)} />
        )}
      </button>

      {/* `inert` (not just `overflow: hidden`) so a collapsed panel's sliders
          and buttons drop out of the tab order entirely — otherwise a
          sighted keyboard user tabs straight into an invisible slider
          (docs/W3-REVIEW.md #10). React 19 forwards this as the native HTML
          `inert` attribute. */}
      <div className={`ns-ov-levers-panel${open ? ' is-open' : ''}`} inert={!open}>
        <div className="ns-ov-levers-panel-inner">
          <div className="ns-ov-levers-panel-content">
          <div className="ns-ov-lever-row">
            <div className="ns-ov-lever-head">
              <label htmlFor="lever-return">Market return</label>
              <span className="ns-ov-lever-value ns-num">
                {signedPercent(levers.returnDelta)}
                {headline !== undefined && <span className="ns-ov-lever-sub"> → {percent(headline + levers.returnDelta)}</span>}
              </span>
            </div>
            <input
              id="lever-return"
              type="range"
              min={-RETURN_SHIFT_MAX}
              max={RETURN_SHIFT_MAX}
              step={RETURN_SHIFT_STEP}
              value={levers.returnDelta}
              aria-valuetext={`${signedPercent(levers.returnDelta)} return`}
              onChange={(e) => setLevers((v) => ({ ...v, returnDelta: Number(e.target.value) }))}
            />
          </div>

          <div className="ns-ov-lever-row">
            <div className="ns-ov-lever-head">
              <label htmlFor="lever-spending">Annual spending</label>
              <span className="ns-ov-lever-value ns-num">
                {signedMoney(levers.spendingDelta)}/yr
                <span className="ns-ov-lever-sub"> → {money(stored.settings.baselineExpenses + levers.spendingDelta)}/yr</span>
              </span>
            </div>
            <input
              id="lever-spending"
              type="range"
              min={-SPENDING_SHIFT_MAX}
              max={SPENDING_SHIFT_MAX}
              step={SPENDING_SHIFT_STEP}
              value={levers.spendingDelta}
              aria-valuetext={`${signedMoney(levers.spendingDelta)} a year`}
              onChange={(e) => setLevers((v) => ({ ...v, spendingDelta: Number(e.target.value) }))}
            />
          </div>

          {baseRetireYear !== undefined && retireYear !== undefined && (
            <div className="ns-ov-lever-row">
              <div className="ns-ov-lever-head">
                <label htmlFor="lever-retire">Retirement year</label>
                <span className="ns-ov-lever-value ns-num">
                  {retireYear}
                  {yearsDeltaLabel(retireYear - baseRetireYear)}
                </span>
              </div>
              <input
                id="lever-retire"
                type="range"
                min={baseRetireYear - RETIRE_YEAR_SPAN}
                max={baseRetireYear + RETIRE_YEAR_SPAN}
                step={1}
                value={retireYear}
                aria-valuetext={`Retire in ${retireYear}`}
                onChange={(e) => setLevers((v) => ({ ...v, retireYear: Number(e.target.value) }))}
              />
            </div>
          )}

          <div className="ns-ov-levers-footer">
            {readout ? (
              <DeltaTag value={`${signedMoney(readout.delta)} by ${readout.endYear}`} tone={deltaTone(readout.delta)} />
            ) : (
              <span className="ns-subtle">Move a slider to preview</span>
            )}
            <div className="ns-ov-levers-actions">
              <button type="button" className="ns-btn-ghost" onClick={handleReset} disabled={!isDirty}>
                Reset
              </button>
              <button type="button" className="ns-btn ns-btn-primary" onClick={handleApply} disabled={!isDirty}>
                Apply
              </button>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
