import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ACCOUNT_TYPES } from '@northstar/engine';
import { usePlanner } from './PlannerContext';
import { DismissibleAlert } from './ui/Alert';
import { money } from './format';
import { useBreakpoint } from './useBreakpoint';
import { requestAccountFocus } from './drawer/sheetFocus';
import type { PlanHealth, StrandedAccount, StrandedReason } from './health';
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
 * V5-REVIEW-2 N6: below 640px the alert is one line ("Overdrawn 2031 · $10K",
 * the year action, ×) and the stranded explanation hides behind "Why?".
 * N11: Review opens the sheet on the setting that strands the money.
 *
 * V6.1 B2: the headline names the span of years the plan is overdrawn and the
 * largest balance it reaches, "Overdrawn from 2034 to 2036 — up to $207K.".
 *
 * Dismissible per signature (§4.3): `health.signature` is the first short year
 * plus the unfunded total, so editing the plan into a different failure
 * brings it back. The rail pill (`Sidebar.tsx`) stays regardless — hiding
 * this is "I've read it", not "it's fine".
 */

/** How each reason reads after "…is" in the second clause. */
const REASON_PHRASE: Record<StrandedReason, string> = {
  // V5-REVIEW-2 N5: an RMD still comes out of a "never" account, so "never
  // withdraw" contradicted the account's own sheet. What the setting means is
  // that the shortfall waterfall won't reach for it.
  never: 'never drawn to cover a shortfall',
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

/**
 * The headline for an overdrawn plan (docs/V6.1-PLAN.md B2): the years it owes
 * money, and the largest balance it carries. Undefined when the plan is fine.
 * "Overdrawn from 2034 to 2036" with "up to $207K", or "Overdrawn in 2034" with "$207K".
 */
export function overdrawnSummary(health: PlanHealth): { span: string; amount: string } | undefined {
  const from = health.firstShortYear;
  if (from === undefined) return undefined;
  const to = health.lastShortYear ?? from;
  const peak = money(health.overdrawnPeak);
  return to === from
    ? { span: `Overdrawn in ${from}`, amount: peak }
    : { span: `Overdrawn from ${from} to ${to}`, amount: `up to ${peak}` };
}

export function PlanHealthAlert() {
  const { health, planId, setFocusYear, stored, setAccountDraft } = usePlanner();
  const navigate = useNavigate();
  const compact = useBreakpoint() === 'phone';
  const [whyOpen, setWhyOpen] = useState(false);
  const whyId = useId();
  const year = health.firstShortYear;
  const summary = overdrawnSummary(health);
  if (health.status !== 'short' || year === undefined || !summary) return null;

  const count = health.shortYears.length;
  const clauses = strandedClauses(health.stranded);
  // `stranded` is largest-first. An account the plan lists is always in `stored`,
  // so the sheet opens on the real thing (a draft clone, as every other opener does).
  const biggestEntry = health.stranded.find((s) => stored.accounts.some((a) => a.id === s.accountId));
  const biggest = biggestEntry && stored.accounts.find((a) => a.id === biggestEntry.accountId);

  // V5-REVIEW-2 N11: Review lands on the setting that strands the money, not the
  // top of the sheet. Only the timing reason is fixed by that setting.
  const review = biggest && (
    <button
      type="button"
      className="ns-alert-link"
      onClick={() => {
        if (biggestEntry?.reason === 'never') requestAccountFocus('withdrawalTiming');
        setAccountDraft(structuredClone(biggest));
      }}
    >
      Review {ACCOUNT_TYPES[biggest.accountClass].label} →
    </button>
  );

  const stranded = clauses.length > 0 && (
    <>
      <span className="ns-alert-stranded">Meanwhile, {clauses.map((c) => c.text).join('; ')}.</span>
      {review && <> {review}</>}
    </>
  );

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
        {compact ? (
          // The danger message is the line; the stranded explanation is one tap away, inline.
          <div className="ns-alert-compact">
            <div className="ns-alert-compact-line">
              {/* Two unbreakable halves: if the line is too narrow it breaks at the dot, never mid-amount. */}
              <span>
                <span className="ns-alert-compact-part">
                  <strong className="ns-alert-compact-head">{summary.span}</strong> ·
                </span>{' '}
                <span className="ns-alert-compact-part">{summary.amount}</span>
              </span>
              {stranded && (
                <button
                  type="button"
                  className="ns-alert-link ns-alert-why"
                  aria-expanded={whyOpen}
                  aria-controls={whyId}
                  onClick={() => setWhyOpen((v) => !v)}
                >
                  Why?
                </button>
              )}
            </div>
            {stranded && (
              <div id={whyId} className="ns-alert-why-panel" data-open={whyOpen} inert={!whyOpen}>
                <div className="ns-alert-why-clip">
                  <p className="ns-alert-why-body">
                    {count} {count === 1 ? 'year goes' : 'years go'} short. {stranded}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {summary.span} — {summary.amount}.
            {stranded && <> {stranded}</>}
          </>
        )}
      </DismissibleAlert>
    </div>
  );
}
