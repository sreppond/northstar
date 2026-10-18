import { useCallback, useMemo, useRef, useState } from 'react';
import { usePlanner } from '../PlannerContext';
import { AnimatedFigure } from '../AnimatedFigure';
import { ChartReadout, RangePicker, TimeSeriesChart, type ReadoutItem } from '../charts';
import { rangeWindow } from '../charts/range';
import { useThrottledValue } from '../charts/useSpring';
import { Cell, type CellMagnitude } from '../tabs/DataTable';
import { money, percent, planMetaLine, tableMoney, tablePercent } from '../format';
import { stubYearLabel } from '../ledger';
import { agesLabel, dangerBand } from './netWorthData';
import {
  buildExploreRows,
  downloadTextFile,
  EXPLORE_COLUMNS,
  exploreRowsToCsv,
  exploreRowsToJson,
  type ExploreRow,
} from '../reports';
import { Page, PageHeader, SectionCard, Segmented } from '../ui';

/** Expense-shaped columns get the "money out" hue; everything else (net
    worth, income, contributions, savings rate) reads as "money in" — the
    same income/cost convention the ledger tables use, just applied per
    COLUMN here since Reports transposes the ledger's axes (a row is a
    year, not a line item). `year` never gets a bar. */
const COST_COLUMNS = new Set<keyof ExploreRow>(['expenses', 'taxes', 'withdrawals']);

type ReportsTab = 'explore' | 'plots';

const TAB_OPTIONS = [
  { value: 'explore', label: 'Table' },
  { value: 'plots', label: 'Charts' },
];

const PLOT_DEFINITIONS: { key: keyof ExploreRow; label: string; color: string }[] = [
  { key: 'netWorth', label: 'Net Worth', color: 'var(--data-nw)' },
  { key: 'income', label: 'Income', color: 'var(--in)' },
  { key: 'expenses', label: 'Expenses', color: 'var(--out)' },
  { key: 'taxes', label: 'Taxes', color: 'var(--out)' },
  { key: 'contributions', label: 'Contributions', color: 'var(--in)' },
  // M16: this was `--cmp` (the compared-PLAN hue) — a colour reserved for
  // "the other line in a comparison," which withdrawals are not. Money
  // leaving the accounts is a cost, same as Expenses/Taxes above.
  { key: 'withdrawals', label: 'Withdrawals', color: 'var(--out)' },
  { key: 'contributionRatePercent', label: 'Contribution Rate', color: 'var(--in)' },
];

/**
 * The spreadsheet-style counterpart to every chart elsewhere: every plan
 * year as one row of the figures `runPlan` already produces, plus CSV/JSON
 * export. A power-user surface, not a narrative one — nothing here reads
 * differently depending on what's selected or scrubbed elsewhere.
 */
