import { useMemo, useState } from 'react';
import type { Account, Plan, PlanResult } from '@northstar/engine';
import { contractYearFor, surrenderCharge } from '@northstar/engine';
import { Field } from '../drawer/fields';
import { detailMoney, percent } from '../format';
import { AnimatedFigure } from '../AnimatedFigure';
import { ChartLegend, MiniChart } from './MiniChart';

/**
 * The Annuity lens — new alongside the richer contract model
 * (`packages/engine/src/annuity.ts`): basis-vs-gain (how much of a
 * nonqualified contract's balance would come out tax-free right now),
 * contract fee drag over time, and the surrender-charge schedule, none of
 * which had a home before this. Folds no SEPP content in — that stays
 * exactly where it already lives, inside Retirement (`SeppForecastView.tsx`'s
 * `SeppTool`, which now also offers all three IRS sizing methods).
 *
 * Scoped to every `variableAnnuity` account (its own account class — Accounts
 * tab, "Variable annuity"), plus — for a saved plan from before that class
 * existed — any `taxDeferredInvestment` account that already opted into the
 * annuity fields by hand. A plain 401(k)/IRA with none of those set has
 * nothing to show here — that is what "additive" means
 * (`packages/engine/src/annuity.ts`'s own module doc): it belongs on
 * Accounts, not here.
 */
function isAnnuityContract(account: Account): boolean {
  return (
    account.accountClass === 'variableAnnuity' ||
    (account.nonTaxableBase ?? 0) > 0 ||
    (account.annuityFlatFeeAnnual ?? 0) > 0 ||
    (account.annuityAssetFeePercent ?? 0) > 0 ||
    (account.annuityAdvisoryFeePercent ?? 0) > 0 ||
    (account.annuitySurrenderSchedule?.length ?? 0) > 0
  );
}

export function AnnuityForecastView({ plan, result }: { plan: Plan; result: PlanResult }) {
  const candidates = plan.accounts.filter((a) => !a.isSynthetic && isAnnuityContract(a));

  return (
    <div className="ns-card ns-card-view">
      <div className="ns-view-head">
        <div className="ns-view-title">Annuity forecast</div>
        <p className="ns-view-sub">
          How much of a contract's balance is basis versus gain, what carrier and advisory fees are
          costing it, and what leaving early would cost in surrender charges. For the SEPP / 72(t)
          way to reach a tax-deferred account before 59½ penalty-free, see Retirement.
        </p>
      </div>

      {candidates.length === 0 ? (
        <div className="ns-view-empty">
          Add a non-taxable base, a contract fee, or a surrender schedule to a tax-deferred
          investment account to see this forecast.
        </div>
      ) : (
        <AnnuityContent plan={plan} result={result} candidates={candidates} />
      )}
    </div>
  );
}

