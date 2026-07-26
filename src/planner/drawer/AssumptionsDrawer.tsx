import { useEffect } from 'react';
import type { Account, Plan, PriorityRule, RuleType } from '@northstar/engine';
import { ACCOUNT_TYPES, isWithdrawable } from '@northstar/engine';
import { Choice, Field, NumberInput } from './fields';

/**
 * Plan-level assumptions, the household, and the two priority waterfalls.
 *
 * The waterfalls are the mechanic behind every shortfall and surplus in the
 * projection: which accounts get drained when a year comes up short, and where
 * the money goes when it does not. Both are ordered lists, so the UI is a
 * checkbox to take part and arrows to set position.
 */
interface Props {
  draft: Plan;
  accounts: Account[];
  onChange(next: Plan): void;
  onSave(): void;
  onCancel(): void;
}

export function AssumptionsDrawer({ draft, accounts, onChange, onSave, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const setSetting = <K extends keyof Plan['settings']>(key: K, value: Plan['settings'][K]) =>
    onChange({ ...draft, settings: { ...draft.settings, [key]: value } });

  const setRules = (rules: PriorityRule[]) => onChange({ ...draft, rules });

  return (
    <>
      <div className="ns-scrim" onClick={onCancel} />
      <aside className="ns-drawer" role="dialog" aria-modal="true" aria-label="Plan assumptions">
        <header className="ns-drawer-head">
          <div className="ns-drawer-title">Assumptions</div>
          <button type="button" className="ns-btn-ghost" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="ns-drawer-body">
          <Section title="Plan">
            <Field label="Yearly living expenses">
              <NumberInput
                value={draft.settings.baselineExpenses}
                unit="currency"
                step={1000}
                min={0}
                onChange={(v) => setSetting('baselineExpenses', v ?? 0)}
              />
            </Field>

            <Field
              label="Baseline income"
              hint="Standing income not tied to a job or income event."
            >
              <NumberInput
                value={draft.settings.baselineIncome}
                unit="currency"
                step={1000}
                min={0}
                onChange={(v) => setSetting('baselineIncome', v ?? 0)}
              />
            </Field>

            <Field label="Inflation rate">
              <NumberInput
                value={draft.settings.inflationRate}
                unit="percent"
                step={0.1}
                min={0}
                onChange={(v) => setSetting('inflationRate', v ?? 0)}
              />
            </Field>

            <Field label="Income tax rate" hint="Flat effective rate on ordinary income.">
              <NumberInput
                value={draft.settings.incomeTaxRate}
                unit="percent"
                step={0.5}
                min={0}
                max={100}
                onChange={(v) => setSetting('incomeTaxRate', v ?? 0)}
              />
            </Field>

            <Choice
              label="Show future values in"
              value={draft.settings.dollarMode}
              options={[
                { value: 'futureDollars', label: 'Future dollars' },
                { value: 'todaysDollars', label: "Today's dollars" },
              ]}
              hint="Display only — the projection always runs in nominal dollars."
              onChange={(v) => setSetting('dollarMode', v)}
            />
          </Section>

          <Section title="Household">
            {draft.participants.map((person, i) => (
              <div key={person.id} className="ns-person">
                <Field label="Name">
                  <input
                    className="ns-input"
                    value={person.name}
                    onChange={(e) =>
                      onChange({
                        ...draft,
                        participants: draft.participants.map((p, j) =>
                          j === i ? { ...p, name: e.target.value } : p,
                        ),
                      })
                    }
                  />
                </Field>
                <div className="ns-field-pair">
                  <Field label="Birth year">
                    <NumberInput
                      value={person.birthYear}
                      unit="year"
                      step={1}
                      onChange={(v) =>
                        onChange({
                          ...draft,
                          participants: draft.participants.map((p, j) =>
                            j === i ? { ...p, birthYear: v ?? p.birthYear } : p,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Life expectancy">
                    <NumberInput
                      value={person.lifeExpectancy}
                      unit="age"
                      step={1}
                      onChange={(v) =>
                        onChange({
                          ...draft,
                          participants: draft.participants.map((p, j) =>
                            j === i ? { ...p, lifeExpectancy: v ?? p.lifeExpectancy } : p,
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
              </div>
            ))}
          </Section>

          <Section
            title="Where surplus goes"
            blurb="In a year with money left over, it fills these in order. Anything left lands in cash."
          >
            <Waterfall
              ruleType="allocation"
              rules={draft.rules}
              accounts={accounts}
              startYear={draft.settings.startYear}
              onChange={setRules}
            />
          </Section>

          <Section
            title="What gets drained first"
            blurb="In a year that comes up short, these are tapped in order until the gap is covered."
          >
            <Waterfall
              ruleType="withdrawal"
              rules={draft.rules}
              accounts={accounts}
              startYear={draft.settings.startYear}
              onChange={setRules}
            />
          </Section>
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

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ns-section">
      <div className="ns-section-title">{title}</div>
      {blurb && <p className="ns-drawer-hint">{blurb}</p>}
      {children}
    </div>
  );
}

function Waterfall({
  ruleType,
  rules,
  accounts,
  startYear,
  onChange,
}: {
  ruleType: RuleType;
  rules: PriorityRule[];
  accounts: Account[];
  startYear: number;
  onChange(rules: PriorityRule[]): void;
}) {
  // Surplus can be saved into an asset or thrown at a debt; a withdrawal can
  // only come from an asset. Synthetic assets are excluded either way — you
  // cannot deposit into a house, nor sell a slice of one to cover a shortfall.
  const eligible = accounts.filter((a) =>
    ruleType === 'allocation' ? a.isLiability || !a.isSynthetic : !a.isLiability && !a.isSynthetic,
  );

  const mine = rules
    .filter((r) => r.ruleType === ruleType)
    .filter((r) => eligible.some((a) => a.id === r.accountId))
    .sort((a, b) => a.order - b.order);

  const others = rules.filter((r) => r.ruleType !== ruleType);
  const unused = eligible.filter((a) => !mine.some((r) => r.accountId === a.id));

  const commit = (next: PriorityRule[]) =>
    onChange([...others, ...next.map((r, i) => ({ ...r, order: i + 1 }))]);

  const move = (index: number, delta: number) => {
    const next = [...mine];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  return (
    <div className="ns-waterfall">
      {mine.length === 0 && <p className="ns-drawer-hint">Nothing in this order yet.</p>}

      {mine.map((rule, i) => {
        const account = accounts.find((a) => a.id === rule.accountId);
        const spec = account ? ACCOUNT_TYPES[account.accountClass] : undefined;
        // A withdrawal rule on an account the plan may never touch is inert.
        // Say so rather than letting it look active.
        const inert =
          ruleType === 'withdrawal' && account ? !isWithdrawable(account, startYear) : false;

        return (
          <div key={rule.accountId} className="ns-wf-row">
            <span className="ns-wf-order ns-num">{i + 1}</span>
            <span className="ns-wf-name">
              {spec?.label ?? account?.name ?? rule.accountId}
              {inert && <span className="ns-wf-warn">not available to spend</span>}
            </span>
            <button
              type="button"
              className="ns-wf-btn"
              aria-label="Move earlier"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="ns-wf-btn"
              aria-label="Move later"
              disabled={i === mine.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="ns-wf-btn ns-wf-remove"
              aria-label="Remove"
              onClick={() => commit(mine.filter((r) => r.accountId !== rule.accountId))}
            >
              ✕
            </button>
          </div>
        );
      })}

      {unused.length > 0 && (
        <div className="ns-add-cell">
          <span className="ns-add-label">Add</span>
          {unused.map((account) => (
            <button
              key={account.id}
              type="button"
              className="ns-add-pill"
              onClick={() =>
                commit([...mine, { accountId: account.id, ruleType, order: mine.length + 1 }])
              }
            >
              + {ACCOUNT_TYPES[account.accountClass].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
