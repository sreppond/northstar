import { useEffect, useState } from 'react';
import type { Anchor, BudgetCategory, BudgetLine, Plan } from '@northstar/engine';
import { Choice, Field, NumberInput } from './fields';

export const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  housing: 'Housing',
  food: 'Food',
  utilities: 'Utilities',
  transport: 'Transport',
  insurance: 'Insurance',
  health: 'Health',
  childcare: 'Childcare',
  education: 'Education',
  personal: 'Personal',
  travel: 'Travel',
  giving: 'Giving',
  other: 'Other',
};

/** A blank line for `owner`, ready to edit — an allowance for an adult, a shared bill otherwise. */
export function newBudgetLine(plan: Plan, owner: string): BudgetLine {
  const person = plan.participants.find((p) => p.id === owner);
  const isAdult = person && person.role !== 'child';
  return {
    id: `bl-${Math.random().toString(36).slice(2, 9)}`,
    name: isAdult ? `${person.name}'s allowance` : person ? `${person.name} — ` : '',
    owner,
    category: isAdult ? 'personal' : 'other',
    essential: !isAdult,
    kind: isAdult ? 'allowance' : 'expense',
    cadence: 'monthly',
    amount: 0,
    isIncluded: true,
  };
}

/**
 * One budget line, every field (docs/REDESIGN-V4.md §4.2). Amounts are in
 * today's dollars; start and end can be a year, "when <event>", or an age —
 * which is what lets rent end when the home is bought.
 */
export function BudgetLineDrawer({
  line,
  plan,
  isNew,
  onSave,
  onDelete,
  onCancel,
}: {
  line: BudgetLine;
  plan: Plan;
  isNew: boolean;
  onSave(line: BudgetLine): void;
  onDelete(): void;
  onCancel(): void;
}) {
  const [draft, setDraft] = useState(line);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setDraft(line), [line]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const set = (patch: Partial<BudgetLine>) => setDraft((d) => ({ ...d, ...patch }));
  const people = plan.participants.filter((p) => p.isIncluded);
  const savingAccounts = plan.accounts.filter((a) => a.isIncluded && !a.isLiability && !a.isSynthetic);
  const invalid = !draft.name.trim() || draft.amount <= 0 || (draft.kind === 'saving' && !draft.accountId);

  return (
    <>
      <div className="ns-scrim" onClick={onCancel} />
      <aside className="ns-drawer" role="dialog" aria-modal="true" aria-label="Budget line">
        <header className="ns-drawer-head">
          <div className="ns-drawer-title">{isNew ? 'New budget line' : draft.name || 'Budget line'}</div>
          <button type="button" className="ns-btn-ghost" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="ns-drawer-body">
          <Field label="Name">
            <input className="ns-input" value={draft.name} autoFocus={isNew} onChange={(e) => set({ name: e.target.value })} />
          </Field>

          <Field label="Whose">
            <select className="ns-input" value={draft.owner} onChange={(e) => set({ owner: e.target.value })}>
              <option value="shared">Shared</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.role === 'child' ? ' (child)' : ''}
                </option>
              ))}
            </select>
          </Field>

          <Choice
            label="What it is"
            value={draft.kind}
            options={[
              { value: 'expense', label: 'Spending' },
              { value: 'allowance', label: 'Allowance' },
              { value: 'saving', label: 'Saving' },
            ]}
            hint={
              draft.kind === 'allowance'
                ? 'Money moved to a personal account to spend freely — assumed spent.'
                : draft.kind === 'saving'
                  ? 'Moves money into an account each month — out of the budget, but not spent.'
                  : undefined
            }
            onChange={(kind) => set({ kind, ...(kind === 'allowance' ? { essential: false, category: 'personal' } : {}) })}
          />

          {draft.kind === 'saving' && (
            <Field label="Into">
              <select className="ns-input" value={draft.accountId ?? ''} onChange={(e) => set({ accountId: e.target.value || undefined })}>
                <option value="">Choose an account…</option>
                {savingAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="ns-field-pair">
            <Field label={draft.cadence === 'monthly' ? "Per month, today's $" : "Total, today's $"}>
              <NumberInput value={draft.amount} unit="currency" step={50} min={0} onChange={(v) => set({ amount: v ?? 0 })} />
            </Field>
            <Choice
              label="How often"
              value={draft.cadence}
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'once', label: 'Once' },
              ]}
              onChange={(cadence) => set({ cadence })}
            />
          </div>

          {draft.kind !== 'saving' && (
            <div className="ns-field-pair">
              <Field label="Category">
                <select className="ns-input" value={draft.category} onChange={(e) => set({ category: e.target.value as BudgetCategory })}>
                  {(Object.keys(CATEGORY_LABELS) as BudgetCategory[]).map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Choice
                label="Type"
                value={draft.essential ? 'fixed' : 'flexible'}
                options={[
                  { value: 'fixed', label: 'Fixed' },
                  { value: 'flexible', label: 'Flexible' },
                ]}
                onChange={(v) => set({ essential: v === 'fixed' })}
              />
            </div>
          )}

          <AnchorField
            label={draft.cadence === 'once' ? 'When' : 'Starts'}
            noneLabel="Now"
            value={draft.from}
            plan={plan}
            owner={draft.owner}
            onChange={(from) => set({ from })}
          />
          {draft.cadence === 'monthly' && (
            <AnchorField
              label="Stops"
              noneLabel="Never"
              value={draft.until}
              plan={plan}
              owner={draft.owner}
              onChange={(until) => set({ until })}
            />
          )}

          <Choice
            label="Grows with"
            value={draft.growth?.kind ?? 'inflation'}
            options={[
              { value: 'inflation', label: 'Inflation' },
              { value: 'fixed', label: 'Its own rate' },
              { value: 'none', label: 'Stays flat' },
            ]}
            onChange={(kind) =>
              set({ growth: kind === 'fixed' ? { kind, rate: draft.growth?.kind === 'fixed' ? draft.growth.rate : 4 } : { kind } })
            }
          />
          {draft.growth?.kind === 'fixed' && (
            <Field label="Rate per year">
              <NumberInput
                value={draft.growth.rate}
                unit="percent"
                step={0.5}
                onChange={(v) => set({ growth: { kind: 'fixed', rate: v ?? 0 } })}
              />
            </Field>
          )}
        </div>

        <footer className="ns-drawer-foot">
          {!isNew &&
            (confirming ? (
              <button type="button" className="ns-btn ns-btn-danger" onClick={onDelete}>
                Delete — are you sure?
              </button>
            ) : (
              <button type="button" className="ns-btn ns-btn-danger-ghost" onClick={() => setConfirming(true)}>
                Delete
              </button>
            ))}
          <div className="ns-drawer-foot-right">
            <button type="button" className="ns-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="ns-btn ns-btn-primary" disabled={invalid} onClick={() => onSave({ ...draft, name: draft.name.trim() })}>
              {isNew ? 'Add line' : 'Save'}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}

