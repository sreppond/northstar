import { TriangleAlert } from 'lucide-react';
import { usePlanner } from './PlannerContext';
import { planChecks, type PlanCheck } from './checks';

/**
 * Plan checks as quiet banners, each with its fix or a jump to what to review
 * (docs/REDESIGN-V4.md §1.8). Renders nothing when the plan is fine. Shown
 * where each mistake bites — `only` narrows the list for a page that cares
 * about some checks and not others.
 */
export function PlanCheckBanner({ only }: { only?: string[] }) {
  const { stored, replacePlan, editor, setAccountDraft } = usePlanner();
  const checks = planChecks(stored).filter((c) => !only || only.includes(c.id));
  if (checks.length === 0) return null;

  const act = (check: PlanCheck) => {
    const a = check.action;
    if (!a) return;
    if (a.kind === 'fix') replacePlan(a.fixed, a.toast);
    else if (a.kind === 'editEvent') {
      const event = stored.events.find((e) => e.id === a.eventId);
      if (event) editor.edit(event);
    } else {
      const account = stored.accounts.find((x) => x.id === a.accountId);
      if (account) setAccountDraft(structuredClone(account));
    }
  };

  return (
    <div className="ns-checks">
      {checks.map((check) => (
        <div key={check.id} className="ns-check-banner" role="status">
          <TriangleAlert size={15} strokeWidth={1.75} aria-hidden className="ns-check-banner-icon" />
          <span className="ns-check-banner-text">{check.message}</span>
          {check.action && (
            <button type="button" className="ns-btn" onClick={() => act(check)}>
              {check.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
