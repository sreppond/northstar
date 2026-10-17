import { useMemo } from 'react';
import type { Account, Plan, PlanResult } from '@northstar/engine';
import { contractYearFor, surrenderCharge } from '@northstar/engine';
import { money, percent } from '../format';
import { MiniChart } from './MiniChart';

/**
 * The variable annuity's contract detail, shown inside the account sheet
 * (docs/REDESIGN-V5.md §5.1.4, §6 "Fee drag / surrender → Account sheet"):
 * the fee-drag chart and the surrender-charge schedule, copied out of
 * `AnnuityForecastView` so the Annuity page (unit C5) can drop them without
 * losing them. Renders nothing for a contract with neither fees nor a
 * schedule. Reads the SAVED plan and result: an unsaved draft's fees don't
 * redraw it until Keep.
 */
export function AnnuityAccountSection({
  plan,
  result,
  account,
}: {
  plan: Plan;
  result: PlanResult;
  account: Account;
}) {
  const asOfYear = plan.settings.startYear;
  const years = useMemo(() => result.years.map((y) => y.year), [result]);
  const feeSeries = useMemo(
    () => result.years.map((y) => y.accounts.find((a) => a.accountId === account.id)?.annuityFeesDeducted ?? 0),
    [result, account.id],
  );

  const opening = result.opening?.accounts.find((a) => a.accountId === account.id);
  const balance = opening?.balance ?? account.initialBalance;
  const contractYear = contractYearFor(account.startYear, plan.settings.startYear, asOfYear);
  const schedule = [...(account.annuitySurrenderSchedule ?? [])].sort((a, b) => a.year - b.year);
  const currentCharge = surrenderCharge(balance, contractYear, account.annuitySurrenderSchedule);

  const hasFees =
    (account.annuityFlatFeeAnnual ?? 0) > 0 ||
    (account.annuityAssetFeePercent ?? 0) > 0 ||
    (account.annuityAdvisoryFeePercent ?? 0) > 0;
  if (!hasFees && schedule.length === 0) return null;

  const feesToDate = feeSeries.reduce((sum, v, i) => (years[i] <= asOfYear ? sum + v : sum), 0);

  return (
    <div className="ns-nw-annuity">
      {hasFees && (
        <section aria-label="Contract fees">
          <h3 className="ns-nw-subtitle">Fee drag</h3>
          <MiniChart
            years={years}
            series={[{ label: 'Fees deducted', color: 'var(--out)', values: feeSeries, fill: true }]}
            height={160}
            endLabels
          />
          <dl className="ns-nw-facts">
            {(account.annuityAssetFeePercent ?? 0) > 0 && (
              <div>
                <dt>Mortality &amp; expense</dt>
                <dd className="ns-num">{percent(account.annuityAssetFeePercent ?? 0)}</dd>
              </div>
            )}
            {(account.annuityAdvisoryFeePercent ?? 0) > 0 && (
              <div>
                <dt>Advisory</dt>
                <dd className="ns-num">{percent(account.annuityAdvisoryFeePercent ?? 0)}</dd>
              </div>
            )}
            {(account.annuityFlatFeeAnnual ?? 0) > 0 && (
              <div>
                <dt>Flat fee</dt>
                <dd className="ns-num">{money(account.annuityFlatFeeAnnual ?? 0)}</dd>
              </div>
            )}
            <div>
              <dt>Paid so far</dt>
              <dd className="ns-num">{money(feesToDate)}</dd>
            </div>
          </dl>
        </section>
      )}

      {schedule.length > 0 && (
        <section aria-label="Surrender charge">
          <h3 className="ns-nw-subtitle">
            Surrender charge
            <span className="ns-nw-subtitle-meta">
              {currentCharge > 0 ? `${money(currentCharge)} to leave today` : `Contract year ${contractYear}`}
            </span>
          </h3>
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
        </section>
      )}
    </div>
  );
}
