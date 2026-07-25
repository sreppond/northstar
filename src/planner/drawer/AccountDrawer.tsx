import { useEffect } from 'react';
import type { Account, AccountFieldSpec } from '@northstar/engine';
import { ACCOUNT_TYPES, visibleFields } from '@northstar/engine';
import { stepFor } from './schemaForm';

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

// ---------------------------------------------------------------------------

const GROWTH_OPTIONS = [
  { value: 'fixed', label: 'Fixed rate' },
  { value: 'noChange', label: 'No change' },
] as const;

const TIMING_OPTIONS = [
  { value: 'always', label: 'Any time' },
  { value: 'starting_year', label: 'From a year' },
  { value: 'never', label: 'Never' },
] as const;

function AccountField({
  field,
  value,
  onChange,
}: {
  field: AccountFieldSpec;
  value: unknown;
  onChange(value: unknown): void;
}) {
  if (field.kind === 'growthMethod' || field.kind === 'withdrawalTiming') {
    const options = field.kind === 'growthMethod' ? GROWTH_OPTIONS : TIMING_OPTIONS;
    return (
      <div className="ns-field">
        <span className="ns-field-label">{field.label}</span>
        <div className="ns-choice">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="ns-choice-opt"
              aria-pressed={value === opt.value}
              onClick={() => onChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {field.help && <span className="ns-field-hint">{field.help}</span>}
      </div>
    );
  }

  if (field.kind === 'boolean') {
    return (
      <label className="ns-toggle-row">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        <span>{field.label}</span>
      </label>
    );
  }

  const step =
    field.step ??
    stepFor({
      name: String(field.key),
      label: field.label,
      kind: 'number',
      unit: field.unit === 'age' ? 'plain' : field.unit,
      required: false,
      integer: field.unit === 'year',
    });

  return (
    <label className="ns-field">
      <span className="ns-field-label">{field.label}</span>
      <div className="ns-input-wrap">
        {field.unit === 'currency' && <span className="ns-affix">$</span>}
        <input
          className={`ns-input ns-num${field.unit === 'currency' ? ' ns-input-prefixed' : ''}`}
          type="number"
          inputMode="decimal"
          step={step}
          min={field.min}
          max={field.max}
          value={value === undefined || value === null ? '' : String(value)}
          placeholder={field.min !== undefined ? String(field.min) : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
        {field.unit === 'percent' && <span className="ns-affix ns-affix-right">%</span>}
      </div>
      {field.help && <span className="ns-field-hint">{field.help}</span>}
    </label>
  );
}
