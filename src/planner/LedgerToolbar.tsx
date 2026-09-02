import { usePlanner } from './PlannerContext';
import { CompareDiff } from './CompareDiff';

/**
 * The Compare picker + year-window pager, shared by the three ledger pages
 * (Accounts / Cash Flow / Events — `pages/*.tsx`). Used to be one row shared
 * by an in-card tab switcher before those three became top-level routes
 * (docs/BORROW.md-style sidebar/IA port); the tab switcher itself is gone —
 * that job now belongs to `Sidebar.tsx`'s nav links — but the compare/pager
 * controls and the diff panel beneath them are unchanged.
 */
export function LedgerToolbar({ showPager }: { showPager: boolean }) {
  const {
    plans,
    stored,
    plan,
    result,
    comparePlan,
    compare,
    updateSettings,
    windowLabel,
    clampedStart,
    maxStart,
    pageEarlier,
    pageLater,
  } = usePlanner();

  return (
    <>
      <div className="ns-tabbar">
        <div className="ns-compare">
          <label className="ns-compare-label" htmlFor="ns-compare-select">
            Compare
          </label>
          <select
            id="ns-compare-select"
            className="ns-select"
            value={stored.settings.compareToPlanId ?? ''}
            onChange={(e) =>
              updateSettings(stored.id, { compareToPlanId: e.target.value || undefined })
            }
          >
            <option value="">None</option>
            {plans
              .filter((p) => p.id !== stored.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>

        {showPager && (
          <div className="ns-window">
            <span className="ns-window-label">{windowLabel}</span>
            <button
              type="button"
              className="ns-btn ns-btn-square"
              aria-label="Earlier years"
              disabled={clampedStart === 0}
              onClick={pageEarlier}
            >
              ←
            </button>
            <button
              type="button"
              className="ns-btn ns-btn-square"
              aria-label="Later years"
              disabled={clampedStart >= maxStart}
              onClick={pageLater}
            >
              →
            </button>
          </div>
        )}
      </div>

      {comparePlan && compare && (
        <CompareDiff plan={plan} comparePlan={comparePlan} result={result} compareResult={compare.result} />
      )}
    </>
  );
}
