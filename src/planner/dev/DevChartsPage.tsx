import { useMemo, useState } from 'react';
import {
  DonutChart,
  RangePicker,
  TimeSeriesChart,
  type ChartMarker,
  type ChartSeries,
  type DonutSegment,
  type RangeKey,
} from '../charts';
import { money } from '../format';
import { MiniChart } from '../views/MiniChart';

/**
 * `/dev/charts` — every chart-kit component on fixture data, so a chart can
 * be driven by hand without building a plan (docs/REDESIGN-V5.md §3.9).
 * Dev-only (App.tsx gates the route on `import.meta.env.DEV`) and out of the
 * nav. One pinned year is shared by every chart on the page, the way the
 * app-wide focus year will be (§4.1) — pin one and the rest follow.
 */

const START = 2026;
const END = 2091;
const YEARS = Array.from({ length: END - START + 1 }, (_, i) => START + i);

/** Saving until 2053, then drawing down. The spendable pot hits zero in 2071
    while home equity keeps net worth positive: the shape of the plan that
    motivated §4.2 (net worth never visibly fails; the spendable line does). */
const fixture = (() => {
  const PEAK = 1_650_000;
  const RETIRE_I = 27; // 2053
  const DRY_I = 45; // 2071
  const spendable: number[] = [];
  const shortfall: number[] = [];
  const homeEquity: number[] = [];
  YEARS.forEach((_, i) => {
    const s =
      i <= RETIRE_I
        ? 280_000 + (PEAK - 280_000) * (i / RETIRE_I) ** 1.4
        : Math.max(0, PEAK * (1 - ((i - RETIRE_I) / (DRY_I - RETIRE_I)) ** 1.6));
    spendable.push(s);
    shortfall.push(i >= DRY_I ? (i - DRY_I + 1) * 38_000 : 0);
    homeEquity.push(300_000 + i * 14_000);
  });
  const retirement = spendable.map((v) => v * 0.55);
  const brokerage = spendable.map((v) => v * 0.35);
  const cash = spendable.map((v) => v * 0.1);
  const netWorth = spendable.map((s, i) => s + homeEquity[i]);
  const firstShort = YEARS.find((_, i) => shortfall[i] > 0) ?? 2071;
  return { spendable, shortfall, homeEquity, retirement, brokerage, cash, netWorth, firstShort };
})();

const MARKERS: ChartMarker[] = [
  { year: 2029, label: 'Buy the house', tone: 'cost' },
  { year: 2032, label: 'Baby', tone: 'cost' },
  { year: 2036, label: 'Raise', tone: 'income' },
  { year: 2054, label: 'Retire', tone: 'neutral' },
];

const agesFor = (year: number) => `Spencer ${year - 1986} · Sarah ${year - 1987}`;
const shortFor = (year: number) => fixture.shortfall[year - START];

const NW_SERIES: ChartSeries[] = [
  { id: 'nw', label: 'Net worth', color: 'var(--data-nw)', values: fixture.netWorth, kind: 'area' },
  { id: 'spend', label: 'Spendable', color: 'var(--data-nw)', values: fixture.spendable, dashed: true, lineWidth: 1.5 },
];

const LINES: ChartSeries[] = [
  { label: 'Income', color: 'var(--in)', values: YEARS.map((y) => (y < 2054 ? 190_000 + (y - START) * 3_200 : 64_000)) },
  { label: 'Spending', color: 'var(--out)', values: YEARS.map((y) => 118_000 + (y - START) * 2_400) },
  { label: 'Saved', color: 'var(--mix-4)', values: YEARS.map((y) => (y < 2054 ? 72_000 - (y - START) * 600 : -20_000)), dashed: true },
];

const STACKED: ChartSeries[] = [
  { label: 'Cash', color: 'var(--mix-6)', values: fixture.cash },
  { label: 'Brokerage', color: 'var(--mix-1)', values: fixture.brokerage },
  { label: '401(k)', color: 'var(--mix-2)', values: fixture.retirement },
  { label: 'Home equity', color: 'var(--mix-3)', values: fixture.homeEquity },
];

const BUDGET_YEARS = YEARS.slice(0, 15);
const COLUMNS: ChartSeries[] = [
  { label: 'Home', color: 'var(--mix-1)', kind: 'column', values: BUDGET_YEARS.map((y) => 36_000 + (y > 2029 ? 18_000 : 0)) },
  { label: 'Kids', color: 'var(--mix-4)', kind: 'column', values: BUDGET_YEARS.map((y) => (y > 2032 ? 9_000 + (y - 2032) * 2_200 : 0)) },
  { label: 'Shared', color: 'var(--mix-3)', kind: 'column', values: BUDGET_YEARS.map((y) => 24_000 + (y - START) * 700) },
];
const COLUMN_GHOST: ChartSeries = {
  label: 'Draft',
  color: 'var(--ink)',
  values: BUDGET_YEARS.map((_, i) => COLUMNS.reduce((a, s) => a + s.values[i], 0) * 0.9),
};

