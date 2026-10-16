import { useNavigate } from 'react-router-dom';
import { usePlanner } from './PlannerContext';
import { DismissibleAlert } from './ui/Alert';
import { money } from './format';

/**
 * The top-of-page "this plan runs out of money" alert (docs/REDESIGN-V5.md
 * §4.2.3). Rendered once by the shell above the routed page, so every page
 * has it without each one remembering to add it.
 *
 * Why it exists: net worth stays positive for decades after the plan can no
 * longer pay its bills (home equity and locked accounts hold the line up),
 * so no net-worth chart shows the failure. This says it once, in words.
 *
 * Dismissible per signature (§4.3): `health.signature` is the first short year
 * plus the unfunded total, so editing the plan into a different failure
 * brings it back. The rail pill (`Sidebar.tsx`) stays regardless — hiding
 * this is "I've read it", not "it's fine".
 */
export function PlanHealthAlert() {
  const { health, planId, setFocusYear } = usePlanner();
  const navigate = useNavigate();
  const year = health.firstShortYear;
  if (health.status !== 'short' || year === undefined) return null;

  const count = health.shortYears.length;
  return (
    // `:empty` hides the wrapper once the alert has collapsed away (ui.css).
    <div className="ns-shell-alerts">
      <DismissibleAlert
        planId={planId}
        id="plan-health"
        signature={health.signature}
        tone="danger"
        action={{
          label: `See ${year} →`,
          onClick: () => {
            setFocusYear(year);
            navigate('/cashflow');
          },
        }}
      >
        This plan runs out of money in {year}. {count} {count === 1 ? 'year goes' : 'years go'} short,{' '}
        {money(health.unfundedTotal)} unfunded.
      </DismissibleAlert>
    </div>
  );
}