function AnnuityContent({
  plan,
  result,
  candidates,
}: {
  plan: Plan;
  result: PlanResult;
  candidates: Account[];
}) {
  const [accountId, setAccountId] = useState(candidates[0].id);
  const account = candidates.find((a) => a.id === accountId) ?? candidates[0];

  const asOfYear = plan.settings.startYear;
  const rows = result.years.map((y) => ({
    year: y.year,
    row: y.accounts.find((a) => a.accountId === account.id),
  }));
  const current = rows.find((r) => r.year === asOfYear)?.row ?? rows[0]?.row;

  const balance = current?.close ?? account.initialBalance;
  const basisRemaining = Math.min(balance, current?.nonTaxableBaseRemaining ?? account.nonTaxableBase ?? 0);
  const gain = Math.max(0, balance - basisRemaining);
  const basisPct = balance > 0 ? (basisRemaining / balance) * 100 : 0;
  const gainPct = 100 - basisPct;

  const contractYear = contractYearFor(account.startYear, plan.settings.startYear, asOfYear);
  const schedule = [...(account.annuitySurrenderSchedule ?? [])].sort((a, b) => a.year - b.year);
  const currentCharge = surrenderCharge(balance, contractYear, account.annuitySurrenderSchedule);

  const hasFees =
    (account.annuityFlatFeeAnnual ?? 0) > 0 ||
    (account.annuityAssetFeePercent ?? 0) > 0 ||
    (account.annuityAdvisoryFeePercent ?? 0) > 0;

  const feeSeries = useMemo(
    () => rows.map((r) => r.row?.annuityFeesDeducted ?? 0),
    [rows],
  );
  const totalFeesToDate = feeSeries
    .filter((_, i) => rows[i].year <= asOfYear)
    .reduce((sum, v) => sum + v, 0);

  return (
    <>
      {candidates.length > 1 && (
        <Field label="Account">
          <select className="ns-input" value={account.id} onChange={(e) => setAccountId(e.target.value)}>
            {candidates.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <p className="ns-view-sub" style={{ marginTop: 14 }}>
        Basis versus gain, as of {asOfYear} — {account.isQualifiedAnnuity ? 'pro-rata' : 'LIFO, gain-first'}{' '}
        on withdrawal.
      </p>
      <div className="ns-split-bar">
        {basisPct > 0 && (
          <div className="ns-split-bar-basis" style={{ flex: `${basisPct} 0 0%` }}>
            {basisPct >= 12 ? `${percent(basisPct)} basis` : ''}
          </div>
        )}
        {gainPct > 0 && (
          <div className="ns-split-bar-gain" style={{ flex: `${gainPct} 0 0%` }}>
            {gainPct >= 12 ? `${percent(gainPct)} gain` : ''}
          </div>
        )}
      </div>
      <div className="ns-split-bar-legend">
        <span>
          Basis (tax-free): <b>{detailMoney(basisRemaining)}</b>
        </span>
        <span>
          Gain (taxable): <b>{detailMoney(gain)}</b>
        </span>
      </div>

      {(hasFees || schedule.length > 0) && (
        <div className="ns-annuity-split">
          {hasFees && (
            <div>
              <p className="ns-view-sub" style={{ marginTop: 18 }}>
                Contract fee drag — deducted from growth every year, already netted out of the
                balance above.
              </p>
              <div className="ns-stat-row">
                <Stat label={`Fees paid through ${asOfYear}`} value={detailMoney(totalFeesToDate)} />
                {(account.annuityAssetFeePercent ?? 0) > 0 && (
                  <Stat
                    label="Mortality & expense"
                    value={percent(account.annuityAssetFeePercent ?? 0)}
                  />
                )}
                {(account.annuityAdvisoryFeePercent ?? 0) > 0 && (
                  <Stat label="Advisory fee" value={percent(account.annuityAdvisoryFeePercent ?? 0)} />
                )}
                {(account.annuityFlatFeeAnnual ?? 0) > 0 && (
                  <Stat label="Flat annual fee" value={detailMoney(account.annuityFlatFeeAnnual ?? 0)} />
                )}
              </div>
              <MiniChart
                years={rows.map((r) => r.year)}
                series={[{ label: 'Fees deducted', color: 'var(--out)', values: feeSeries, fill: true }]}
                height={140}
              />
              <ChartLegend series={[{ label: 'Fees deducted', color: 'var(--out)' }]} />
            </div>
          )}

          {schedule.length > 0 && (
            <div>
              <p className="ns-view-sub" style={{ marginTop: 18 }}>
                Surrender charge — the percent of a withdrawal the carrier keeps if it is taken
                during that contract year. Currently in contract year {contractYear}
                {currentCharge > 0
                  ? `; withdrawing the full balance today would cost ${detailMoney(currentCharge)}.`
                  : ' — past the surrender period, or the schedule has no entry for it.'}
              </p>
              <div className="ns-surrender-list">
                {schedule.map((entry) => (
                  <div
                    key={entry.year}
                    className={`ns-surrender-row${entry.year === contractYear ? ' ns-surrender-row-current' : ''}`}
                  >
                    <span>Year {entry.year}</span>
                    <span className="ns-num">{percent(entry.percent)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ns-stat">
      <div className="ns-stat-label">{label}</div>
      <AnimatedFigure className="ns-stat-value" value={value} />
    </div>
  );
}