const SHORT_YEARS = [START, START + 1, START + 2, START + 3, START + 4];
const SHORT_SERIES: ChartSeries[] = [
  { label: 'Cash', color: 'var(--data-nw)', kind: 'area', values: [41_000, 52_400, 61_100, 58_700, 70_200] },
];

const GHOST_BASE: ChartSeries[] = [
  { id: 'nw', label: 'Net worth', color: 'var(--data-nw)', values: fixture.netWorth, kind: 'area' },
];
const GHOST_LINE: ChartSeries = {
  label: 'What if: 7% return',
  color: 'var(--ink)',
  values: fixture.netWorth.map((v, i) => v * (1 + i * 0.012)),
};

const DONUT_NOW: DonutSegment[] = [
  { key: 'home', label: 'Home', value: 6_100, color: 'var(--mix-1)' },
  { key: 'kids', label: 'Kids', value: 3_900, color: 'var(--mix-4)' },
  { key: 'shared', label: 'Shared', value: 2_400, color: 'var(--mix-3)' },
  { key: 'personal', label: 'Personal', value: 1_800, color: 'var(--mix-2)' },
  { key: 'unfunded', label: 'Unfunded', value: 0, color: 'var(--out)', tone: 'danger' },
];
const DONUT_LATER: DonutSegment[] = [
  { key: 'home', label: 'Home', value: 4_300, color: 'var(--mix-1)' },
  { key: 'kids', label: 'Kids', value: 800, color: 'var(--mix-4)' },
  { key: 'shared', label: 'Shared', value: 3_100, color: 'var(--mix-3)' },
  { key: 'personal', label: 'Personal', value: 2_600, color: 'var(--mix-2)' },
  { key: 'unfunded', label: 'Unfunded', value: 2_900, color: 'var(--out)', tone: 'danger' },
];

const HEADING = {
  margin: '0 0 6px',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
} as const;

