import type { Plan, PlanResult } from '@northstar/engine';
import { detailMoney } from '../format';
import { AnimatedFigure } from '../AnimatedFigure';
import { ChartLegend, MiniChart } from './MiniChart';

export function HouseForecastView({ plan, result }: { plan: Plan; result: PlanResult }) {
  const homeEvents = plan.events.filter((e) => e.kind === 'buyAHome' && e.isIncluded);

  return (
    <div className="ns-card">
      <div className="ns-view-head">
        <div className="ns-view-title">House forecast</div>
        <p className="ns-view-sub">
          Home value against the mortgage payoff schedule, and the equity that opens up between
          them.
        </p>
      </div>

      {homeEvents.length === 0 ? (
        <div className="ns-view-empty">Add a Buy a home event to the plan to see this forecast.</div>
      ) : (
        homeEvents.map((event) => <HouseCard key={event.id} eventId={event.id} name={event.name} result={result} />)
      )}
    </div>
  );
}

function HouseCard({ eventId, name, result }: { eventId: string; name: string; result: PlanResult }) {
  const homeId = `${eventId}:home`;
  const mortgageId = `${eventId}:mortgage`;

  const years = result.years.map((y) => y.year);
  const value = result.years.map((y) => y.accounts.find((a) => a.accountId === homeId)?.close ?? 0);
  const mortgage = result.years.map((y) => y.accounts.find((a) => a.accountId === mortgageId)?.close ?? 0);
  const equity = value.map((v, i) => v - mortgage[i]);

  const ownedIndex = value.findIndex((v) => v > 0);
  if (ownedIndex === -1) return null;

  const payoffIndex = mortgage.findIndex((m, i) => i >= ownedIndex && m <= 0);
  const currentValue = value[value.length - 1];
  const currentEquity = equity[equity.length - 1];

  return (
    <div style={{ marginTop: 14 }}>
      <div className="ns-stat-row">
        <Stat label={name} value={detailMoney(currentValue)} note={`Value at ${years[years.length - 1]}`} />
        <Stat
          label="Mortgage payoff"
          value={payoffIndex >= 0 ? String(years[payoffIndex]) : 'After plan horizon'}
        />
        <Stat label="Equity today" value={detailMoney(equity[ownedIndex])} note={`As of ${years[ownedIndex]}`} />
        <Stat label="Equity at horizon" value={detailMoney(currentEquity)} />
      </div>

      <MiniChart
        years={years}
        series={[
          { label: 'Home value', color: 'var(--data-nw)', values: value },
          { label: 'Mortgage balance', color: 'var(--out)', values: mortgage },
          { label: 'Equity', color: 'var(--in)', values: equity, fill: true },
        ]}
        height={220}
      />
      <ChartLegend
        series={[
          { label: 'Home value', color: 'var(--data-nw)' },
          { label: 'Mortgage balance', color: 'var(--out)' },
          { label: 'Equity', color: 'var(--in)' },
        ]}
      />
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="ns-stat">
      <div className="ns-stat-label">{label}</div>
      <AnimatedFigure className="ns-stat-value" value={value} />
      {note && <div className="ns-stat-note">{note}</div>}
    </div>
  );
}
