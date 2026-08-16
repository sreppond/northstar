import { useEffect } from 'react';
import type { Account } from '@northstar/engine';
import { ACCOUNT_TYPES, visibleFields } from '@northstar/engine';
import { AccountField } from './fields';

/**
 * Per-account-type settings.
 *
 * Rendered from `ACCOUNT_TYPES[class].fields` — the exact same list the hover
 * card reads. That is the whole point: what you are shown on hover is what you
 * can change here.
 *
 * Synthetic accounts (a home and its mortgage, created by a `buyAHome` event)
 * are surfaced read-only. They belong to their event and are rebuilt on every
 * run, so editing them here would be silently discarded.
 */
interface Props {
  draft: Account;
  synthetic: Account[];
  planStartYear: number;
  planEndYear: number;
  onChange(next: Account): void;
  onSave(): void;
  onCancel(): void;
}

export function AccountDrawer({
  draft,
  synthetic,
  planStartYear,
  planEndYear,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const spec = ACCOUNT_TYPES[draft.accountClass];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

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

  return (
    <>
      <div className="ns-scrim" onClick={onCancel} />
      <aside className="ns-drawer" role="dialog" aria-modal="true" aria-label={`${spec.label} settings`}>
        <header className="ns-drawer-head">
          <div className="ns-drawer-title">{spec.label}</div>
          <button type="button" className="ns-btn-ghost" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="ns-drawer-body">
          <p className="ns-drawer-hint">{spec.blurb}</p>

          {visibleFields(spec, draft).map((field) => (
            <AccountField
              key={String(field.key)}
              field={field}
              value={draft[field.key]}
              planYears={{ startYear: planStartYear, endYear: planEndYear }}
              onChange={(v) => set(field.key, v)}
            />
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
              <p className="ns-drawer-hint">
                Created by a life event, so its settings live on that event.
              </p>
            </div>
          )}
        </div>

        <footer className="ns-drawer-foot">
          <div className="ns-drawer-foot-right">
            <button type="button" className="ns-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="ns-btn ns-btn-primary" onClick={onSave}>
              Save
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}
