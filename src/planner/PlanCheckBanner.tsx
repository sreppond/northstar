import { TriangleAlert } from 'lucide-react';
import { usePlanner } from './PlannerContext';
import { horizonCheck } from './checks';

/**
 * A plan check as a quiet banner with its fix (docs/REDESIGN-V4.md §1.8).
 * Renders nothing when the plan is fine. Shown on the pages where the
 * mistake actually bites — Overview, Timeline, Retirement — rather than in
 * a warnings list nobody opens.
 */
export function PlanCheckBanner() {
  const { stored, replacePlan } = usePlanner();
  const check = horizonCheck(stored);
  if (!check) return null;

  return (
    <div className="ns-check-banner" role="status">
      <TriangleAlert size={15} strokeWidth={1.75} aria-hidden className="ns-check-banner-icon" />
      <span className="ns-check-banner-text">{check.message}</span>
      <button type="button" className="ns-btn" onClick={() => replacePlan(check.fixed, check.fixLabel.replace('Run', 'Plan now runs'))}>
        {check.fixLabel}
      </button>
    </div>
  );
}
