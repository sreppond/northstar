import { useEffect, useMemo, useState } from 'react';
import type { EventKind, PlanEvent } from '@northstar/engine';
import { EVENT_MODULES } from '@northstar/engine';
import { codeFor, labelFor, toneFor } from '../presentation';
import { describeSchema, stepFor, type FieldDescriptor } from './schemaForm';

/**
 * The right-side event editor.
 *
 * Every form here is generated from the event module's zod schema — there is
 * no per-kind form code. Adding a config field to an event module makes an
 * input appear with no change in this file.
 *
 * Editing happens on a DRAFT clone. The parent live-previews the draft in the
 * chart, but the committed plan is untouched until Save, which makes Cancel
 * free (docs/PLAN.md §6.1).
 */

const INCOME_KINDS: EventKind[] = ['income', 'newJob', 'windfall', 'socialSecurity'];
const COST_KINDS: EventKind[] = [
  'buyAHome',
  'haveAKid',
  'annualExpense',
  'otherExpense',
  'careerBreak',
  'retirement',
];

interface Props {
  /** The event being edited, or null when picking a kind for a new one. */
  draft: PlanEvent | null;
  planStartYear: number;
  planEndYear: number;
  isNew: boolean;
  onChange(draft: PlanEvent): void;
  onPickKind(kind: EventKind): void;
  onSave(): void;
  onCancel(): void;
  onDelete(): void;
}

export function EventDrawer({
  draft,
  planStartYear,
  planEndYear,
  isNew,
  onChange,
  onPickKind,
  onSave,
  onCancel,
  onDelete,
}: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  useEffect(() => setConfirmingDelete(false), [draft?.id]);

  const fields = useMemo(
    () => (draft ? describeSchema(EVENT_MODULES[draft.kind].schema) : []),
    [draft],
  );

  const config = (draft?.config ?? {}) as Record<string, unknown>;

  const setConfig = (name: string, value: unknown) => {
    if (!draft) return;
    onChange({ ...draft, config: { ...config, [name]: value } });
  };

  const validation = useMemo(() => {
    if (!draft) return null;
    const parsed = EVENT_MODULES[draft.kind].schema.safeParse(draft.config ?? {});
    if (parsed.success) return null;
    return parsed.error.issues.map((i) => `${i.path.join('.') || 'config'}: ${i.message}`);
  }, [draft]);

  return (
    <>
      <div className="ns-scrim" onClick={onCancel} />
      <aside className="ns-drawer" role="dialog" aria-modal="true" aria-label={draft ? 'Edit event' : 'New event'}>
        <header className="ns-drawer-head">
          <div className="ns-drawer-title">
            {draft ? (isNew ? labelFor(draft.kind) : draft.name) : 'New event'}
          </div>
          <button type="button" className="ns-btn-ghost" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="ns-drawer-body">
          {!draft && (
            <>
              <p className="ns-drawer-hint">What would you like to add to the plan?</p>
              <KindGroup title="Income" kinds={INCOME_KINDS} onPick={onPickKind} />
              <KindGroup title="Costs & transitions" kinds={COST_KINDS} onPick={onPickKind} />
            </>
          )}

          {draft && (
            <>
              <Field label="Name">
                <input
                  className="ns-input"
                  value={draft.name}
                  onChange={(e) => onChange({ ...draft, name: e.target.value })}
                />
              </Field>

              <Field label="Start year" hint={`Plan runs ${planStartYear}–${planEndYear}`}>
                <input
                  className="ns-input ns-num"
                  type="number"
                  step={1}
                  value={draft.startYear}
                  onChange={(e) =>
                    onChange({ ...draft, startYear: Number(e.target.value) || planStartYear })
                  }
                />
              </Field>

              {fields.length === 0 && (
                <p className="ns-drawer-hint">This event has no settings beyond its year.</p>
              )}

              {fields.map((field) => (
                <ConfigField
                  key={field.name}
                  field={field}
                  value={config[field.name]}
                  onChange={(v) => setConfig(field.name, v)}
                />
              ))}

              {validation && (
                <div className="ns-drawer-errors">
                  {validation.map((message) => (
                    <div key={message}>{message}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {draft && (
          <footer className="ns-drawer-foot">
            {!isNew &&
              (confirmingDelete ? (
                <button type="button" className="ns-btn ns-btn-danger" onClick={onDelete}>
                  Delete — are you sure?
                </button>
              ) : (
                <button
                  type="button"
                  className="ns-btn ns-btn-danger-ghost"
                  onClick={() => setConfirmingDelete(true)}
                >
                  Delete
                </button>
              ))}
            <div className="ns-drawer-foot-right">
              <button type="button" className="ns-btn" onClick={onCancel}>
                Cancel
              </button>
              <button
                type="button"
                className="ns-btn ns-btn-primary"
                disabled={validation !== null}
                onClick={onSave}
              >
                {isNew ? 'Add event' : 'Save'}
              </button>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------

function KindGroup({
  title,
  kinds,
  onPick,
}: {
  title: string;
  kinds: EventKind[];
  onPick(kind: EventKind): void;
}) {
  return (
    <div className="ns-kind-group">
      <div className="ns-kind-title">{title}</div>
      <div className="ns-kind-grid">
        {kinds.map((kind) => (
          <button key={kind} type="button" className="ns-kind" onClick={() => onPick(kind)}>
            <span className={`ns-code ns-code-${toneFor(kind)}`}>{codeFor(kind)}</span>
            <span>{labelFor(kind)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="ns-field">
      <span className="ns-field-label">{label}</span>
      {children}
      {hint && <span className="ns-field-hint">{hint}</span>}
    </label>
  );
}

function ConfigField({
  field,
  value,
  onChange,
}: {
  field: FieldDescriptor;
  value: unknown;
  onChange(value: unknown): void;
}) {
  if (field.kind === 'boolean') {
    const checked = value === undefined ? Boolean(field.defaultValue) : Boolean(value);
    return (
      <label className="ns-toggle-row">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.kind === 'string') {
    return (
      <Field label={field.label}>
        <input
          className="ns-input"
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      </Field>
    );
  }

  const shown = value === undefined ? '' : String(value);
  const placeholder =
    field.defaultValue !== undefined ? `${field.defaultValue}` : field.required ? 'Required' : 'Optional';

  return (
    <Field label={field.label} hint={boundsHint(field)}>
      <div className="ns-input-wrap">
        {field.unit === 'currency' && <span className="ns-affix">$</span>}
        <input
          className={`ns-input ns-num${field.unit === 'currency' ? ' ns-input-prefixed' : ''}`}
          type="number"
          inputMode="decimal"
          step={stepFor(field)}
          min={field.min}
          max={field.max}
          value={shown}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? undefined : Number(raw));
          }}
        />
        {field.unit === 'percent' && <span className="ns-affix ns-affix-right">%</span>}
      </div>
    </Field>
  );
}

function boundsHint(field: FieldDescriptor): string | undefined {
  if (field.min !== undefined && field.max !== undefined) return `${field.min}–${field.max}`;
  if (field.max !== undefined) return `Max ${field.max}`;
  return undefined;
}
