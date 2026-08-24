import { useMemo } from 'react';
import type { Plan, PlanResult } from '@northstar/engine';
import { diffOutcomes, diffPlans } from './diff';

/**
 * Turns "two lines on a chart" into an answer (docs/BORROW.md §6): what
 * changed between the active plan and the one it's being compared against,
 * and what that change is worth.
 */
const MAX_ROWS = 6;

export function CompareDiff({
  plan,
  comparePlan,
  result,
  compareResult,
}: {
  plan: Plan;
  comparePlan: Plan;
  result: PlanResult;
  compareResult: PlanResult;
}) {
  const changes = useMemo(() => diffPlans(plan, comparePlan), [plan, comparePlan]);
  const outcomes = useMemo(() => diffOutcomes(result, compareResult), [result, compareResult]);

  if (changes.length === 0 && outcomes.length === 0) return null;

  return (
    <div className="ns-compare-diff">
      {changes.length > 0 && (
        <div className="ns-compare-diff-col">
          <div className="ns-compare-diff-label">What's different</div>
          <ul className="ns-compare-diff-list">
            {changes.slice(0, MAX_ROWS).map((c, i) => (
              <li key={i}>{c.sentence}</li>
            ))}
            {changes.length > MAX_ROWS && <li className="ns-subtle">+{changes.length - MAX_ROWS} more</li>}
          </ul>
        </div>
      )}
      {outcomes.length > 0 && (
        <div className="ns-compare-diff-col">
          <div className="ns-compare-diff-label">What it costs</div>
          <ul className="ns-compare-diff-list">
            {outcomes.map((o, i) => (
              <li key={i}>
                <span className="ns-compare-diff-outcome-label">{o.label}</span> {o.sentence}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
