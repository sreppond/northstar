import { useNavigate } from 'react-router-dom';
import { ACCOUNT_TYPES } from '@northstar/engine';
import { usePlanner } from './PlannerContext';
import { DismissibleAlert } from './ui/Alert';
import { money } from './format';
import type { StrandedAccount, StrandedReason } from './health';
import './plan-health-alert.css';

/**
 * The top-of-page "this plan runs out of money" alert (docs/REDESIGN-V5.md
 * §4.2.3). Rendered once by the shell above the routed page, so every page
 * has it without each one remembering to add it.
 *
 * Why it exists: net worth stays positive for decades after the plan can no
 * longer pay its bills (home equity and locked accounts hold the line up),
 * so no net-worth chart shows the failure. This says it once, in words.
 *
 * V5-REVIEW-1 F6: when money is sitting in accounts the plan won't draw on, the
 * alert says so in a second clause and offers "Review", which opens the largest
 * of them. "Runs out of money" would otherwise read as a forecast fact when it
 * is often a withdrawal setting the user can change in one place.
 *
 * Dismissible per signature (§4.3): `health.signature` is the first short year
 * plus the unfunded total, so editing the plan into a different failure
 * brings it back. The rail pill (`Sidebar.tsx`) stays regardless — hiding
 * this is "I've read it", not "it's fine".
 */

/** How each reason reads after "…is" in the second clause. */
const REASON_PHRASE: Record<StrandedReason, string> = {
  never: 'set to never withdraw',
  noRule: 'left out of the withdrawal order',
  sepp: 'locked in a SEPP',
  penalty: 'still under the early-withdrawal age',
};

/** At most this many reasons are spelled out; the rest are the one "Review" away. */
const MAX_CLAUSES = 2;

/** "Tax-deferred and Variable annuity", "A, B and C". Classes, not accounts, so two 401(k)s read once. */
function classList(accounts: StrandedAccount[]): { text: string; plural: boolean } {
  const labels = [...new Set(accounts.map((a) => ACCOUNT_TYPES[a.accountClass].label))];
  if (labels.length <= 1) return { text: labels[0] ?? '', plural: false };
  return { text: `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`, plural: true };
}

/** The stranded accounts grouped by reason, biggest pile first (they arrive largest-first). */
export function strandedClauses(stranded: StrandedAccount[]): { reason: StrandedReason; total: number; text: string }[] {
  const byReason = new Map<StrandedReason, StrandedAccount[]>();
  for (const s of stranded) byReason.set(s.reason, [...(byReason.get(s.reason) ?? []), s]);
  return [...byReason.entries()]
    .map(([reason, accounts]) => ({ reason, accounts, total: accounts.reduce((sum, a) => sum + a.balance, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_CLAUSES)
    .map(({ reason, accounts, total }) => {
      const classes = classList(accounts);
      return { reason, total, text: `${money(total)} in ${classes.text} ${classes.plural ? 'are' : 'is'} ${REASON_PHRASE[reason]}` };
    });
}

export function PlanHealthAlert() {
  const { health, planId, setFocusYear, stored, setAccountDraft } = usePlanner();
  const navigate = useNavigate();
  const year = health.firstShortYear;
  if (health.status !== 'short' || year === undefined) return null;

  const count = health.shortYears.length;
  const clauses = strandedClauses(health.stranded);
  // `stranded` is largest-first. An account the plan lists is always in `stored`,
  // so the sheet opens on the real thing (a draft clone, as every other opener does).
  const biggest = health.stranded.map((s) => stored.accounts.find((a) => a.id === s.accountId)).find((a) => a !== undefined);

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
        {clauses.length > 0 && (
          <>
            {' '}
            <span className="ns-alert-stranded">
              Meanwhile, {clauses.map((c) => c.text).join('; ')}.
            </span>
            {biggest && (
              <>
                {' '}
                <button type="button" className="ns-alert-link" onClick={() => setAccountDraft(structuredClone(biggest))}>
                  Review {ACCOUNT_TYPES[biggest.accountClass].label} →
                </button>
              </>
            )}
          </>
        )}
      </DismissibleAlert>
    </div>
  );
}
