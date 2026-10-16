import { usePlanner } from './PlannerContext';
import { planChecks, type PlanCheck } from './checks';
import { DismissibleAlert } from './ui/Alert';

/**
 * Plan checks as dismissible warnings, each with its fix or a jump to what to
 * review (docs/REDESIGN-V4.md §1.8, docs/REDESIGN-V5.md §4.3). Renders nothing
 * when the plan is fine. Shown where each mistake bites — `only` narrows the
 * list for a page that cares about some checks and not others.
 *
 * The signature is the check's message, so dismissing "Retirement isn't set"
 * stays dismissed until the plan changes into a *different* problem.
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
        <DismissibleAlert
          // Two checks can share an id (rent-after-purchase) with different messages.
          key={`${check.id}:${check.message}`}
          planId={stored.id}
          id={check.id}
          signature={check.message}
          tone="warning"
          action={check.action ? { label: check.action.label, onClick: () => act(check) } : undefined}
        >
          {check.message}
        </DismissibleAlert>
      ))}
    </div>
  );
}
