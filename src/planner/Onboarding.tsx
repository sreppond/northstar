import { useState } from 'react';
import { newAccountOfType } from '@northstar/engine';
import type { Account } from '@northstar/engine';
import { usePlanStore } from './store/planStore';
import { AccountDrawer } from './drawer/AccountDrawer';
import { EventDrawer } from './drawer/EventDrawer';
import { useEventEditor } from './drawer/useEventEditor';
import { Field } from './drawer/fields';

/**
 * The first-run landing (docs/REDESIGN.md §6 item 6, §4.5). Before this, a
 * genuinely empty store silently seeded two fabricated "Amazon" scenarios
 * (`samplePlan.ts`) as if they were the user's own money — `planStore.ts`'s
 * `loadPlans()` no longer does that, and `App.tsx` renders this screen
 * instead whenever `plans` is empty.
 *
 * Deliberately not a wizard: two stages, no progress bar, no dead ends.
 *
 *  1. A name for the plan and a birth year — the two things nothing else
 *     here can work without.
 *  2. Once that plan exists, add a first job or account by reusing the
 *     SAME `EventDrawer` / `AccountDrawer` the rest of the app edits with —
 *     no bespoke onboarding form — or skip straight in.
 *
 * `samplePlan.ts`'s data stays reachable, just no longer the silent default:
 * "Load an example" calls the store's own `reset()`, the same action that
 * already means "restore the sample plans," and exits onboarding entirely,
 * since a fully-populated example has nothing left to author.
 */
export function Onboarding({ onBegin, onFinish }: { onBegin(): void; onFinish(): void }) {
  const plans = usePlanStore((s) => s.plans);
  const startPlan = usePlanStore((s) => s.startPlan);
  const loadExample = usePlanStore((s) => s.reset);
  const upsertEvent = usePlanStore((s) => s.upsertEvent);
  const upsertAccount = usePlanStore((s) => s.upsertAccount);

  const [name, setName] = useState('My plan');
  const [birthYear, setBirthYear] = useState('');
  const editor = useEventEditor();
  const [accountDraft, setAccountDraft] = useState<Account | null>(null);

  // `plans[0]` only exists once `startPlan` below has run — everywhere in
  // this component that reads it is inside the `if (plan)` branch.
  const plan = plans[0];

  const canStart = name.trim().length > 0 && /^\d{4}$/.test(birthYear.trim());

  const begin = () => {
    if (!canStart || plan) return; // a stray double-submit should not create a second plan
    startPlan(name.trim(), Number(birthYear));
    onBegin();
  };

  if (!plan) {
    return (
      <div className="ns ns-auth-page">
        <div className="ns-auth-card">
          <div className="ns-auth-title">Welcome to Northstar</div>
          <p className="ns-auth-blurb">
            Nothing is saved here yet, so there is nothing to show you but your own plan. Tell us who
            it is for and we will get out of the way.
          </p>

          <form
            className="ns-auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              begin();
            }}
          >
            <Field label="Plan name">
              <input className="ns-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Your birth year" hint="Drives retirement, Social Security and the plan's horizon.">
              <input
                className="ns-input ns-num"
                inputMode="numeric"
                placeholder="1990"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              />
            </Field>

            <button type="submit" className="ns-btn ns-btn-primary ns-auth-submit" disabled={!canStart}>
              Start planning
            </button>
          </form>

          <button type="button" className="ns-onboard-example" onClick={() => { loadExample(); onFinish(); }}>
            Or load an example plan to explore first
          </button>
        </div>
      </div>
    );
  }

  const planEndYear =
    plan.events.find((e) => e.kind === 'endOfPlan')?.startYear ?? plan.settings.startYear + 20;

  return (
    <div className="ns ns-auth-page">
      <div className="ns-auth-card">
        <div className="ns-auth-title">{plan.name} is ready</div>
        <p className="ns-auth-blurb">
          Add what you have actually got — a job, an account — or skip in and add it later from the
          plan itself.
        </p>

        <div className="ns-onboard-actions">
          <button type="button" className="ns-btn ns-onboard-btn" onClick={() => editor.startNew()}>
            + Add a job or income
          </button>
          <button
            type="button"
            className="ns-btn ns-onboard-btn"
            onClick={() => setAccountDraft(newAccountOfType('cash'))}
          >
            + Add an account
          </button>
          <button type="button" className="ns-btn ns-btn-primary ns-onboard-btn" onClick={onFinish}>
            Enter Northstar →
          </button>
        </div>
      </div>

      {editor.open && (
        <EventDrawer
          draft={editor.draft}
          allEvents={plan.events}
          participants={plan.participants}
          accounts={plan.accounts}
          planStartYear={plan.settings.startYear}
          planEndYear={planEndYear}
          isNew={editor.isNew}
          onChange={editor.change}
          onPickKind={(kind) => editor.pickKind(kind, plan)}
          onSave={() => {
            if (editor.draft) upsertEvent(plan.id, editor.draft);
            editor.close();
          }}
          onCancel={editor.close}
          onDelete={editor.close}
        />
      )}

      {accountDraft && (
        <AccountDrawer
          draft={accountDraft}
          synthetic={[]}
          planStartYear={plan.settings.startYear}
          planEndYear={planEndYear}
          onChange={setAccountDraft}
          onSave={() => {
            upsertAccount(plan.id, accountDraft);
            setAccountDraft(null);
          }}
          onCancel={() => setAccountDraft(null)}
        />
      )}
    </div>
  );
}
