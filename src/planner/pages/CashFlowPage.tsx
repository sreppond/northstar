import { useMemo, useState } from 'react';
import { PiggyBank } from 'lucide-react';
import { usePlanner } from '../PlannerContext';
import { CashFlowTab } from '../tabs/CashFlowTab';
import { ChartReadout, RangePicker, TimeSeriesChart, type ChartSeries } from '../charts';
import { Waterfall, type WaterfallBar } from '../charts/Waterfall';
import { cashFlowTree, monthsInYear, waterfallBars, type FlowKey } from '../cashFlowView';
import { stubYearLabel } from '../ledger';
import { money } from '../format';
import { EmptyState, Page, PageHeader, Segmented } from '../ui';
import './cash-flow.css';

type Unit = 'mo' | 'yr';

/**
 * Cash Flow (docs/REDESIGN-V5.md §5.2): after-tax income against spending as
 * the hero, one year's money as a waterfall, then every year in a grouped
 * table. Running short is read three ways, none of them colour alone: the
 * hatched band on the chart, the ✗ Short pill in the readout, and an
 * Unfunded row/bar (§4.2). The page's shell already carries the alert and
 * the rail pill, so this adds neither.
 *
 * One year drives all three parts. Hover previews it, the pinned focus year
 * (shared app-wide, §4.1) holds it, and the plan's first full year stands in
 * when neither is set. The /mo and /yr switch is local to the page.
 */
