import { useMemo } from 'react';
import type { Plan, PlanResult } from '@northstar/engine';
import { detailMoney, percent } from '../format';
import { ChartLegend, MiniChart } from './MiniChart';

const PORTFOLIO_CLASSES = new Set([
  'cash',
  'taxableInvestment',
  'taxDeferredInvestment',
  'taxFreeInvestment',
]);

export function RetirementForecastView({ plan, result }: { plan: Plan; result: PlanResult }) {
  const retirementEvent = plan.events.find((e) => e.kind === 'retirement' && e.isIncluded);
  const owner = retirementEvent?.config
    ? plan.participants.find((p) => p.id === (retirementEvent.config as { participantId?: string }).participantId)
    : undefined;
  const retiree = owner ?? plan.participants.find((p) => p.isIncluded);

  const years = result.years.map((y) => y.year);
  const income = result.years.map((y) => y.totalIncome);
  const expenses = result.years.map((y) => y.totalExpenses + y.totalTaxes);
  const portfolio = result.years.map((y) =>
    y.accounts.filter((a) => !a.isLiability && PORTFOLIO_CLASSES.has(a.accountClass)).reduce((s, a) => s + a.close, 0),
  );

  const retirementIndex = retirementEvent ? years.indexOf(retirementEvent.startYear) : -1;

  const summary = useMemo(() => {
    if (!retirementEvent || retirementIndex < 0) return undefined;
    const before = income[Math.max(0, retirementIndex - 1)];
    const after = income[retirementIndex];
    const balanceAtRetirement = portfolio[retirementIndex];
    const shortfallAfter = result.years
      .slice(retirementIndex)
      .find((y) => y.unfundedShortfall !== undefined);
    return {
      year: retirementEvent.startYear,
      age: retiree ? retirementEvent.startYear - retiree.birthYear : undefined,
      before,
      after,
      balanceAtRetirement,
      shortfallYear: shortfallAfter?.year,
    };
  }, [retirementEvent, retirementIndex, income, portfolio, result.years, retiree]);

  return (
    <div className="ns-card">
      <div className="ns-view-head">
        <div className="ns-view-title">Retirement forecast</div>
        <p className="ns-view-sub">
          Income and spending around retirement, and how the investable portfolio carries the gap
          between them afterward.
        </p>
      </div>

      {!retirementEvent ? (
        <div className="ns-view-empty">
          Add a Retirement event to the plan to see this forecast.
        </div>
      ) : (
        <>
          <div className="ns-stat-row">
            <Stat label="Retirement year" value={String(summary?.year ?? '—')} note={summary?.age !== undefined ? `Age ${summary.age}` : undefined} />
            <Stat
              label="Income, before → after"
              value={`${detailMoney(summary?.before ?? 0)} → ${detailMoney(summary?.after ?? 0)}`}
              note={
                summary && summary.before > 0
                  ? `${percent((summary.after / summary.before) * 100, 0)} replacement`
                  : undefined
              }
            />
            <Stat label="Portfolio at retirement" value={detailMoney(summary?.balanceAtRetirement ?? 0)} />
            <Stat
              label="Plan durability"
              value={summary?.shortfallYear ? `Runs dry in ${summary.shortfallYear}` : `Lasts through ${result.endYear}`}
              note={summary?.shortfallYear ? 'A withdrawal could not be fully funded' : 'No funding shortfall projected'}
            />
          </div>

          <p className="ns-view-sub" style={{ marginTop: 8 }}>Income vs. spending (taxes included)</p>
          <MiniChart
            years={years}
            series={[
              { label: 'Income', color: 'var(--in)', values: income },
              { label: 'Spending + tax', color: 'var(--out)', values: expenses },
            ]}
            height={200}
          />
          <ChartLegend
            series={[
              { label: 'Income', color: 'var(--in)' },
              { label: 'Spending + tax', color: 'var(--out)' },
            ]}
          />

          <p className="ns-view-sub" style={{ marginTop: 18 }}>Investable portfolio balance</p>
          <MiniChart
            years={years}
            series={[{ label: 'Portfolio', color: 'var(--data-nw)', values: portfolio, fill: true }]}
            height={200}
          />
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
