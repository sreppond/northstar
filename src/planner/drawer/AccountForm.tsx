import { useEffect, useRef } from 'react';
import type { Account } from '@northstar/engine';
import { ACCOUNT_TYPES, visibleFields } from '@northstar/engine';
import { AccountField } from './fields';
import { takeAccountFocus } from './sheetFocus';

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
  onChange,
}: {
  draft: Account;
  synthetic: Account[];
  planStartYear: number;
  planEndYear: number;
  onChange(next: Account): void;
}) {
  const spec = ACCOUNT_TYPES[draft.accountClass];

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
      {visibleFields(spec, draft).map((field) => (
        <div key={String(field.key)} data-field={String(field.key)} className="ns-account-field">
          <AccountField
            field={field}
            value={draft[field.key]}
            planYears={{ startYear: planStartYear, endYear: planEndYear }}
            onChange={(v) => set(field.key, v)}
          />
        </div>
      ))}

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
