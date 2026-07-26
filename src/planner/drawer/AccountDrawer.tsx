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
  onChange(next: Account): void;
  onSave(): void;
  onCancel(): void;
}

export function AccountDrawer({ draft, synthetic, onChange, onSave, onCancel }: Props) {
  const spec = ACCOUNT_TYPES[draft.accountClass];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const set = (key: keyof Account, value: unknown) => onChange({ ...draft, [key]: value });

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
