import { useMemo } from 'react';
import type { Account, Plan, PlanResult } from '@northstar/engine';
import { DonutChart } from '../charts';
import { usePlanner } from '../PlannerContext';
import { money } from '../format';
import '../pages/decisions.css';

/**
 * The contract itself (docs/REDESIGN-V5.md §5.5): how much of the balance
 * would come out tax-free right now, as a donut with the balance in the
 * middle. Fee drag and the surrender schedule describe the ACCOUNT rather than
 * the SEPP decision, so they live in the account sheet
 * (`AnnuityAccountSection`, unit C1), not on this page.
 *
 * `AnnuityPage` only renders this once at least one candidate contract
 * exists.
 *
 * Scoped to every `variableAnnuity` account (its own account class — Accounts
 * tab, "Variable annuity"), plus — for a saved plan from before that class
 * existed — any `taxDeferredInvestment` account that already opted into the
 * annuity fields by hand. A plain 401(k)/IRA with none of those set has
 * nothing to show here — that is what "additive" means
 * (`packages/engine/src/annuity.ts`'s own module doc): it belongs on
 * Accounts, not here.
 */
export function isAnnuityContract(account: Account): boolean {
  return (
    account.accountClass === 'variableAnnuity' ||
    (account.nonTaxableBase ?? 0) > 0 ||
    (account.annuityFlatFeeAnnual ?? 0) > 0 ||
    (account.annuityAssetFeePercent ?? 0) > 0 ||
    (account.annuityAdvisoryFeePercent ?? 0) > 0 ||
    (account.annuitySurrenderSchedule?.length ?? 0) > 0
  );
}

/** `accountId`: show just that contract (the Annuity & SEPP page drives the choice); unset, the first one. */
export function AnnuityForecastView({ plan, result, accountId }: { plan: Plan; result: PlanResult; accountId?: string }) {
  const all = plan.accounts.filter((a) => !a.isSynthetic && isAnnuityContract(a));
  const account = (accountId ? all.find((a) => a.id === accountId) : undefined) ?? all[0];
  if (!account) return null;
  return <AnnuityContent key={account.id} account={account} result={result} />;
}

function AnnuityContent({ account, result }: { account: Account; result: PlanResult }) {
  const { focusYear } = usePlanner();
  // "As of today" (docs/MATH.md "Today vs. years[0]"): `result.opening` is the
  // plan's real `asOfDate` balance, not the first year's projected close.
  const opening = result.opening?.accounts.find((a) => a.accountId === account.id);
  const todayBalance = opening?.balance ?? account.initialBalance;

  // V5-REVIEW-1 F27: the donut follows the pinned year like every other chart:
  // that year's closing balance, split into the basis still left and the gain.
  // With nothing pinned (or a year this account has no row for) it reads today.
  const pinned = focusYear === null ? undefined : result.years.find((y) => y.year === focusYear)?.accounts.find((a) => a.accountId === account.id);
  const balance = pinned ? Math.max(0, pinned.close) : todayBalance;
  const basisLeft = pinned ? pinned.nonTaxableBaseRemaining : (opening?.nonTaxableBaseRemaining ?? account.nonTaxableBase);
  const basis = Math.min(balance, basisLeft ?? 0);
  const gain = Math.max(0, balance - basis);

  const segments = useMemo(
    () => [
      { key: 'basis', label: 'Basis (tax-free)', value: basis, color: 'var(--in)' },
      { key: 'gain', label: 'Gain (taxable)', value: gain, color: 'var(--mix-3)' },
    ],
    [basis, gain],
  );
  if (todayBalance <= 0) return null;

  return (
    <section className="ns-dec-section">
      <div className="ns-dec-head">
        <h2 className="ns-dec-title">{account.name}</h2>
      </div>
      <div className="ns-dec-donut">
        <DonutChart
          segments={segments}
          center={{ value: money(balance), label: pinned ? `In ${focusYear}` : 'Worth today' }}
          size={216}
          thickness={28}
          legend="side"
          ariaLabel={`${account.name}: basis versus gain`}
        />
      </div>
    </section>
  );
}
