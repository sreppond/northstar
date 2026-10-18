import { useEffect, useMemo, useState } from 'react';
import type { AccountClass, Plan, PlanResult } from '@northstar/engine';
import { RangePicker, TimeSeriesChart, type ChartSeries, type DangerBand, type RangeKey } from '../charts';
import { money, signedMoney } from '../format';
import { classBalances } from '../ledger';
import { accountClassColor } from '../ui';
import { agesLabel, flowSteps, type FlowStep } from '../pages/netWorthData';

/**
 * What the account sheet shows above its form (docs/REDESIGN-V5.md §5.1.4):
 * the class's balance over time, scrubbable, with its own range picker; and
 * "In {year}", one year's flow as a small horizontal waterfall — a different
 * shape from the chart on purpose, since it answers "what happened that
 * year" rather than "where is it headed".
 */

/** The sheet's spring settles in about this long; the line starts drawing then. */
const SETTLE_MS = 150;

export function AccountInsight({
  plan,
  result,
  accountClass,
  label,
  liability,
  accountId,
  showAccountLine,
  ghostResult,
  initialRange,
  focusYear,
  onFocusYear,
  danger,
  onRequestRange,
}: {
  plan: Plan;
  result: PlanResult;
  accountClass: AccountClass;
  label: string;
  liability: boolean;
  /** The account being edited, drawn as a second line when its class has several. */
  accountId: string;
  showAccountLine: boolean;
  /** The unsaved draft's run, drawn as the dashed ghost. */
  ghostResult: PlanResult | null;
  /** The page's range when the sheet opened; local from then on (§5.1.4). */
  initialRange: RangeKey;
  focusYear: number | null;
  onFocusYear(year: number | null): void;
  danger?: DangerBand;
  onRequestRange?(range: RangeKey): void;
}) {
  const [range, setRange] = useState<RangeKey>(initialRange);
  const [hover, setHover] = useState<number | null>(null);

  // The line draws left to right as the sheet settles, not while it is still
  // sliding in: mount the chart late, so its draw-in is a fresh one.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setArmed(true), SETTLE_MS);
    return () => window.clearTimeout(id);
  }, []);

  const years = useMemo(() => result.years.map((y) => y.year), [result]);
  const color = accountClassColor(accountClass);

  const series = useMemo<ChartSeries[]>(() => {
    const out: ChartSeries[] = [
      { id: 'class', label, color, values: classBalances(result.years, accountClass, liability), kind: 'area' },
    ];
    if (showAccountLine) {
      out.push({
        id: 'account',
        label: 'This account',
        color: 'var(--muted-light)',
        lineWidth: 1.5,
        values: result.years.map((y) => y.accounts.find((a) => a.accountId === accountId)?.close ?? 0),
      });
    }
    return out;
  }, [result, accountClass, liability, label, color, showAccountLine, accountId]);

  const ghost = useMemo<ChartSeries | undefined>(() => {
    if (!ghostResult) return undefined;
    const byYear = new Map(
      classBalances(ghostResult.years, accountClass, liability).map((v, i) => [ghostResult.years[i].year, v]),
    );
    return { label: 'Draft', color: 'var(--ink)', values: years.map((y) => byYear.get(y) ?? NaN) };
  }, [ghostResult, accountClass, liability, years]);

  // A class with nothing in it yet (a new account type, before any balance is
  // typed) has no shape to chart: the axis would read $1 $1 $1 $0.
  const hasData =
    series.some((s) => s.values.some((v) => Math.abs(v) >= 1)) ||
    (ghost?.values.some((v) => Number.isFinite(v) && Math.abs(v) >= 1) ?? false);

  const last = years[years.length - 1];
  const flowYear = hover ?? focusYear ?? last;
  const snapshot = result.years.find((y) => y.year === flowYear);
  const steps = useMemo(
    () =>
      snapshot
        ? flowSteps(
            snapshot.accounts.filter((a) => a.accountClass === accountClass && a.isLiability === liability),
            liability,
            snapshot.income,
          )
        : [],
    [snapshot, accountClass, liability],
  );

  if (!hasData) return null;

  return (
    <div className="ns-nw-insight">
      <div className="ns-nw-insight-chart" data-armed={armed}>
        {/* Out of the readout, so the chart doesn't shift when the draft's
            value joins the readout row and wraps the picker. */}
        <div className="ns-nw-insight-bar">
          <RangePicker value={range} onChange={setRange} years={years} openingYear={result.startYear} />
        </div>
        {/* Keyed by `armed`, so the chart that draws is a fresh mount. */}
        <TimeSeriesChart
          key={armed ? 'armed' : 'waiting'}
          years={years}
          series={series}
          ghost={ghost}
          range={range}
          todayYear={result.startYear}
          height={300}
          focusYear={focusYear}
          onFocusYear={onFocusYear}
          onHoverYear={setHover}
          danger={danger}
          onRequestRange={(r) => {
            setRange(r);
            onRequestRange?.(r);
          }}
          drawIn={armed}
          readout={{
            label,
            primaryId: 'class',
            size: 'compact',
            // V5-REVIEW-2 N10: the danger band is per month, like the page behind the sheet.
            shortUnit: '/mo',
            agesFor: (y) => agesLabel(plan, result.years.find((s) => s.year === y)),
          }}
          ariaLabel={`${label} balance over time`}
        />
      </div>

      {steps.length > 0 && <FlowWaterfall year={flowYear} steps={steps} />}
    </div>
  );
}

/** A horizontal waterfall: each step floats between the running balance before and after it. */
function FlowWaterfall({ year, steps }: { year: number; steps: FlowStep[] }) {
  const lo = Math.min(0, ...steps.flatMap((s) => [s.from, s.to]));
  const hi = Math.max(...steps.flatMap((s) => [s.from, s.to]), 1);
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;

  return (
    <section className="ns-nw-flow" aria-label={`Flow in ${year}`}>
      <h3 className="ns-nw-subtitle">In {year}</h3>
      <ul className="ns-nw-flow-list">
        {steps.map((s) => {
          const left = pct(Math.min(s.from, s.to));
          const width = Math.max(0.8, Math.abs(pct(s.to) - pct(s.from)));
          return (
            <li key={s.key} className="ns-nw-flow-row">
              <span className="ns-nw-flow-label">{s.label}</span>
              <span className="ns-nw-flow-track" aria-hidden="true">
                <span
                  className={`ns-nw-flow-bar ns-nw-flow-${s.kind}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                />
              </span>
              <span className="ns-nw-flow-value ns-num">
                {s.kind === 'total' ? money(s.value) : signedMoney(s.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
