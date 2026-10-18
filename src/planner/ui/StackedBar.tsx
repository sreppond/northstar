import type { ReactNode } from 'react';
import type { AccountClass } from '@northstar/engine';

export interface StackedBarSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * The "Classification" bar (docs/REDESIGN-V3.md "Goodcast"): one rounded,
 * proportional bar with a 2px gap between segments, plus a dot legend
 * naming each segment and its formatted value. Segments below zero are
 * dropped rather than clamped — a negative "value" (e.g. a liability) has
 * no honest width in a composition-of-a-whole bar; it still belongs in the
 * legend, so the caller decides whether to include it there.
 */
export function StackedBar({
  segments,
  format = (value: number) => String(value),
}: {
  segments: StackedBarSegment[];
  format?(value: number): ReactNode;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);

  return (
    <div className="ns-ui-stackedbar">
      <div className="ns-ui-stackedbar-track" role="img" aria-label="Composition breakdown">
        {segments.map((s) => {
          const pct = total > 0 ? (Math.max(0, s.value) / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={s.key}
              className="ns-ui-stackedbar-seg"
              style={{ width: `${pct}%`, background: s.color }}
              title={`${s.label}`}
            />
          );
        })}
      </div>
      <div className="ns-ui-stackedbar-legend">
        {segments.map((s) => (
          <div key={s.key} className="ns-ui-stackedbar-legend-item">
            <span className="ns-ui-stackedbar-dot" style={{ background: s.color }} aria-hidden />
            <span className="ns-ui-stackedbar-legend-label">{s.label}</span>
            <span className="ns-ui-stackedbar-legend-value ns-num">{format(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Account-mix hues for the classification bar (`--mix-1`..`--mix-6` in
 * planner.css) — not one of the four validated data hues, which encode net
 * worth / in / out / a compared plan, not "which bucket does this account fall
 * into".
 *
 * V5-REVIEW-2 N4: assets take the five validated mix hues, one per spendable
 * class (the old `color-mix` annuity blend failed the validator in dark, so the
 * annuity gets its own violet). Illiquid assets (real estate, other) are
 * neutral `--muted`, and liabilities `--muted-light`: they used to borrow
 * asset hues (mortgage = the taxable green, loan = the tax-deferred gold), so a
 * debt read as an investment. `--mix-1` (the navy) is left to the budget and
 * group palettes, which lean on it. Both neutrals exist in all three theme
 * blocks.
 */
const ACCOUNT_CLASS_MIX: Record<AccountClass, string> = {
  cash: 'var(--mix-6)',
  taxableInvestment: 'var(--mix-2)',
  taxDeferredInvestment: 'var(--mix-3)',
  variableAnnuity: 'var(--mix-4)',
  taxFreeInvestment: 'var(--mix-5)',
  realEstate: 'var(--muted)',
  otherAsset: 'var(--muted)',
  creditCard: 'var(--muted-light)',
  loan: 'var(--muted-light)',
  mortgage: 'var(--muted-light)',
};

export function accountClassColor(accountClass: AccountClass): string {
  return ACCOUNT_CLASS_MIX[accountClass] ?? 'var(--mix-1)';
}
