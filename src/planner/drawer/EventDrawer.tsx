import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { Account, EventKind, Participant, PlanEvent } from '@northstar/engine';
import { EVENT_MODULES } from '@northstar/engine';
import { codeFor, labelFor, toneFor } from '../presentation';
import { describeSchema } from './schemaForm';
import { ConfigField, Field } from './fields';

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
  /** Every event in the plan — retirement needs to list the income it stops. */
  allEvents: PlanEvent[];
  /** Referenced by id from event configs, so the drawer can offer real pickers. */
  participants: Participant[];
  accounts: Account[];
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
  allEvents,
  participants,
  accounts,
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

  // `custom` fields are records the generic form cannot render; each has a
  // bespoke control below.
  const generated = useMemo(() => fields.filter((f) => f.kind !== 'custom'), [fields]);

  /** Id-shaped config fields that should be pickers, not free text. */
  const choices = useMemo(
    () => ({
      participantId: participants
        .filter((p) => p.isIncluded)
        .map((p) => ({ value: p.id, label: p.name })),
      contributionAccountId: accounts
        .filter((a) => !a.isLiability && !a.isSynthetic)
        .map((a) => ({ value: a.id, label: a.name })),
    }),
    [participants, accounts],
  ) as Record<string, { value: string; label: string }[]>;

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

              {generated.length === 0 && draft.kind !== 'retirement' && (
                <p className="ns-drawer-hint">This event has no settings beyond its year.</p>
              )}

              {generated.map((field) => (
                <ConfigField
                  key={field.name}
                  field={field}
                  value={config[field.name]}
                  options={choices[field.name]}
                  onChange={(v) => setConfig(field.name, v)}
                />
              ))}

              {/* The one form the schema cannot generate: a row per income line
                  in the plan, because it depends on the OTHER events. */}
              {draft.kind === 'retirement' && (
                <IncomeRetention
                  targets={retirementTargets(
                    allEvents,
                    draft,
                    config.affectsUnearnedIncome === true,
                  )}
                  retention={(config.incomeRetentionByEvent ?? {}) as Record<string, number>}
                  fallback={Number(config.defaultIncomeRetentionPercent ?? 0)}
                  onChange={(next) => setConfig('incomeRetentionByEvent', next)}
                />
              )}

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

/**
 * Which income lines a retirement can actually act on.
 *
 * Deliberately narrow. Listing a line the suppression cannot touch — a
 * one-off windfall, a salary that already ended — would invite someone to set
 * a percentage that silently does nothing, which is worse than not offering
 * the control at all.
 */
export function retirementTargets(
  events: PlanEvent[],
  draft: PlanEvent,
  affectsUnearned: boolean,
): PlanEvent[] {
  const year = draft.startYear;

  return events.filter((e) => {
    if (e.id === draft.id || !e.isIncluded || e.isHidden) return false;

    const c = (e.config ?? {}) as Record<string, unknown>;
    // One-off money is already banked by the time retirement starts.
    const recurring = e.kind === 'income' || e.kind === 'newJob' || e.kind === 'socialSecurity';
    if (!recurring) return false;

    const ends = typeof c.endYear === 'number' ? c.endYear : Infinity;
    if (ends < year) return false;

    const earned = e.kind === 'newJob' || (e.kind === 'income' && c.isEarned === true);
    return earned || affectsUnearned;
  });
}

function IncomeRetention({
  targets,
  retention,
  fallback,
  onChange,
}: {
  targets: PlanEvent[];
  retention: Record<string, number>;
  fallback: number;
  onChange(next: Record<string, number>): void;
}) {
  if (targets.length === 0) {
    return (
      <div className="ns-retain">
        <div className="ns-retain-title">Income after retiring</div>
        <p className="ns-drawer-hint">
          No income lines are still running when this starts. Baseline income uses the default
          above.
        </p>
      </div>
    );
  }

  return (
    <div className="ns-retain">
      <div className="ns-retain-title">Income after retiring</div>
      <p className="ns-drawer-hint">
        How much of each line continues. Anything left blank uses the default above.
      </p>

      {targets.map((event) => {
        const explicit = retention[event.id];
        return (
          <div key={event.id} className="ns-retain-row">
            <span className={`ns-code ns-code-${toneFor(event.kind)}`}>{codeFor(event.kind)}</span>
            <span className="ns-retain-name" title={event.name}>
              {event.name}
            </span>
            <div className="ns-retain-input">
              <input
                className="ns-input ns-num"
                type="number"
                min={0}
                max={100}
                step={5}
                value={explicit ?? ''}
                placeholder={String(fallback)}
                aria-label={`${event.name} — percent kept`}
                onChange={(e) => {
                  const next = { ...retention };
                  if (e.target.value === '') delete next[event.id];
                  else next[event.id] = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                  onChange(next);
                }}
              />
              <span className="ns-affix">%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
        {kinds.map((kind, i) => (
          <button
            key={kind}
            type="button"
            className="ns-kind"
            // --i staggers the rise-in so the options arrive as a list being
            // laid down rather than a block appearing.
            style={{ '--i': i } as CSSProperties}
            onClick={() => onPick(kind)}
          >
            <span className={`ns-code ns-code-${toneFor(kind)}`}>{codeFor(kind)}</span>
            <span>{labelFor(kind)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