export function CashFlowPage() {
  const {
    plan,
    result,
    stored,
    editor,
    setAssumptionsDraft,
    focusYear,
    setFocusYear,
    chartRange,
    setChartRange,
    health,
  } = usePlanner();

  const [unit, setUnit] = useState<Unit>('mo');
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const [hot, setHot] = useState<FlowKey | null>(null);

  const { startYear, asOfDate } = plan.settings;
  const snapshots = result.years;
  const years = useMemo(() => snapshots.map((s) => s.year), [snapshots]);
  const tree = useMemo(() => cashFlowTree(plan, snapshots), [plan, snapshots]);
  const months = useMemo(() => years.map((y) => monthsInYear(y, startYear, asOfDate)), [years, startYear, asOfDate]);
  const perColumn = useMemo(() => (unit === 'mo' ? months : years.map(() => 1)), [unit, months, years]);

  // --- the hero chart ----------------------------------------------------------
  // Spending includes tax paid on withdrawals: it is money out the door, and it
  // makes the gap between the two lines exactly what the readout calls Saved.
  const series = useMemo<ChartSeries[]>(() => {
    const income = tree.flows.map((f, i) => f.afterTax / perColumn[i]);
    const spending = tree.flows.map((f, i) => (f.spent + f.withdrawalTax) / perColumn[i]);
    const top = income.map((v, i) => Math.max(v, spending[i]));
    return [
      // The wash between the lines: two areas that each fill from one line to the
      // higher of the two, so exactly one of them has height in any year.
      { id: 'saving', label: 'Saving', color: 'var(--in)', kind: 'area', values: top, fillTo: spending, fillOpacity: 0.2, lineWidth: 0, activeDot: false },
      { id: 'drawing', label: 'Drawing down', color: 'var(--out)', kind: 'area', values: top, fillTo: income, fillOpacity: 0.22, lineWidth: 0, activeDot: false },
      { id: 'income', label: 'After tax', color: 'var(--in)', values: income },
      { id: 'spending', label: 'Spending', color: 'var(--out)', values: spending },
    ];
  }, [tree.flows, perColumn]);

  // --- which year -------------------------------------------------------------
  const defaultYear = useMemo(
    () => years.find((y) => !stubYearLabel(y, startYear, asOfDate)) ?? years[0],
    [years, startYear, asOfDate],
  );
  const pinned = focusYear !== null && years.includes(focusYear) ? focusYear : null;
  const activeYear = hoverYear ?? pinned ?? defaultYear;
  const idx = years.indexOf(activeYear);
  const flow = idx >= 0 ? tree.flows[idx] : undefined;
  const per = idx >= 0 ? perColumn[idx] : 1;

  const people = plan.participants.filter((p) => p.isIncluded && p.role !== 'child');
  const agesFor = (year: number) => {
    const ages = snapshots[years.indexOf(year)]?.ages;
    if (!ages) return undefined;
    const parts = people.filter((p) => ages[p.id] !== undefined).map((p) => `${p.name} ${Math.round(ages[p.id])}`);
    return parts.length ? parts.join(' · ') : undefined;
  };

  const danger =
    health.status === 'short' && health.firstShortYear !== undefined
      ? {
          from: health.firstShortYear,
          shortFor: (y: number) => {
            const i = years.indexOf(y);
            return i >= 0 ? (tree.unfunded?.[i] ?? 0) / perColumn[i] : undefined;
          },
        }
      : undefined;

  const bars = useMemo<WaterfallBar[]>(() => {
    if (!flow) return [];
    const k = 1 / per;
    return waterfallBars(flow, (v) => money(v * k)).map((b) => ({
      ...b,
      from: b.from * k,
      to: b.to * k,
      amount: b.amount * k,
      segments: b.segments?.map((s) => ({ ...s, from: s.from * k, to: s.to * k })),
    }));
  }, [flow, per]);

  if (!flow || years.length === 0) {
    return (
      <Page>
        <PageHeader title="Cash flow" />
        <EmptyState icon={PiggyBank} title="Nothing to show" body="This plan has no projected years yet." />
      </Page>
    );
  }

  const stub = stubYearLabel(activeYear, startYear, asOfDate);
  const savedNow = flow.saved / per;
  const unitWord = unit === 'mo' ? 'per month' : 'per year';
  const isShort = health.shortYears.includes(activeYear);

  return (
    <Page>
      <PageHeader
        title="Cash flow"
        actions={
          <div className="ns-cf-controls">
            <RangePicker value={chartRange} onChange={setChartRange} years={years} openingYear={startYear} />
            <Segmented
              size="sm"
              ariaLabel="Show per month or per year"
              value={unit}
              onChange={(v) => setUnit(v as Unit)}
              options={[
                { value: 'mo', label: '/mo' },
                { value: 'yr', label: '/yr' },
              ]}
            />
          </div>
        }
      />

      <section className="ns-cf-hero" aria-label="After-tax income and spending">
        <ChartReadout
          label={`After tax · ${unitWord}`}
          labelText="After tax"
          value={money(flow.afterTax / per)}
          yearLabel={stub ? `${activeYear} · ${stub.short}` : String(activeYear)}
          ages={agesFor(activeYear)}
          secondary={[
            { id: 'spent', label: 'Spent', color: 'var(--out)', value: money((flow.spent + flow.withdrawalTax) / per) },
            savedNow >= 0
              ? { id: 'saved', label: 'Saved', color: 'var(--in)', value: money(savedNow) }
              : { id: 'saved', label: 'Drawn down', color: 'var(--out)', value: money(-savedNow) },
          ]}
          short={isShort}
          shortAmount={isShort && flow.unfunded > 0 ? money(flow.unfunded / per) : undefined}
        />
        <TimeSeriesChart
          years={years}
          series={series}
          range={chartRange}
          todayYear={startYear}
          height={420}
          focusYear={focusYear}
          onFocusYear={setFocusYear}
          onHoverYear={setHoverYear}
          readout={false}
          danger={danger}
          onRequestRange={setChartRange}
          ariaLabel={`After-tax income and spending ${unitWord}, ${years[0]} to ${years[years.length - 1]}`}
        />
      </section>

      <section className="ns-cf-section">
        <h2 className="ns-cf-title">
          Where {activeYear}’s money went <span className="ns-cf-unit">{unitWord}</span>
        </h2>
        <Waterfall
          bars={bars}
          format={money}
          hot={hot}
          onHot={(k) => setHot(k as FlowKey | null)}
          ariaLabel={`Where ${activeYear}’s money went, ${unitWord}`}
        />
      </section>

      <section className="ns-cf-section">
        <h2 className="ns-cf-title">
          Year by year <span className="ns-cf-unit">{unitWord}</span>
        </h2>
        <div className="ns-cf-tablecard">
          <CashFlowTab
            tree={tree}
            snapshots={snapshots}
            events={plan.events}
            perColumn={perColumn}
            focusYear={pinned}
            onFocusYear={setFocusYear}
            dangerYears={health.shortYears}
            hot={hot}
            onHot={setHot}
            onEdit={(event) => editor.edit(event)}
            onEditAssumptions={() => setAssumptionsDraft(structuredClone(stored))}
            startYear={startYear}
            asOfDate={asOfDate}
          />
        </div>
      </section>
    </Page>
  );
}
