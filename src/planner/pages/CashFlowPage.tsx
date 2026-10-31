import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, PiggyBank } from 'lucide-react';
import type { PlanEvent } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { CashFlowTab } from '../tabs/CashFlowTab';
import { ChartReadout, RangePicker, TimeSeriesChart, rangeWindow, type ChartNote, type ChartSeries } from '../charts';
import { Waterfall, type WaterfallBar } from '../charts/Waterfall';
import { cashFlowTree, monthlyColumns, monthsInYear, waterfallBars, type FlowKey } from '../cashFlowView';
import { stubYearLabel } from '../ledger';
import { healthDangerBand } from '../health';
import { inUnit } from '../budgetView';
import { useBreakpoint } from '../useBreakpoint';
import { money } from '../format';
import { EmptyState, Page, PageHeader, Segmented } from '../ui';
import './cash-flow.css';

type Unit = 'mo' | 'yr';
type View = 'years' | 'months';

/** The month view's columns are keyed 0–11, not by year. */
const MONTH_KEYS = Array.from({ length: 12 }, (_, i) => i);
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** One-time lumps are columns from the baseline; the tallest may reach this share of the tallest line in view. */
const LUMP_CAP_SHARE = 0.8;
/** A lump this small next to the cap is not worth a standing label. */
const LUMP_LABEL_MIN_SHARE = 0.2;
const LUMP_COLOR = 'color-mix(in srgb, var(--mix-3) 72%, var(--surface))';

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

  const phone = useBreakpoint() === 'phone';
  const [unit, setUnit] = useState<Unit>('mo');
  const [view, setView] = useState<View>('years');
  const [hoverYear, setHoverYear] = useState<number | null>(null);
  const [hot, setHot] = useState<FlowKey | null>(null);

  const { startYear, asOfDate } = plan.settings;
  const snapshots = result.years;
  const years = useMemo(() => snapshots.map((s) => s.year), [snapshots]);
  const tree = useMemo(() => cashFlowTree(plan, snapshots), [plan, snapshots]);
  const months = useMemo(() => years.map((y) => monthsInYear(y, startYear, asOfDate)), [years, startYear, asOfDate]);
  // The month view is per month by definition, so the chart and waterfall show /mo there too.
  const unitNow: Unit = view === 'months' ? 'mo' : unit;
  const perColumn = useMemo(() => (unitNow === 'mo' ? months : years.map(() => 1)), [unitNow, months, years]);
  // The table's divisor: the month view's figures are already per month.
  const tablePer = useMemo(() => (view === 'months' ? MONTH_KEYS.map(() => 1) : perColumn), [view, perColumn]);

  // --- the hero chart ----------------------------------------------------------
  // The lines plot RECURRING spending, including tax paid on withdrawals: it is
  // money out the door, and it makes the gap between the two lines what the
  // readout calls Saved, less any one-time lump. A lump (a down payment) is a
  // column from the baseline instead, capped so it cannot set the y-domain and
  // flatten sixty years of living costs into the bottom third (V5-REVIEW-1
  // F11). The readout, waterfall and table still count it.
  const incomeLine = useMemo(() => tree.flows.map((f, i) => f.afterTax / perColumn[i]), [tree.flows, perColumn]);
  const recurringLine = useMemo(
    () => tree.flows.map((f, i) => (f.spent - f.lumps + f.withdrawalTax) / perColumn[i]),
    [tree.flows, perColumn],
  );
  const lumpValues = useMemo(() => tree.flows.map((f, i) => f.lumps / perColumn[i]), [tree.flows, perColumn]);
  // The cap follows the visible window: a 5Y view of retirement has lower lines
  // than the whole plan, and a cap taken from the whole plan would crush them.
  const lumpCap = useMemo(() => {
    const win = rangeWindow(years, startYear, chartRange);
    let top = 0;
    years.forEach((y, i) => {
      if (y >= win.from && y <= win.to) top = Math.max(top, incomeLine[i], recurringLine[i]);
    });
    return top * LUMP_CAP_SHARE;
  }, [years, startYear, chartRange, incomeLine, recurringLine]);
  const series = useMemo<ChartSeries[]>(() => {
    const top = incomeLine.map((v, i) => Math.max(v, recurringLine[i]));
    const list: ChartSeries[] = [
      // The wash between the lines: two areas that each fill from one line to the
      // higher of the two, so exactly one of them has height in any year.
      { id: 'saving', label: 'Saving', color: 'var(--in)', kind: 'area', values: top, fillTo: recurringLine, fillOpacity: 0.2, lineWidth: 0, activeDot: false },
      { id: 'drawing', label: 'Drawing down', color: 'var(--out)', kind: 'area', values: top, fillTo: incomeLine, fillOpacity: 0.22, lineWidth: 0, activeDot: false },
    ];
    if (lumpCap > 0 && lumpValues.some((v) => v > 0.5)) {
      list.push({ id: 'lumps', label: 'One-time', color: LUMP_COLOR, kind: 'column', values: lumpValues.map((v) => Math.min(v, lumpCap)) });
    }
    list.push(
      { id: 'income', label: 'After tax', color: 'var(--in)', values: incomeLine },
      { id: 'spending', label: 'Spending', color: 'var(--out)', values: recurringLine },
    );
    return list;
  }, [incomeLine, recurringLine, lumpValues, lumpCap]);
  const notes = useMemo<ChartNote[]>(
    () =>
      lumpCap <= 0
        ? []
        : years.flatMap((year, i) =>
            lumpValues[i] >= lumpCap * LUMP_LABEL_MIN_SHARE
              ? [{ year, value: Math.min(lumpValues[i], lumpCap), text: `${lumpValues[i] > lumpCap ? '↑ ' : ''}${money(tree.flows[i].lumps)}` }]
              : [],
          ),
    [years, lumpValues, lumpCap, tree.flows],
  );

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

  // The month view holds one year still: the pinned year, not the hover preview.
  const tableYear = pinned ?? defaultYear;
  const tableIdx = years.indexOf(tableYear);
  const monthly = useMemo(
    () => (view === 'months' && tableIdx >= 0 ? monthlyColumns(tree, tableIdx, plan) : undefined),
    [view, tree, tableIdx, plan],
  );
  const columnHeads = useMemo(
    () =>
      monthly?.months.map((m) => ({
        label: m.covered ? (
          m.label
        ) : (
          <>
            {m.label}
            <span className="ns-col-note">before today</span>
          </>
        ),
        muted: !m.covered,
      })),
    [monthly],
  );
  // The first year's covered months are the last few columns: scroll them
  // into view instead of landing on a screen of "before today".
  const tableCard = useRef<HTMLDivElement>(null);
  const firstMonth = monthly?.lumpMonth;
  useLayoutEffect(() => {
    if (firstMonth === undefined) return;
    const scroller = tableCard.current?.querySelector<HTMLElement>('.ns-table-scroll');
    const head = scroller?.querySelector<HTMLElement>('.ns-row-head');
    const cell = head?.children[firstMonth + 1] as HTMLElement | undefined;
    const label = head?.firstElementChild as HTMLElement | undefined;
    if (!scroller || !cell || !label) return;
    scroller.scrollLeft = firstMonth === 0 ? 0 : cell.offsetLeft - label.offsetWidth;
  }, [firstMonth, tableYear]);
  const stepYear = (delta: number) => {
    const next = years[tableIdx + delta];
    if (next !== undefined) setFocusYear(next);
  };

  const people = plan.participants.filter((p) => p.isIncluded && p.role !== 'child');
  const agesFor = (year: number) => {
    const ages = snapshots[years.indexOf(year)]?.ages;
    if (!ages) return undefined;
    const parts = people.filter((p) => ages[p.id] !== undefined).map((p) => `${p.name} ${Math.round(ages[p.id])}`);
    return parts.length ? parts.join(' · ') : undefined;
  };

  // The band is the plan's short years only (F2), amounts in this page's unit
  // (each year's own divisor, so the partial first year reads right in /mo).
  const danger = useMemo(
    () => inUnit(healthDangerBand(health, result), (y) => perColumn[years.indexOf(y)] ?? 1),
    [health, result, perColumn, years],
  );

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

  // The table is memoised (F28), so it must not see a new function every time
  // a hover step re-renders this page.
  const latest = useRef({ focus: setFocusYear, edit: editor.edit, assumptions: () => setAssumptionsDraft(structuredClone(stored)) });
  latest.current = { focus: setFocusYear, edit: editor.edit, assumptions: () => setAssumptionsDraft(structuredClone(stored)) };
  const onTableFocus = useCallback((year: number | null) => latest.current.focus(year), []);
  const onTableEdit = useCallback((event: PlanEvent) => latest.current.edit(event), []);
  const onTableAssumptions = useCallback(() => latest.current.assumptions(), []);

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
  const unitWord = unitNow === 'mo' ? 'per month' : 'per year';
  const isShort = health.shortYears.includes(activeYear);

  return (
    <Page>
      <PageHeader
        title="Cash flow"
        actions={
          <div className="ns-cf-controls">
            <RangePicker value={chartRange} onChange={setChartRange} years={years} openingYear={startYear} compact={phone} />
            {view === 'years' && (
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
            )}
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
            ...(flow.lumps > 0.5 ? [{ id: 'lumps', label: 'One-time', color: LUMP_COLOR, value: money(flow.lumps) }] : []),
            savedNow >= 0
              ? { id: 'saved', label: 'Saved', color: 'var(--in)', value: money(savedNow) }
              : { id: 'saved', label: 'Drawn down', color: 'var(--out)', value: money(-savedNow) },
          ]}
          short={isShort}
          shortAmount={isShort && flow.unfunded > 0 ? money(flow.unfunded / per) : undefined}
          shortUnit={`/${unitNow}`}
        />
        <TimeSeriesChart
          years={years}
          series={series}
          range={chartRange}
          todayYear={startYear}
          height={phone ? 280 : 420}
          focusYear={focusYear}
          onFocusYear={setFocusYear}
          onHoverYear={setHoverYear}
          readout={false}
          danger={danger}
          notes={notes}
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
        <div className="ns-cf-tablehead">
          <h2 className="ns-cf-title">
            {view === 'years' ? 'Year by year' : 'Month by month'} <span className="ns-cf-unit">{unitWord}</span>
          </h2>
          <div className="ns-cf-tablecontrols">
            {view === 'months' && (
              <div className="ns-cf-stepper" role="group" aria-label="Year">
                <button
                  type="button"
                  className="ns-cf-step"
                  aria-label="Previous year"
                  disabled={tableIdx <= 0}
                  onClick={() => stepYear(-1)}
                >
                  <ChevronLeft size={14} strokeWidth={2} aria-hidden />
                </button>
                <span className="ns-cf-stepyear" aria-live="polite">
                  {tableYear}
                </span>
                <button
                  type="button"
                  className="ns-cf-step"
                  aria-label="Next year"
                  disabled={tableIdx < 0 || tableIdx >= years.length - 1}
                  onClick={() => stepYear(1)}
                >
                  <ChevronRight size={14} strokeWidth={2} aria-hidden />
                </button>
              </div>
            )}
            <Segmented
              size="sm"
              ariaLabel="Show by year or by month"
              value={view}
              onChange={(v) => setView(v as View)}
              options={[
                { value: 'years', label: 'Years' },
                { value: 'months', label: 'Months' },
              ]}
            />
          </div>
        </div>
        <div className="ns-cf-tablecard" ref={tableCard}>
          {view === 'years' || !monthly ? (
            <CashFlowTab
              tree={tree}
              years={years}
              snapshots={snapshots}
              events={plan.events}
              perColumn={tablePer}
              focusYear={pinned}
              onFocusYear={onTableFocus}
              dangerYears={health.shortYears}
              hot={hot}
              onHot={setHot}
              onEdit={onTableEdit}
              onEditAssumptions={onTableAssumptions}
              startYear={startYear}
              asOfDate={asOfDate}
            />
          ) : (
            <CashFlowTab
              tree={monthly}
              years={MONTH_KEYS}
              columnHeads={columnHeads}
              events={plan.events}
              perColumn={tablePer}
              focusYear={null}
              onFocusYear={onTableFocus}
              hot={hot}
              onHot={setHot}
              onEdit={onTableEdit}
              onEditAssumptions={onTableAssumptions}
            />
          )}
        </div>
        {view === 'months' && monthly && (
          <p className="ns-cf-foot">
            Northstar plans by year. Months split each year by the days it covers; one-time items show in {MONTH_NAMES[monthly.lumpMonth]}.
          </p>
        )}
      </section>
    </Page>
  );
}
