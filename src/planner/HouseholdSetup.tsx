import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { usePlanner } from './PlannerContext';
import { toHouseholdModel } from './household';
import { EmptyState } from './ui';

/**
 * The way into the household model for a plan that predates it
 * (docs/REDESIGN-V4.md §5, "Migration"): an explanation, then a review of
 * exactly what will change and what still needs a decision, then one Apply
 * that a single undo reverses. Shown by Budget and Family until the plan has
 * a budget.
 */
export function HouseholdSetup({ page }: { page: 'budget' | 'family' }) {
  const { stored, replacePlan } = usePlanner();
  const [reviewing, setReviewing] = useState(false);
  const migration = useMemo(() => toHouseholdModel(stored), [stored]);

  return (
    <>
      <div className="ns-card">
        <EmptyState
          icon={Users}
          title={page === 'budget' ? 'Set up your household budget' : 'Set up your household'}
          body={
            page === 'budget'
              ? "See your money the way you spend it: a shared pool for bills, an allowance for each of you, each kid's costs by age, and what's left to save — every month, in today's dollars."
              : "Make each of you, and each kid, a member of the plan: whose pay is whose, time off with the kids, and what each child costs as they grow."
          }
          action={
            <button type="button" className="ns-btn ns-btn-primary" onClick={() => setReviewing(true)}>
              Review the changes
            </button>
          }
        />
      </div>

      {reviewing && (
        <>
          <div className="ns-scrim" onClick={() => setReviewing(false)} />
          <aside className="ns-drawer" role="dialog" aria-modal="true" aria-label="Set up the household">
            <header className="ns-drawer-head">
              <div className="ns-drawer-title">Set up the household</div>
              <button type="button" className="ns-btn-ghost" onClick={() => setReviewing(false)} aria-label="Close">
                ✕
              </button>
            </header>
            <div className="ns-drawer-body">
              <p className="ns-drawer-hint">
                Your forecast's numbers stay the same unless a note below says otherwise. One undo puts everything back.
              </p>

              <div className="ns-setup-list">
                <div className="ns-retain-title">What changes</div>
                {migration.changes.length === 0 ? (
                  <p className="ns-drawer-hint">Nothing to move — the plan starts with an empty budget.</p>
                ) : (
                  <ul>
                    {migration.changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
              </div>

              {migration.needsReview.length > 0 && (
                <div className="ns-setup-list ns-setup-review">
                  <div className="ns-retain-title">Worth a look after</div>
                  <ul>
                    {migration.needsReview.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <footer className="ns-drawer-foot">
              <div className="ns-drawer-foot-right">
                <button type="button" className="ns-btn" onClick={() => setReviewing(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="ns-btn ns-btn-primary"
                  onClick={() => {
                    replacePlan(migration.plan, 'Household set up');
                    setReviewing(false);
                  }}
                >
                  Set it up
                </button>
              </div>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}