type AnchorMode = 'none' | 'year' | 'event' | 'age';

/** A start or stop: unset, a year, when an event happens, or when its owner reaches an age. */
function AnchorField({
  label,
  noneLabel,
  value,
  plan,
  owner,
  onChange,
}: {
  label: string;
  noneLabel: string;
  value: Anchor | undefined;
  plan: Plan;
  owner: string;
  onChange(value: Anchor | undefined): void;
}) {
  const person = plan.participants.find((p) => p.id === owner);
  const events = plan.events.filter((e) => e.isIncluded && !e.isHidden && e.kind !== 'endOfPlan');
  const mode: AnchorMode = value?.kind ?? 'none';
  const options: { value: AnchorMode; label: string }[] = [
    { value: 'none', label: noneLabel },
    { value: 'year', label: 'In a year' },
    ...(events.length ? [{ value: 'event' as const, label: 'When…' }] : []),
    ...(person ? [{ value: 'age' as const, label: `At ${person.name}'s age` }] : []),
  ];

  const setMode = (m: AnchorMode) => {
    if (m === 'none') onChange(undefined);
    else if (m === 'year') onChange({ kind: 'year', year: plan.settings.startYear + 1 });
    else if (m === 'event') onChange({ kind: 'event', eventId: events[0].id });
    else if (person) onChange({ kind: 'age', participantId: person.id, age: person.role === 'child' ? 5 : 60 });
  };

  return (
    <div className="ns-field">
      <span className="ns-field-label">{label}</span>
      <div className="ns-choice">
        {options.map((o) => (
          <button key={o.value} type="button" className="ns-choice-opt" aria-pressed={mode === o.value} onClick={() => setMode(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
      {value?.kind === 'year' && (
        <NumberInput value={value.year} unit="year" step={1} onChange={(v) => v && onChange({ kind: 'year', year: v })} />
      )}
      {value?.kind === 'event' && (
        <select className="ns-input" value={value.eventId} onChange={(e) => onChange({ kind: 'event', eventId: e.target.value })}>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.startYear})
            </option>
          ))}
        </select>
      )}
      {value?.kind === 'age' && (
        <NumberInput
          value={value.age}
          unit="age"
          step={1}
          min={0}
          onChange={(v) => v !== undefined && onChange({ kind: 'age', participantId: value.participantId, age: v })}
        />
      )}
    </div>
  );
}
