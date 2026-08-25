import { useEffect, useMemo, useState } from 'react';
import type { Account, Goal, Plan, PriorityRule, RuleType } from '@northstar/engine';
import { ACCOUNT_TYPES, isWithdrawable, mergeGoalRules, runPlan } from '@northstar/engine';
import { signedMoney } from '../format';
import { Choice, Field, NumberInput } from './fields';
import { GoalWaterfall } from './GoalWaterfall';

/**
 * Plan-level assumptions, the household, the Goals waterfall, and — behind a
 * disclosure — the two raw priority waterfalls (docs/REDESIGN.md §4.5).
 *
 * Progressive disclosure: spending, income, inflation, tax and dollar mode
 * are what nearly every visit here is for, so they stay on the surface.
 * Per-account priority order is the rarely-touched machinery underneath a
 * goal ("fund the house, then retirement"), so it moves behind
 * `.ns-disclosure`, closed by default — same pattern `RetirementForecastView`
 * already uses for SEPP, reused rather than reinvented. Per-account TAX
 * treatment (§4.5's other example of "powerful machinery") lives on the
 * account itself (`AccountDrawer`), not in this drawer, so there is nothing
 * of that kind to relocate here.
 *
 * The waterfalls are the mechanic behind every shortfall and surplus in the
 * projection: which accounts get drained when a year comes up short, and where
 * the money goes when it does not. Both are ordered lists, so the UI is a
 * checkbox to take part and arrows to set position.
 */
interface Props {
  draft: Plan;
  /** The plan as last saved — the baseline every field's impact preview diffs against. */
  saved: Plan;
  accounts: Account[];
  onChange(next: Plan): void;
  onSave(): void;
  onCancel(): void;
}

const IMPACT_FIELDS = ['baselineExpenses', 'baselineIncome', 'inflationRate', 'incomeTaxRate'] as const;
type ImpactField = (typeof IMPACT_FIELDS)[number];

