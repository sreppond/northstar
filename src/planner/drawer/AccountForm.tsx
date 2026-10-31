import { Fragment, useEffect, useRef } from 'react';
import type { Account } from '@northstar/engine';
import { ACCOUNT_TYPES, visibleFields } from '@northstar/engine';
import { Segmented } from '../ui';
import { AccountField, Field, NumberInput } from './fields';
import {
  effectiveShortTermRate,
  setShortTermRate,
  setTreatment,
  type GainsTaxTreatment,
} from './gainsTaxField';
import { takeAccountFocus } from './sheetFocus';

const GAINS_TAX_OPTIONS = [
  { value: 'longTerm', label: 'Long-term — taxed when you sell' },
  { value: 'activeTrading', label: 'Active trading — taxed every year' },
];

const GAINS_TAX_EXPLAINER =
  "Active trading realizes gains every year. They're taxed as ordinary income and paid the following spring, so withdrawals later owe nothing more. Long-term defers the tax until you sell.";

/** Withdrawal-tax fields that stop applying under active trading. Kept visible, not deleted. */
const WITHDRAWAL_TAX_KEYS = ['taxableWithdrawalPercent', 'withdrawalTaxRate'];

/**
 * The per-account-type form body, extracted from the old `AccountDrawer`
 * (docs/REDESIGN-V5.md §5.1.4) so it can sit inline in the account sheet.
 *
 * Rendered from `ACCOUNT_TYPES[class].fields` — the exact same list the hover
 * card reads. That is the whole point: what you are shown on hover is what you
 * can change here.
 *
 * Synthetic accounts (a home and its mortgage, created by a `buyAHome` event)
 * are surfaced read-only. They belong to their event and are rebuilt on every
 * run, so editing them here would be silently discarded.
 */
export function AccountForm({
  draft,
  synthetic,
  planStartYear,
  planEndYear,
  incomeTaxRate,
  onChange,
}: {
  draft: Account;
  synthetic: Account[];
  planStartYear: number;
  planEndYear: number;
  /** The plan's income tax rate, percent: the placeholder for an account's short-term rate. */
  incomeTaxRate?: number;
  onChange(next: Account): void;
}) {
  const spec = ACCOUNT_TYPES[draft.accountClass];
  const taxable = draft.accountClass === 'taxableInvestment';
  const treatment: GainsTaxTreatment = draft.gainsTaxTreatment ?? 'longTerm';
  const activeTrading = taxable && treatment === 'activeTrading';

  const set = (key: keyof Account, value: unknown) => {
    const next = { ...draft, [key]: value };

    // Switching to a variable rate seeds one anchor at the rate the account
    // already grows at, so the preview opens as a flat line the user then
    // bends — rather than an empty editor at 0%.
    if (key === 'growthRateMethod' && value === 'schedule' && !next.growthRateSchedule?.length) {
      next.growthRateSchedule = [{ year: planStartYear, rate: draft.growthRate }];
    }

    onChange(next);
  };

  // V5-REVIEW-2 N11: a caller that opened this sheet to fix one setting (the
  // health alert's "Review") asked for it by name. Claim that on arrival,
  // bring the field to the middle of the sheet, focus it, and flash a ring.
  // Keyed on the account, so picking a sibling in the segmented control, or a
  // second Review while the sheet is already open, re-runs it.
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const field = takeAccountFocus();
    if (!field) return;
    let timer = 0;
    // A frame late: the sheet's own mount effect moves focus to its panel after
    // ours (children's effects run first), and would take it back.
    const frame = requestAnimationFrame(() => {
      const target = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"]`);
      if (!target) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      // The segmented choice's current option, so a keypress changes it from where it is.
      const option =
        target.querySelector<HTMLElement>('[aria-pressed="true"]') ?? target.querySelector<HTMLElement>('button, input');
      option?.focus({ preventScroll: true });
      target.classList.add('ns-field-flash');
      timer = window.setTimeout(() => target.classList.remove('ns-field-flash'), reduce ? 1000 : 400);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [draft.id]);

  return (
    <div className="ns-account-form" ref={formRef}>
      {visibleFields(spec, draft).map((field) => {
        const key = String(field.key);
        const muted = activeTrading && WITHDRAWAL_TAX_KEYS.includes(key);
        return (
          <Fragment key={key}>
            {taxable && field.key === 'taxableWithdrawalPercent' && (
              <div data-field="gainsTaxTreatment" className="ns-account-field ns-account-gains">
                <div className="ns-field">
                  <span className="ns-field-label">Gains tax</span>
                  <Segmented
                    ariaLabel="Gains tax"
                    options={GAINS_TAX_OPTIONS}
                    value={treatment}
                    onChange={(v) => onChange(setTreatment(draft, v as GainsTaxTreatment))}
                  />
                  <span className="ns-field-hint">{GAINS_TAX_EXPLAINER}</span>
                </div>
                {activeTrading && (
                  <div data-field="shortTermGainsRate">
                    <Field label="Short-term rate">
                      <NumberInput
                        value={draft.shortTermGainsRate}
                        unit="percent"
                        step={0.1}
                        min={0}
                        max={100}
                        placeholder={
                          incomeTaxRate === undefined
                            ? 'Your income tax rate'
                            : `${effectiveShortTermRate(draft, { incomeTaxRate })}% (your income tax rate)`
                        }
                        onChange={(v) => onChange(setShortTermRate(draft, v ?? ''))}
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}
            <div
              data-field={key}
              className={muted ? 'ns-account-field ns-account-field-muted' : 'ns-account-field'}
            >
              <AccountField
                field={field}
                value={draft[field.key]}
                planYears={{ startYear: planStartYear, endYear: planEndYear }}
                onChange={(v) => set(field.key, v)}
              />
            </div>
            {muted && field.key === 'withdrawalTaxRate' && (
              <p className="ns-drawer-hint ns-account-muted-note">Not used with active trading</p>
            )}
          </Fragment>
        );
      })}

      {synthetic.length > 0 && (
        <div className="ns-readonly-note">
          <div className="ns-readonly-title">Also in this line</div>
          {synthetic.map((a) => (
            <div key={a.id} className="ns-readonly-row">
              <span>{a.name}</span>
              <span className="ns-num">{Math.round(a.initialBalance).toLocaleString()}</span>
            </div>
          ))}
          <p className="ns-drawer-hint">Created by a life event, so its settings live on that event.</p>
        </div>
      )}
    </div>
  );
}
