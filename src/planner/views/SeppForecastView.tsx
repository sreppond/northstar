import { useMemo, useState } from 'react';
import type { Plan, PlanResult } from '@northstar/engine';
import {
  DEFAULT_SEPP_RATE_PERCENT,
  MANDATORY_AGE,
  lifeExpectancyFactor,
  planSepp,
  seppStartAgeSweep,
} from '@northstar/engine';
import { detailMoney } from '../format';
import { NumberInput } from '../drawer/fields';
import { ChartLegend, MiniChart } from './MiniChart';

export function SeppForecastView({ plan, result }: { plan: Plan; result: PlanResult }) {
  const candidates = plan.accounts.filter((a) => a.accountClass === 'taxDeferredInvestment' && !a.isSynthetic);
  const [accountId, setAccountId] = useState(candidates[0]?.id);
  const account = candidates.find((a) => a.id === accountId) ?? candidates[0];

  const owner =
    plan.participants.find((p) => p.id === account?.ownerParticipantId) ??
    plan.participants.find((p) => p.isIncluded);

  const asOfYear = plan.settings.startYear;
  const currentBalance =
    result.years.find((y) => y.year === asOfYear)?.accounts.find((a) => a.accountId === account?.id)?.close ??
    account?.initialBalance ??
    0;

  const [growthRate, setGrowthRate] = useState<number>(
    account?.growthRateMethod === 'fixed' ? account.growthRate : 6.5,
  );
  const [seppRate, setSeppRate] = useState<number>(DEFAULT_SEPP_RATE_PERCENT);
  const [startYear, setStartYear] = useState<number>(asOfYear);

  const mandatoryYear = owner ? owner.birthYear + MANDATORY_AGE : undefined;

  const sweep = useMemo(() => {
    if (!owner || !mandatoryYear) return [];
    const candidateYears: number[] = [];
    for (let y = asOfYear; y < mandatoryYear; y++) candidateYears.push(y);
    return seppStartAgeSweep({
      currentBalance,
      asOfYear,
      birthYear: owner.birthYear,
      candidateStartYears: candidateYears,
      growthRatePercent: growthRate,
      seppRatePercent: seppRate,
      referenceYear: mandatoryYear,
    });
  }, [owner, mandatoryYear, asOfYear, currentBalance, growthRate, seppRate]);

  const selected = useMemo(() => {
    if (!owner) return undefined;
    const yearsOfGrowth = startYear - asOfYear;
    const startingBalance = currentBalance * Math.pow(1 + growthRate / 100, Math.max(0, yearsOfGrowth));
    return planSepp({
      startingBalance,
      birthYear: owner.birthYear,
      startYear,
      growthRatePercent: growthRate,
      seppRatePercent: seppRate,
      incomeTaxRatePercent: plan.settings.incomeTaxRate,
      horizonYear: Math.max(startYear + 4, (mandatoryYear ?? startYear) + 3),
    });
  }, [owner, startYear, asOfYear, currentBalance, growthRate, seppRate, plan.settings.incomeTaxRate, mandatoryYear]);

  return (
    <div className="ns-card">
      <div className="ns-view-head">
        <div className="ns-view-title">SEPP forecast</div>
        <p className="ns-view-sub">
          Rule 72(t) substantially equal periodic payments: a fixed annual withdrawal from a
          tax-deferred account, taken penalty-free before 59½, in exchange for committing to the
          same amount every year until the later of five years or reaching that age.
        </p>
      </div>

      {!account || !owner ? (
        <div className="ns-view-empty">
          Add a tax-deferred investment account and a participant to see this forecast.
        </div>
      ) : (
        <>
          <div className="ns-view-controls">
            {candidates.length > 1 && (
              <div className="ns-view-control">
                <label htmlFor="sepp-account">Account</label>
                <select
                  id="sepp-account"
                  className="ns-select"
                  value={account.id}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {candidates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="ns-view-control">
              <label>Start year</label>
              <NumberInput value={startYear} unit="year" step={1} onChange={(v) => v !== undefined && setStartYear(v)} />
            </div>
            <div className="ns-view-control">
              <label>Assumed growth</label>
              <NumberInput value={growthRate} unit="percent" step={0.1} onChange={(v) => v !== undefined && setGrowthRate(v)} />
            </div>
            <div className="ns-view-control">
              <label>Assumed SEPP rate</label>
              <NumberInput value={seppRate} unit="percent" step={0.1} onChange={(v) => v !== undefined && setSeppRate(v)} />
            </div>
          </div>

          {selected && (
            <>
              <div className="ns-stat-row">
                <Stat label="Start age" value={String(selected.startAge)} />
                <Stat label="Life expectancy factor" value={String(selected.lifeExpectancyFactor)} note="IRS Single Life Table" />
                <Stat label="Fixed annual payment" value={detailMoney(selected.annualPayment)} />
                <Stat label="Mandatory through" value={String(selected.mandatoryEndYear)} />
              </div>

              <MiniChart
                years={selected.years.map((y) => y.year)}
                series={[
                  { label: 'Account balance', color: 'var(--data-nw)', values: selected.years.map((y) => y.close), fill: true },
                  { label: 'Annual payment', color: 'var(--out)', values: selected.years.map((y) => y.payment) },
                ]}
                height={200}
              />
              <ChartLegend
                series={[
                  { label: 'Account balance', color: 'var(--data-nw)' },
                  { label: 'Annual payment', color: 'var(--out)' },
                ]}
              />
            </>
          )}

          {sweep.length > 1 && (
            <>
              <p className="ns-view-sub" style={{ marginTop: 18 }}>
                Starting later lets the balance (and often the payment) grow, but leaves less runway
                before {owner.name} turns {MANDATORY_AGE} and gains unrestricted access anyway. Pick a
                row to preview it above.
              </p>
              <div className="ns-table-scroll">
                <table className="ns-sweep-table">
                  <thead>
                    <tr>
                      <th>Start year</th>
                      <th>Age</th>
                      <th>Annual payment</th>
                      <th>Ends</th>
                      <th>Balance at {MANDATORY_AGE}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sweep.map((s) => (
                      <tr key={s.startYear} aria-current={s.startYear === startYear} onClick={() => setStartYear(s.startYear)}>
                        <td>{s.startYear}</td>
                        <td>{s.startAge}</td>
                        <td>{detailMoney(s.annualPayment)}</td>
                        <td>{s.mandatoryEndYear}</td>
                        <td>{detailMoney(s.balanceAtReference)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <div className="ns-sepp-disclaimer">
            <strong>Not tax advice.</strong> The life-expectancy factor reproduces the IRS Single
            Life Expectancy Table used for 72(t) calculations, and the assumed rate above stands in
            for the actual cap — 120% of the federal mid-term rate for either of the two months
            before the first payment, published monthly at irs.gov/apr. Verify both against current
            IRS guidance before relying on a real SEPP election: breaking the schedule early
            retroactively applies the 10% penalty, with interest, to every payment already taken.
            {lifeExpectancyFactor(selected?.startAge ?? 0) === lifeExpectancyFactor(20) &&
              (selected?.startAge ?? 0) < 20 &&
              ' The selected age falls outside the modelled table range and has been clamped.'}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="ns-stat">
      <div className="ns-stat-label">{label}</div>
      <div className="ns-stat-value">{value}</div>
      {note && <div className="ns-stat-note">{note}</div>}
    </div>
  );
}