export function ReportsPage() {
  const { plan, result, stored, health, focusYear, setFocusYear, chartRange, setChartRange } = usePlanner();
  const [tab, setTab] = useState<ReportsTab>('explore');
  // V5-REVIEW-2 N13: the 7 small multiples are ONE instrument. Whichever one
  // is hovered reports its year here, and every chart draws its cursor there.
  const [hoverYear, setHoverYearState] = useState<number | null>(null);
  const hoverRef = useRef<number | null>(null);
  const setHoverYear = useCallback((year: number | null) => {
    hoverRef.current = year;
    setHoverYearState(year);
  }, []);

  const rows = useMemo(() => buildExploreRows(result), [result]);
  const hasPlan = plan.accounts.length > 0 || plan.events.length > 1;
  const stub = stubYearLabel(plan.settings.startYear, plan.settings.startYear, plan.settings.asOfDate);
  const stubYear = plan.settings.startYear;
  const years = useMemo(() => rows.map((r) => r.year), [rows]);
  const danger = useMemo(() => dangerBand(health, result), [health, result]);
  const shortYears = useMemo(() => new Set(health.shortYears), [health.shortYears]);

  // The year every chart and the one readout agree on: hover, else the pin,
  // else the last year in view (what a lone chart's readout defaults to).
  const visibleYears = useMemo(() => {
    const win = rangeWindow(years, result.startYear, chartRange);
    return years.filter((y) => y >= win.from - 1e-9 && y <= win.to + 1e-9);
  }, [years, result.startYear, chartRange]);
  const pinnedYear =
    focusYear !== null && visibleYears.length
      ? visibleYears.reduce((best, y) => (Math.abs(y - focusYear) < Math.abs(best - focusYear) ? y : best))
      : null;
  const readoutYear = hoverYear ?? pinnedYear ?? visibleYears.at(-1) ?? null;
  const readoutRow = readoutYear === null ? undefined : rows.find((r) => r.year === readoutYear);
  // Charts get hover as their pin (see `sharedFocus`): the kit has no
  // controlled-hover prop, and a pin is drawn as a full-height rule.
  const sharedFocus = hoverYear ?? focusYear;
  // A click inside a chart arrives as "unpin" because the chart believes the
  // hovered year is already pinned; turn it back into pin/unpin of the real pin.
  const onChartFocus = useCallback(
    (year: number | null) => {
      const hovered = hoverRef.current;
      if (year === null && hovered !== null) setFocusYear(focusYear === hovered ? null : hovered);
      else setFocusYear(year);
    },
    [focusYear, setFocusYear],
  );

  // Scaled per COLUMN, across every row — the Reports equivalent of
  // DataTable's "scaled per row" rule, just transposed: here a column IS
  // the series (every year's Net Worth, say), so that's the set a single
  // year's bar should read against, not the whole table's mixed units.
  const columnMax = useMemo(() => {
    const max = new Map<keyof ExploreRow, number>();
    for (const col of EXPLORE_COLUMNS) {
      if (col.key === 'year') continue;
      max.set(col.key, Math.max(1, ...rows.map((r) => Math.abs(r[col.key] as number))));
    }
    return max;
  }, [rows]);

  const summary = useMemo(() => {
    const netWorthAtHorizon = rows.at(-1)?.netWorth ?? 0;
    const avgContributionRate = rows.length
      ? rows.reduce((s, r) => s + r.contributionRatePercent, 0) / rows.length
      : 0;
    const totalTaxes = rows.reduce((s, r) => s + r.taxes, 0);
    const peakWithdrawalRow = rows.reduce<ExploreRow | undefined>(
      (best, r) => (r.withdrawals > (best?.withdrawals ?? 0) ? r : best),
      undefined,
    );
    return { netWorthAtHorizon, avgContributionRate, totalTaxes, peakWithdrawalRow };
  }, [rows]);

  // The old stat strip's other three figures, as the readout's small row. The
  // swatch hues follow the table: money in is --in, money out is --out.
  const summaryItems: ReadoutItem[] = [
    { id: 'rate', label: 'Avg. contribution rate', color: 'var(--in)', value: percent(summary.avgContributionRate, 0) },
    { id: 'taxes', label: 'Total taxes', color: 'var(--out)', value: money(summary.totalTaxes) },
    {
      id: 'peak',
      label: 'Peak withdrawal year',
      color: 'var(--out)',
      value: summary.peakWithdrawalRow
        ? `${summary.peakWithdrawalRow.year} · ${money(summary.peakWithdrawalRow.withdrawals)}`
        : 'None modeled',
    },
  ];

  function exportCsv() {
    downloadTextFile(`${fileSlug(stored.name)}-explore.csv`, exploreRowsToCsv(rows), 'text/csv');
  }
  function exportJson() {
    downloadTextFile(`${fileSlug(stored.name)}-explore.json`, exploreRowsToJson(rows), 'application/json');
  }

  return (
    <Page>
      <PageHeader
        title="Reports"
        meta={planMetaLine(stored, result.endYear)}
        actions={
          hasPlan && (
            <>
              {/* S1: was `ns-btn-ghost` (no border), which reads as no
                  button at all in dark mode — bordered secondary, same as
                  "Edit assumptions" elsewhere. */}
              <button type="button" className="ns-btn ns-btn-sm" onClick={exportCsv}>
                Export CSV
              </button>
              <button type="button" className="ns-btn ns-btn-sm" onClick={exportJson}>
                Export JSON
              </button>
            </>
          )
        }
      />

      {!hasPlan ? (
        <div className="ns-card">
          <div className="ns-view-empty">Add an account or an event to see reports.</div>
        </div>
      ) : (
        <>
          <section className="ns-rpt-hero" aria-label="Plan totals">
            <ChartReadout
              label="Net worth at horizon"
              value={money(summary.netWorthAtHorizon)}
              yearLabel={String(rows.at(-1)?.year ?? result.endYear)}
              secondary={summaryItems}
            />
          </section>

          {tab === 'explore' ? (
            <SectionCard
              title="Plan by year"
              actions={
                <div className="ns-rpt-actions">
                  <Segmented options={TAB_OPTIONS} value={tab} onChange={(v) => setTab(v as ReportsTab)} size="sm" ariaLabel="View" />
                </div>
              }
              flush
            >
              {/* S5: dropped the 560px inner scroll — a plan's full year range
                  (~20-60 rows) reads fine as one plain scroll of the page,
                  and a sticky-inside-a-fixed-height panel hid rows with no
                  affordance that more existed below the fold. */}
              <div className="ns-table-scroll">
                <table className="ns-datatable">
                  <thead>
                    <tr>
                      {EXPLORE_COLUMNS.map((col) => (
                        <th key={col.key}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.year} className={shortYears.has(row.year) ? 'ns-col-danger' : undefined}>
                        {EXPLORE_COLUMNS.map((col) => {
                          if (col.key === 'year')
                            return (
                              <td
                                key={col.key}
                                className={shortYears.has(row.year) ? 'ns-rpt-short-year' : undefined}
                                // V5-REVIEW-2 N13: the stub note lives in a tooltip, so the
                                // column reads as bare years.
                                title={row.year === stubYear && stub ? `${row.year} ${stub.short}` : undefined}
                              >
                                {shortYears.has(row.year) && (
                                  <span className="ns-year-short" role="img" aria-label="Plan runs short this year">
                                    ✗
                                  </span>
                                )}
                                {row.year}
                              </td>
                            );
                          const value = row[col.key] as number;
                          const max = columnMax.get(col.key) ?? 1;
                          const magnitude: CellMagnitude = {
                            fraction: Math.abs(value) / max,
                            tone: COST_COLUMNS.has(col.key) ? 'cost' : 'income',
                          };
                          return (
                            <td key={col.key}>
                              <Cell
                                value={col.percent ? tablePercent(value) : tableMoney(value)}
                                magnitude={magnitude}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ) : (
            <section className="ns-rpt-plots" aria-labelledby="rpt-plots-title">
              <div className="ns-rpt-plots-head">
                <h2 className="ns-rpt-plots-title" id="rpt-plots-title">
                  Plan by year
                </h2>
                <div className="ns-rpt-actions">
                  {tab === 'plots' && <RangePicker value={chartRange} onChange={setChartRange} years={years} openingYear={result.startYear} />}
                  <Segmented options={TAB_OPTIONS} value={tab} onChange={(v) => setTab(v as ReportsTab)} size="sm" ariaLabel="View" />
                </div>
              </div>

              <PlotReadout
                year={readoutRow?.year}
                ages={readoutRow ? agesLabel(plan, result.years.find((y) => y.year === readoutRow.year)) : undefined}
                short={readoutRow ? shortYears.has(readoutRow.year) : false}
                shortAmount={readoutRow ? danger?.shortFor?.(readoutRow.year) : undefined}
              />

              <div className="ns-rpt-plot-grid">
                {PLOT_DEFINITIONS.map((p) => {
                  const percentFormat = p.key === 'contributionRatePercent';
                  const at = readoutRow ? (readoutRow[p.key] as number) : undefined;
                  return (
                    <div className="ns-rpt-plot" key={p.key}>
                      <div className="ns-rpt-plot-head">
                        <span className="ns-rpt-plot-label">{p.label}</span>
                        <AnimatedFigure
                          className="ns-rpt-plot-value ns-num"
                          value={at === undefined ? '–' : percentFormat ? `${at.toFixed(1)}%` : money(at)}
                        />
                      </div>
                      <TimeSeriesChart
                        years={years}
                        series={[
                          {
                            id: p.key,
                            label: p.label,
                            color: p.color,
                            kind: 'area',
                            values: rows.map((r) => r[p.key] as number),
                          },
                        ]}
                        range={chartRange}
                        todayYear={result.startYear}
                        height={190}
                        focusYear={sharedFocus}
                        onFocusYear={onChartFocus}
                        onHoverYear={setHoverYear}
                        danger={danger}
                        onRequestRange={setChartRange}
                        yFormat={percentFormat ? (v) => `${Math.round(v)}%` : undefined}
                        readout={false}
                        ariaLabel={`${p.label} by year`}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </Page>
  );
}

/** The single readout for all seven charts: the year, the adults' ages, and
    one Short pill when that year is short. Each chart's own card then carries
    only its label and value. */
function PlotReadout({
  year,
  ages,
  short,
  shortAmount,
}: {
  year: number | undefined;
  ages: string | undefined;
  short: boolean;
  shortAmount: number | undefined;
}) {
  const amount = short && shortAmount !== undefined && shortAmount > 0 ? money(shortAmount) : undefined;
  // One announcement per settled year, not one per scrubbed frame.
  const spoken = useThrottledValue(
    year === undefined ? '' : `${year}${ages ? `, ${ages}` : ''}${short ? `. Short ${amount ? `${amount} a year` : ''}` : ''}`.trim(),
    700,
  );
  return (
    <div className="ns-rpt-readout">
      <span className="ns-rpt-readout-year">{year ?? '–'}</span>
      {ages && <span className="ns-rpt-readout-ages">{ages}</span>}
      {short && (
        <span className="ns-readout-short">
          <span aria-hidden="true">✗</span> Short{amount ? ` ${amount}/yr` : ''}
        </span>
      )}
      <span className="ns-ch-sr" aria-live="polite" aria-atomic="true">
        {spoken}
      </span>
    </div>
  );
}

function fileSlug(name: string): string {
  return name.trim().replace(/\s+/g, '-').toLowerCase();
}
