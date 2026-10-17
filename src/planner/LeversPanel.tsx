import { useMemo, useState } from 'react';
import type { Plan, PlanResult } from '@northstar/engine';
import { deflate, headlineReturnRate, runPlan } from '@northstar/engine';
import { applyLevers, horizonDelta, livingSpendingAnnual, type LeverInputs } from './levers';
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
 * "What if" (docs/ROADMAP-10.md C5, docs/REDESIGN-V5.md §5.1.1): three
 * independent knobs — market return, annual spending, retirement year — each
 * re-running the live `plan` on every change (no debounce: `runPlan` costs
 * microseconds, docs/DESIGN-DIRECTION.md "The timeline is the interface") and
 * drawn as a dashed ink ghost on the Net Worth hero. Apply bakes the levers
 * into the SAVED plan (`stored`, one `replacePlan` call, one undo entry, one
 * toast); Reset clears them without touching the plan at all.
 *
 * The lever state is lifted into `useLevers` so the page can keep drawing the
 * ghost while the sheet is closed: the preview is the point, the sheet is just
 * where the sliders live.
 */
export function useLevers(plan: Plan) {
  const [levers, setLevers] = useState<LeverInputs>(DEFAULT_LEVERS);

  const baseRetireYear = plan.events.find((e) => e.kind === 'retirement')?.startYear;
  const isDirty =
    levers.returnDelta !== 0 ||
    levers.spendingDelta !== 0 ||
    (levers.retireYear !== undefined && levers.retireYear !== baseRetireYear);

  // Re-run on every slider move — the live ghost line.
  const ghostResult = useMemo((): PlanResult | undefined => {
    if (!isDirty) return undefined;
    const nominal = runPlan(applyLevers(plan, levers));
    return plan.settings.dollarMode === 'todaysDollars' ? deflate(nominal, plan.settings.inflationRate) : nominal;
  }, [plan, levers, isDirty]);

  return { levers, setLevers, isDirty, ghostResult, reset: () => setLevers(DEFAULT_LEVERS) };
}

export function Levers({
  plan,
  stored,
  result,
  levers,
  setLevers,
  isDirty,
  ghostResult,
  replacePlan,
  onDone,
}: {
  plan: Plan;
  stored: Plan;
  result: PlanResult;
  replacePlan(plan: Plan, toastMessage?: string): void;
  /** Called after Apply, so the sheet can close. */
  onDone?(): void;
} & ReturnType<typeof useLevers>) {
  const baseRetireYear = plan.events.find((e) => e.kind === 'retirement')?.startYear;
  const retireYear = levers.retireYear ?? baseRetireYear;

  const readout = ghostResult ? horizonDelta(result, ghostResult) : undefined;
  const headline = headlineReturnRate(plan);

  const handleApply = () => {
    replacePlan(applyLevers(stored, levers), 'Applied What-if');
    setLevers(DEFAULT_LEVERS);
    onDone?.();
  };
  const handleReset = () => setLevers(DEFAULT_LEVERS);

  return (
    <div className="ns-nw-levers">
      <div className="ns-nw-lever-row">
        <div className="ns-nw-lever-head">
          <label htmlFor="lever-return">Market return</label>
          <span className="ns-nw-lever-value ns-num">
            {signedPercent(levers.returnDelta)}
            {headline !== undefined && <span className="ns-nw-lever-sub"> → {percent(headline + levers.returnDelta)}</span>}
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

      <div className="ns-nw-lever-row">
        <div className="ns-nw-lever-head">
          <label htmlFor="lever-spending">Annual spending</label>
          <span className="ns-nw-lever-value ns-num">
            {signedMoney(levers.spendingDelta)}/yr
            <span className="ns-nw-lever-sub"> → {money(livingSpendingAnnual(stored) + levers.spendingDelta)}/yr</span>
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
        <div className="ns-nw-lever-row">
          <div className="ns-nw-lever-head">
            <label htmlFor="lever-retire">Retirement year</label>
            <span className="ns-nw-lever-value ns-num">
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

      <div className="ns-nw-levers-footer">
        {readout ? (
          <DeltaTag value={`${signedMoney(readout.delta)} by ${readout.endYear}`} tone={deltaTone(readout.delta)} />
        ) : (
          <span className="ns-subtle">Move a slider to preview</span>
        )}
        <div className="ns-nw-levers-actions">
          <button type="button" className="ns-btn-ghost" onClick={handleReset} disabled={!isDirty}>
            Reset
          </button>
          <button type="button" className="ns-btn ns-btn-primary" onClick={handleApply} disabled={!isDirty}>
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