export function AssumptionsDrawer({ draft, saved, accounts, onChange, onSave, onCancel }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

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

  // Goals stay a friendly surface over the SAME `mergeGoalRules` derivation
  // the store's own goal actions run (docs/REDESIGN.md §2.2) — but applied
  // to the DRAFT, not the store, so a reorder previews live and is free to
  // Cancel exactly like every other field here, instead of committing early
  // and going stale the moment the draft's own Save later overwrites it.
  const setGoals = (goals: Goal[]) => {
    const withGoals = { ...draft, goals };
    onChange({ ...withGoals, rules: mergeGoalRules(withGoals) });
  };

  // Inline impact preview (docs/REDESIGN.md §4.5): each field below reruns
  // the plan with just ITS OWN edit reverted to the saved value, and diffs
  // that against the draft as it stands — isolating what that one field's
  // change, specifically, is doing to the horizon net worth, even while
  // other fields are also mid-edit. `runPlan` is microseconds (the chart's
  // fan and the retirement sweep already call it many times a render), so up
  // to five extra calls here — one shared, one per changed field — costs
  // nothing worth guarding further than this one memo.
  const impacts = useMemo(() => {
    const horizon = (p: Plan) => {
      const years = runPlan(p).years;
      return years[years.length - 1];
    };
    const draftEnd = horizon(draft);
    const out: Partial<Record<ImpactField, { fieldDelta: number; netWorthDelta: number; year: number }>> = {};
    if (!draftEnd) return out;

    for (const key of IMPACT_FIELDS) {
      const draftValue = draft.settings[key];
      const savedValue = saved.settings[key];
      if (draftValue === savedValue) continue;
      const isolated = { ...draft, settings: { ...draft.settings, [key]: savedValue } };
      const isolatedEnd = horizon(isolated);
      if (!isolatedEnd) continue;
      out[key] = {
        fieldDelta: draftValue - savedValue,
        netWorthDelta: draftEnd.netWorth - isolatedEnd.netWorth,
        year: draftEnd.year,
      };
    }
    return out;
  }, [draft, saved]);

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
            <Field
              label="As of"
              hint={`Balances are current as of this date. ${draft.settings.startYear} is prorated in the forecast to whatever is left of it from here.`}
            >
              <input
                type="date"
                className="ns-input"
                min={`${draft.settings.startYear}-01-01`}
                max={`${draft.settings.startYear}-12-31`}
                value={draft.settings.asOfDate ?? `${draft.settings.startYear}-01-01`}
                onChange={(e) => setSetting('asOfDate', e.target.value || undefined)}
              />
            </Field>

            <Field label="Yearly living expenses" impact={<Impact field={impacts.baselineExpenses} unit="currency" />}>
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
              impact={<Impact field={impacts.baselineIncome} unit="currency" />}
            >
              <NumberInput
                value={draft.settings.baselineIncome}
                unit="currency"
                step={1000}
                min={0}
                onChange={(v) => setSetting('baselineIncome', v ?? 0)}
              />
            </Field>

            <Field label="Inflation rate" impact={<Impact field={impacts.inflationRate} unit="percent" />}>
              <NumberInput
                value={draft.settings.inflationRate}
                unit="percent"
                step={0.1}
                min={0}
                onChange={(v) => setSetting('inflationRate', v ?? 0)}
              />
            </Field>

            <Field
              label="Income tax rate"
              hint="Flat effective rate on ordinary income."
              impact={<Impact field={impacts.incomeTaxRate} unit="percent" />}
            >
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

          <Section
            title="Household"
            blurb="Ages drive retirement, Social Security and the end of the plan."
          >
            {draft.participants.map((person, i) => (
              <div key={person.id} className="ns-person">
                <div className="ns-person-head">
                  <span className="ns-person-index">Person {i + 1}</span>
                  {draft.participants.length > 1 && (
                    <button
                      type="button"
                      className="ns-btn-ghost"
                      onClick={() =>
                        onChange({
                          ...draft,
                          participants: draft.participants.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
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

            <div className="ns-add-cell">
              <button
                type="button"
                className="ns-add-pill"
                onClick={() =>
                  onChange({
                    ...draft,
                    participants: [
                      ...draft.participants,
                      {
                        id: `p-${Math.random().toString(36).slice(2, 8)}`,
                        name: 'Partner',
                        birthYear: draft.participants[0]?.birthYear ?? 1990,
                        lifeExpectancy: draft.participants[0]?.lifeExpectancy ?? 90,
                        isIncluded: true,
                      },
                    ],
                  })
                }
              >
                + Add person
              </button>
            </div>
          </Section>

          <Section
            title="Goals"
            blurb="Every year with money left over, it fills these in order — drag to change the order."
          >
            <GoalWaterfall goals={draft.goals ?? []} onReorder={setGoals} />
          </Section>

          <div className="ns-disclosure">
            <button
              type="button"
              className="ns-disclosure-trigger"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              <span>Priority rules by account</span>
              <span className="ns-disclosure-chevron" aria-hidden="true">
                {advancedOpen ? '−' : '+'}
              </span>
            </button>
            {advancedOpen && (
              <div className="ns-disclosure-body">
                <Section
                  title="Where surplus goes"
                  blurb="In a year with money left over, it fills these in order. Anything left lands in cash. Goals above generate entries here automatically — this is the account-level detail underneath them."
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
            )}
          </div>
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

/**
 * One field's live consequence (docs/REDESIGN.md §4.5): "+0.5% → −$180K at
 * 2046." Colour follows the same in/out convention as the ledger's magnitude
 * bars — richer at the horizon reuses `--in`, poorer reuses `--out` — rather
 * than a third hue, per REDESIGN.md §5.1.
 */
function Impact({
  field,
  unit,
}: {
  field: { fieldDelta: number; netWorthDelta: number; year: number } | undefined;
  unit: 'currency' | 'percent';
}) {
  if (!field) return null;
  const tone = field.netWorthDelta > 0 ? 'in' : field.netWorthDelta < 0 ? 'out' : undefined;
  const fieldStr = unit === 'percent' ? signedPercent(field.fieldDelta) : signedMoney(field.fieldDelta);
  return (
    <span className={`ns-field-impact${tone ? ` ns-field-impact-${tone}` : ''}`}>
      {fieldStr} → {signedMoney(field.netWorthDelta)} at {field.year}
    </span>
  );
}

function signedPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
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