export function DevChartsPage() {
  const [range, setRange] = useState<RangeKey>('all');
  const [outsideRange, setOutsideRange] = useState<RangeKey>('10y');
  const [focus, setFocus] = useState<number | null>(null);
  const [later, setLater] = useState(false);
  const [lastSlice, setLastSlice] = useState<string | null>(null);

  const danger = useMemo(() => ({ from: fixture.firstShort, shortFor }), []);
  const dangerInside = useMemo(() => ({ from: 2051, to: 2064, shortFor: (y: number) => (y - 2050) * 4_000 }), []);

  return (
    <div className="ns-page">
      <header>
        <h1 className="ns-page-title">Chart kit</h1>
        <p className="ns-page-meta">
          /dev/charts · fixtures only · pinned year {focus ?? 'none'} (shared by every chart here)
        </p>
      </header>

      <section>
        <h2 style={HEADING}>Hero area · readout, range, danger band, markers, spendable</h2>
        <TimeSeriesChart
          years={YEARS}
          series={NW_SERIES}
          range={range}
          todayYear={START}
          height={420}
          focusYear={focus}
          onFocusYear={setFocus}
          danger={danger}
          onRequestRange={setRange}
          markers={MARKERS}
          readout={{
            label: 'Net worth',
            primaryId: 'nw',
            agesFor,
            actions: <RangePicker value={range} onChange={setRange} years={YEARS} openingYear={START} />,
          }}
          ariaLabel="Net worth over time"
        />
      </section>

      <section>
        <h2 style={HEADING}>Danger band outside the window · click the chip to jump to All</h2>
        <TimeSeriesChart
          years={YEARS}
          series={NW_SERIES.slice(1)}
          range={outsideRange}
          todayYear={START}
          height={240}
          focusYear={focus}
          onFocusYear={setFocus}
          danger={danger}
          onRequestRange={setOutsideRange}
          readout={{ label: 'Spendable', size: 'compact', agesFor }}
          ariaLabel="Spendable money, 10 year window"
        />
        <div style={{ marginTop: 8 }}>
          <RangePicker value={outsideRange} onChange={setOutsideRange} years={YEARS} openingYear={START} />
        </div>
      </section>

      <section>
        <h2 style={HEADING}>Danger band inside the window</h2>
        <TimeSeriesChart
          years={YEARS.slice(0, 45)}
          series={[{ label: 'Balance', color: 'var(--data-nw)', kind: 'area', values: fixture.spendable.slice(0, 45).map((v, i) => (i > 24 ? Math.max(0, v - i * 14_000) : v)) }]}
          height={260}
          focusYear={focus}
          onFocusYear={setFocus}
          danger={dangerInside}
          readout={{ label: 'Balance', size: 'compact' }}
          ariaLabel="Balance with a shortfall"
        />
      </section>

      <section>
        <h2 style={HEADING}>Multiple lines · end labels · negative values</h2>
        <TimeSeriesChart
          years={YEARS.slice(0, 35)}
          series={LINES}
          height={280}
          endLabels
          focusYear={focus}
          onFocusYear={setFocus}
          readout={{ label: 'Income', primaryId: 'Income', agesFor }}
          ariaLabel="Income, spending and saved"
        />
      </section>

      <section>
        <h2 style={HEADING}>Stacked area</h2>
        <TimeSeriesChart
          years={YEARS}
          series={STACKED}
          stacked
          height={300}
          focusYear={focus}
          onFocusYear={setFocus}
          readout={{ label: 'Net worth by account', agesFor }}
          ariaLabel="Balances by account class"
        />
      </section>

      <section>
        <h2 style={HEADING}>Stacked columns · ghost draft line</h2>
        <TimeSeriesChart
          years={BUDGET_YEARS}
          series={COLUMNS}
          stacked
          ghost={COLUMN_GHOST}
          height={280}
          focusYear={focus}
          onFocusYear={setFocus}
          readout={{ label: 'Spending per year', agesFor }}
          ariaLabel="Spending by group"
        />
      </section>

      <section>
        <h2 style={HEADING}>Grouped columns</h2>
        <TimeSeriesChart
          years={BUDGET_YEARS}
          series={COLUMNS}
          height={220}
          focusYear={focus}
          onFocusYear={setFocus}
          readout={{ label: 'Home', primaryId: 'Home', size: 'compact' }}
          ariaLabel="Spending by group, side by side"
        />
      </section>

      <section>
        <h2 style={HEADING}>1Y with dots · three annual points</h2>
        <TimeSeriesChart
          years={SHORT_YEARS}
          series={SHORT_SERIES}
          range="1y"
          todayYear={START}
          height={220}
          focusYear={focus}
          onFocusYear={setFocus}
          readout={{ label: 'Cash', size: 'compact' }}
          ariaLabel="Cash, one year"
        />
      </section>

      <section>
        <h2 style={HEADING}>Ghost line (a draft) on an area</h2>
        <TimeSeriesChart
          years={YEARS}
          series={GHOST_BASE}
          ghost={GHOST_LINE}
          height={260}
          focusYear={focus}
          onFocusYear={setFocus}
          readout={{ label: 'Net worth', agesFor }}
          ariaLabel="Net worth with a draft"
        />
      </section>

      <section>
        <h2 style={HEADING}>MiniChart wrapper (no page edits)</h2>
        <MiniChart
          years={YEARS.slice(0, 30)}
          series={[
            { label: 'Home value', color: 'var(--data-nw)', values: fixture.homeEquity.slice(0, 30).map((v) => v * 3), stepAt: 3 },
            { label: 'Mortgage', color: 'var(--out)', values: fixture.homeEquity.slice(0, 30).map((v, i) => Math.max(0, 420_000 - i * 22_000 - v * 0.0)), stepAt: 3 },
            { label: 'Equity', color: 'var(--in)', values: fixture.homeEquity.slice(0, 30), fill: true, stepAt: 3 },
          ]}
          height={220}
          endLabels
          focusYear={focus}
          onFocusYear={setFocus}
        />
      </section>

      <section>
        <h2 style={HEADING}>Donut · toggle morphs the arcs, hover a slice or a legend row</h2>
        <button type="button" className="ns-btn" onClick={() => setLater((v) => !v)}>
          Show {later ? '2036' : '2056'}
        </button>
        <div style={{ marginTop: 16, maxWidth: 640 }}>
          <DonutChart
            segments={later ? DONUT_LATER : DONUT_NOW}
            center={
              later
                ? { value: `Short ${money(2_900)}`, label: 'Spent per month', tone: 'danger' }
                : { value: money(14_200), label: 'Spent per month' }
            }
            onSelect={setLastSlice}
            ariaLabel="Spending by group"
          />
          <p className="ns-page-meta">Last slice selected: {lastSlice ?? 'none'}</p>
        </div>
      </section>
    </div>
  );
}
