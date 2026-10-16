import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Plan } from '@northstar/engine';
import { money, percent, signedMoney } from './format';
import { DeltaTag } from './ui';
import { impactMetrics, presentResult, type ImpactMetrics } from './impact';

/**
 * A draft of the plan that a page's levers edit (docs/REDESIGN-V4.md §1.4,
 * "Preview, then keep"): the real plan is untouched until Keep. Cleared
 * whenever the plan underneath it changes identity (switching plans) or is
 * edited elsewhere, so a stale draft never outlives what it was drawn from.
 */
export function usePreview(base: Plan) {
  const [draft, setDraft] = useState<Plan | null>(null);
  useEffect(() => setDraft(null), [base]);
  const draftResult = useMemo(() => (draft ? presentResult(draft) : null), [draft]);
  return { draft, setDraft, draftResult, reset: () => setDraft(null) };
}

/**
 * The same four consequences under every lever (docs/REDESIGN-V4.md §1.3):
 * what's left each month, the savings rate, net worth at 60, and how long
 * the money lasts. With a draft, each cell reads the draft's value with its
 * change from the plan as it stands; without one, it reads the plan.
 */
export function ImpactStrip({
  current,
  draft,
  actions,
}: {
  current: ImpactMetrics;
  draft?: ImpactMetrics | null;
  actions?: ReactNode;
}) {
  const shown = draft ?? current;
  const d = (a?: number, b?: number) => (draft && a !== undefined && b !== undefined ? b - a : undefined);

  const saveDelta = d(current.leftToSave, shown.leftToSave);
  const rateDelta = d(current.savingsRate, shown.savingsRate);
  const nwDelta = d(current.netWorthAt60?.value, shown.netWorthAt60?.value);
  const lastsDelta =
    draft && current.runsDryYear !== shown.runsDryYear
      ? (shown.runsDryYear ?? Infinity) - (current.runsDryYear ?? Infinity)
      : undefined;

  return (
    <div className={`ns-impact${draft ? ' ns-impact-draft' : ''}`}>
      <div className="ns-impact-cells">
        <Cell
          label={`Left to save · ${shown.year}`}
          value={`${money(shown.leftToSave)}/mo`}
          delta={saveDelta !== undefined && Math.abs(saveDelta) >= 1 ? { value: `${signedMoney(saveDelta)}/mo`, tone: saveDelta > 0 ? 'in' : 'out' } : undefined}
        />
        <Cell
          label="Savings rate"
          value={shown.savingsRate !== undefined ? percent(shown.savingsRate, 0) : '—'}
          delta={rateDelta !== undefined && Math.abs(rateDelta) >= 0.5 ? { value: `${rateDelta > 0 ? '+' : '−'}${Math.abs(rateDelta).toFixed(0)} pts`, tone: rateDelta > 0 ? 'in' : 'out' } : undefined}
        />
        <Cell
          label={shown.netWorthAt60 ? `Net worth at 60 · ${shown.netWorthAt60.year}` : 'Net worth at 60'}
          value={shown.netWorthAt60 ? money(shown.netWorthAt60.value) : '—'}
          delta={nwDelta !== undefined && Math.abs(nwDelta) >= 1 ? { value: signedMoney(nwDelta), tone: nwDelta > 0 ? 'in' : 'out' } : undefined}
        />
        <Cell
          label="Money lasts"
          value={shown.runsDryYear ? `Until ${shown.runsDryYear}` : 'Through the plan'}
          delta={
            lastsDelta !== undefined
              ? Number.isFinite(lastsDelta)
                ? { value: `${lastsDelta > 0 ? '+' : '−'}${Math.abs(lastsDelta)} yrs`, tone: lastsDelta > 0 ? 'in' : 'out' }
                : { value: lastsDelta > 0 ? 'no shortfall' : 'now runs dry', tone: lastsDelta > 0 ? 'in' : 'out' }
              : undefined
          }
        />
      </div>
      {actions && <div className="ns-impact-actions">{actions}</div>}
    </div>
  );
}

function Cell({ label, value, delta }: { label: string; value: string; delta?: { value: string; tone: 'in' | 'out' } }) {
  return (
    <div className="ns-impact-cell">
      <span className="ns-impact-label">{label}</span>
      <span className="ns-impact-value ns-num">{value}</span>
      {delta && <DeltaTag value={delta.value} tone={delta.tone} />}
    </div>
  );
}

/** Keep / Save as scenario / Reset, for a page holding a draft. */
export function PreviewActions({
  onKeep,
  onSaveAs,
  onReset,
}: {
  onKeep(): void;
  onSaveAs(): void;
  onReset(): void;
}) {
  return (
    <>
      <button type="button" className="ns-btn ns-btn-primary" onClick={onKeep}>
        Keep
      </button>
      <button type="button" className="ns-btn" onClick={onSaveAs}>
        Save as scenario
      </button>
      <button type="button" className="ns-btn-ghost" onClick={onReset}>
        Reset
      </button>
    </>
  );
}

export { impactMetrics };
