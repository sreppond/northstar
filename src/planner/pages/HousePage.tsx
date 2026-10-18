import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { DEFAULT_ZONES, affordabilityCurve, planEndYear, primaryHome, readHome, recurringSpending, runPlan } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { money, percent } from '../format';
import { Page, PageHeader } from '../ui';
import { PlanCheckBanner } from '../PlanCheckBanner';
import { HouseForecastView } from '../views/HouseForecastView';
import { AffordabilityMap, type MapPoint } from '../views/AffordabilityMap';
import { PriceCurve, type CurveDatum } from '../views/PriceCurve';
import { HomeBudgetDonut } from '../views/HomeBudgetDonut';
import { ChartReadout, RangePicker, TimeSeriesChart, rangeWindow, type ChartNote, type RangeKey } from '../charts';
import { inDanger } from '../charts/seriesMath';
import { ImpactStrip, PreviewActions } from '../ImpactStrip';
import { impactMetrics, presentResult } from '../impact';
import { planHealth } from '../health';
import { agesLineFor, dangerBandFor, useHeroHeight } from '../decisionKit';
import { priceGrid, pricePoints, shownCashLeft, shownPrice as shownPriceOf } from '../priceCurve';
import {
  ZONE_LABEL,
  applyTerms,
  cashCushion,
  currentTerms,
  fromDisplay,
  ownCost,
  toDisplay,
  zoneOf,
  type HomeTerms,
  type Zone,
} from '../homeView';
import './household.css';
import './decisions.css';

/**
 * Home (docs/REDESIGN-V4.md §4.6, rebuilt on the v5 chart kit,
 * docs/REDESIGN-V5.md §5.5): when to buy, how much to spend, and whether that
 * price leaves the household house-poor, against the whole plan. The map and
 * the price curve lead; every reading is on the chart's own readout.
 */
export function HousePage() {
  return (
    <Page>
      <PageHeader title="Home" />
      <PlanCheckBanner only={['rent-after-purchase']} />
      <HomeDecision />
    </Page>
  );
}

/** Years worth looking at: next year through 20 years out, never past the plan. */
function candidateYears(start: number, end: number): number[] {
  const out: number[] = [];
  for (let y = start + 1; y <= Math.min(end - 1, start + 20); y++) out.push(y);
  return out;
}

/**
 * The year every Home chart reads at rest (V5-REVIEW-1 F17): the pin if there
 * is one, else the purchase year being tried. The map already reads that year
 * (its x-axis IS the purchase year); the time charts below used to rest on the
 * plan's last year, so one page showed 2031 and 2091 side by side.
 */
function pageYear(focusYear: number | null, tryYear: number, years: number[]): number | null {
  return focusYear ?? (years.includes(tryYear) ? tryYear : null);
}

function HomeDecision() {
  const { plan, stored, result, replacePlan, savePlanAs, focusYear, setFocusYear, chartRange, setChartRange } = usePlanner();
  const saved = useMemo(() => currentTerms(stored), [stored]);
  const hasHome = primaryHome(stored) !== undefined;
  const [t, setT] = useState<HomeTerms>(saved);
  useEffect(() => setT(saved), [saved]);
  const heroHeight = useHeroHeight();
  // The cushion chart reads a window around the purchase until the user picks a
  // range themselves (V5-REVIEW-2 N8); `chartRange` alone can't say "picked All".
  const [pickedRange, setPickedRange] = useState(false);
  const [cushionHover, setCushionHover] = useState<number | null>(null);
  const pickRange = (r: RangeKey) => {
    setPickedRange(true);
    setChartRange(r);
  };

  const start = stored.settings.startYear;
  const years = useMemo(() => candidateYears(start, planEndYear(stored)), [start, stored]);
  const show = (nominal: number, year: number) => toDisplay(stored, nominal, year);
  const agesFor = useMemo(() => agesLineFor(stored, result), [stored, result]);

  // The map follows financing terms (down payment, rate) but not the price or
  // year being tried — those move the dot, not the zones. Deferred so a
  // slider drag stays smooth while the curve catches up.
  const deferredTerms = useDeferredValue(t.terms);
  const curve = useMemo(
    () => affordabilityCurve(stored, years, DEFAULT_ZONES, { terms: deferredTerms }),
    [stored, years, deferredTerms],
  );
  const points: MapPoint[] = curve.map((p) => ({
    year: p.year,
    comfortable: show(p.byZone.comfortable, p.year),
    stretch: show(p.byZone.stretch, p.year),
  }));

  // The shared range windows the purchase years like any other time axis, but
  // always keeps the year being tried on screen: a chosen 2041 must not vanish
  // because the picker says 5Y.
  const win = rangeWindow(years, start, chartRange);
  const from = Math.min(win.from, t.year);
  const to = Math.max(win.to, t.year);
  const mapPoints = points.filter((p) => p.year >= from && p.year <= to);

  const draftPlan = useMemo(() => applyTerms(stored, t), [stored, t]);
  const draftNominal = useMemo(() => runPlan(draftPlan), [draftPlan]);
  const draftResult = useMemo(() => presentResult(draftPlan, draftNominal), [draftPlan, draftNominal]);
  const reading = useMemo(() => readHome(draftPlan, draftNominal), [draftPlan, draftNominal]);
  const zone: Zone | undefined = reading ? zoneOf(reading) : undefined;
  const isDraft = !hasHome || t.year !== saved.year || t.price !== saved.price || JSON.stringify(t.terms) !== JSON.stringify(saved.terms);

  const firstYear = t.year + 1;
  const current = useMemo(() => impactMetrics(stored, result, firstYear), [stored, result, firstYear]);
  const draft = useMemo(() => (isDraft ? impactMetrics(draftPlan, draftResult, firstYear) : null), [isDraft, draftPlan, draftResult, firstYear]);

  const atYear = curve.find((p) => p.year === t.year);
  const own = useMemo(() => ownCost(draftPlan, draftNominal), [draftPlan, draftNominal]);
  const cushion = useMemo(() => cashCushion(draftPlan, draftNominal), [draftPlan, draftNominal]);
  const draftHealth = useMemo(() => planHealth(draftResult, draftPlan), [draftResult, draftPlan]);
  const danger = useMemo(() => dangerBandFor(draftHealth, draftResult), [draftHealth, draftResult]);
  const draftAges = useMemo(() => agesLineFor(draftPlan, draftResult), [draftPlan, draftResult]);

  const setPrice = (shown: number) => setT((x) => ({ ...x, price: fromDisplay(stored, shown, x.year) }));
  // One price for the whole page (V5-REVIEW-2 N7): the lever, the curve readout and Timeline.
  const shownPrice = shownPriceOf(stored, t.price, t.year);
  const priceMax = Math.max(1_000_000, ...points.map((p) => p.stretch * 1.5), shownPrice * 1.25);

  // --- the price curve: this purchase year at a ladder of prices ----------
  // The ladder's reach follows the zones for the year, not the price in hand,
  // so clicking along the curve doesn't rebuild it under the pointer.
  const deferredYear = useDeferredValue(t.year);
  const stretchAtYear = atYear ? show(atYear.byZone.stretch, atYear.year) : 0;
  const curveMax = Math.round(Math.max(1_000_000, stretchAtYear * 1.6, hasHome ? show(saved.price, saved.year) * 1.4 : 0) / 100_000) * 100_000;
  const grid = useMemo(() => priceGrid(100_000, curveMax), [curveMax]);
  const curveData = useMemo<CurveDatum[]>(
    () =>
      pricePoints(stored, { year: deferredYear, price: 0, terms: deferredTerms }, grid.map((p) => fromDisplay(stored, p, deferredYear))).map((p, i) => ({
        price: grid[i],
        share: p.reading.housingShare,
        zone: p.zone,
        monthly: toDisplay(stored, p.reading.housingMonthly, deferredYear + 1),
        cashLeft: shownCashLeft(stored, p.reading, deferredYear),
        shortfallYear: p.firstShortYear,
      })),
    [stored, deferredYear, deferredTerms, grid],
  );
  const currentDatum: CurveDatum | undefined =
    reading && zone
      ? {
          price: shownPrice,
          share: reading.housingShare,
          zone,
          monthly: show(reading.housingMonthly, firstYear),
          cashLeft: shownCashLeft(stored, reading, t.year),
          // The whole-plan answer, the same number the rail pill shows for this price (F7).
          shortfallYear: draftHealth.firstShortYear,
        }
      : undefined;

  // --- the cushion --------------------------------------------------------
  // V5-REVIEW-2 N8: "Keep renting" compounds to ~$7M and used to set the y-axis,
  // flattening the buy line it is compared with. The chart now sees a window
  // (purchase year -2 .. +10 by default), its y-domain comes from the buy line
  // and the reserve only, and the rent line is clipped at the top with a chip
  // carrying its true value (the readout below also reads the true value).
  const cushionYears = cushion.years;
  const explicitRange = chartRange !== 'all' || pickedRange;
  const cushionWin = explicitRange
    ? rangeWindow(cushionYears, start, chartRange)
    : { from: Math.max(cushionYears[0] ?? t.year, t.year - 2), to: Math.min(cushionYears[cushionYears.length - 1] ?? t.year, t.year + 10) };
  const cIdx = cushionYears.flatMap((y, i) => (y >= cushionWin.from && y <= cushionWin.to ? [i] : []));
  const cYears = cIdx.map((i) => cushionYears[i]);
  const buyValues = cIdx.map((i) => show(cushion.withHome[i], cushionYears[i]));
  const rentValues = cIdx.map((i) => show(cushion.renting[i], cushionYears[i]));
  const reserveValues = cIdx.map((i) => show(recurringSpending(draftNominal.years[i]) / 2, cushionYears[i]));
  const cushionTop = Math.max(0, ...buyValues, ...reserveValues);
  const rentCap = cushionTop * 1.15;
  const rentDrawn = rentValues.map((v) => (rentCap > 0 ? Math.min(v, rentCap) : v));
  const lastRent = rentValues[rentValues.length - 1];
  const cushionNotes: ChartNote[] =
    rentCap > 0 && lastRent > rentCap ? [{ year: cYears[cYears.length - 1], value: rentCap, text: `↑ Keep renting ${money(lastRent)}` }] : [];
  const cushionPinned = pageYear(focusYear !== null && cYears.includes(focusYear) ? focusYear : null, t.year, cYears);
  const cushionYear = cushionHover !== null && cYears.includes(cushionHover) ? cushionHover : (cushionPinned ?? cYears[cYears.length - 1]);
  const cushionAt = cYears.indexOf(cushionYear);

  return (
    <>
      <section className="ns-dec-section">
        <AffordabilityMap
          points={mapPoints}
          selected={{ year: t.year, price: shownPrice }}
          saved={hasHome ? { year: saved.year, price: show(saved.price, saved.year) } : undefined}
          onPick={(year, price) => setT((x) => ({ ...x, year, price: fromDisplay(stored, price, year) }))}
          height={heroHeight}
          focusYear={focusYear}
          onFocusYear={setFocusYear}
          agesFor={agesFor}
          actions={<RangePicker value={chartRange} onChange={pickRange} years={years} openingYear={start} />}
        />
      </section>

      <section className="ns-dec-section">
        <div className="ns-dec-head">
          <h2 className="ns-dec-title">{hasHome ? 'Try a different home' : 'Try a home'}</h2>
        </div>
        <div className="ns-levers ns-dec-levers">
          <Lever label="Price" display={money(shownPrice)} value={shownPrice} min={100_000} max={Math.round(priceMax / 50_000) * 50_000} step={25_000} onChange={setPrice} />
          <Lever
            label="Buy in"
            display={String(t.year)}
            value={t.year}
            min={years[0] ?? start}
            max={years[years.length - 1] ?? start}
            step={1}
            onChange={(year) => setT((x) => ({ ...x, year, price: fromDisplay(stored, shownPrice, year) }))}
          />
          <Lever
            label="Down payment"
            display={`${t.terms.downPaymentPercent}% · ${money(shownPrice * (t.terms.downPaymentPercent / 100))}`}
            value={t.terms.downPaymentPercent}
            min={5}
            max={50}
            step={1}
            onChange={(v) => setT((x) => ({ ...x, terms: { ...x.terms, downPaymentPercent: v } }))}
          />
          <Lever
            label="Mortgage rate"
            display={`${t.terms.mortgageRate.toFixed(2)}%`}
            value={t.terms.mortgageRate}
            min={3}
            max={9}
            step={0.125}
            onChange={(v) => setT((x) => ({ ...x, terms: { ...x.terms, mortgageRate: v } }))}
          />
        </div>
        <ImpactStrip
          current={current}
          draft={draft}
          actions={
            isDraft ? (
              <PreviewActions
                onKeep={() => replacePlan(draftPlan, hasHome ? `Home moved to ${t.year} at ${money(shownPrice)}` : `Added a ${money(shownPrice)} home in ${t.year}`)}
                onSaveAs={() => savePlanAs(draftPlan, `${stored.name} — ${money(shownPrice)} home in ${t.year}`)}
                onReset={() => setT(saved)}
              />
            ) : undefined
          }
        />
      </section>

      {currentDatum && curveData.length > 1 && (
        <section className="ns-dec-section">
          <div className="ns-dec-head">
            <h2 className="ns-dec-title">What each price does</h2>
          </div>
          <PriceCurve
            data={curveData}
            current={currentDatum}
            saved={hasHome ? show(saved.price, saved.year) : undefined}
            onPick={setPrice}
            height={Math.max(240, heroHeight - 100)}
            year={t.year}
            endYear={planEndYear(stored)}
          />
        </section>
      )}

      {reading && (
        <div className="ns-dec-split">
          {own && (
            <HomeBudgetDonut
              plan={draftPlan}
              result={draftResult}
              beforeYear={t.year - 1}
              afterYear={firstYear}
              own={own}
              showOwn={(v) => show(v, firstYear)}
              showRent={(v) => show(v, t.year - 1)}
            />
          )}
          <HousePoorCheck reading={reading} cashLeft={shownCashLeft(stored, reading, t.year)} firstShortYear={draftHealth.firstShortYear} endYear={planEndYear(stored)} />
        </div>
      )}

      <section className="ns-dec-section">
        <div className="ns-dec-head">
          <h2 className="ns-dec-title">Your cash cushion</h2>
        </div>
        {cushionAt >= 0 && (
          <ChartReadout
            label="Cash and taxable investments"
            value={money(buyValues[cushionAt])}
            yearLabel={String(cushionYear)}
            ages={draftAges(cushionYear)}
            size="compact"
            secondary={[
              { id: 'rent', label: 'Keep renting', color: 'var(--muted)', value: money(rentValues[cushionAt]), dashed: true },
              { id: 'reserve', label: '6-month reserve', color: 'var(--warn)', value: money(reserveValues[cushionAt]), dashed: true },
            ]}
            short={!!danger && inDanger(danger, cushionYear)}
          />
        )}
        <TimeSeriesChart
          years={cYears}
          series={[
            { id: 'buy', label: `Buying in ${t.year}`, color: 'var(--data-nw)', values: buyValues, kind: 'area' },
            { id: 'rent', label: 'Keep renting', color: 'var(--muted)', values: rentDrawn, dashed: true },
            { id: 'reserve', label: '6-month reserve', color: 'var(--warn)', values: reserveValues, dashed: true, lineWidth: 1.5 },
          ]}
          todayYear={start}
          height={Math.max(220, heroHeight - 110)}
          focusYear={cushionPinned}
          onFocusYear={setFocusYear}
          onHoverYear={setCushionHover}
          danger={danger}
          onRequestRange={pickRange}
          markers={[{ year: t.year, label: 'Buy', tone: 'cost' }]}
          notes={cushionNotes}
          readout={false}
          ariaLabel="Cash and taxable investments, buying versus renting, with the six-month reserve"
        />
      </section>

      {hasHome && <HouseForecastView plan={plan} result={result} defaultYear={t.year} />}
    </>
  );
}

function Lever({
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(v: number): void;
}) {
  return (
    <label className="ns-lever">
      <span className="ns-lever-head">
        <span className="ns-lever-label">{label}</span>
        <span className="ns-lever-value ns-num">{display}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** The house-poor check: every rule, its threshold, and where this purchase lands. */
function HousePoorCheck({
  reading,
  cashLeft,
  firstShortYear,
  endYear,
}: {
  reading: NonNullable<ReturnType<typeof readHome>>;
  /** Cash left after closing, in the units the user reads; the same figure the price curve prints (V5-REVIEW-2 N7). */
  cashLeft: number;
  /** Whole-plan first short year (V5-REVIEW-1 F7), not the ten-year carry window. */
  firstShortYear?: number;
  endYear: number;
}) {
  const [comfortable, stretch] = DEFAULT_ZONES;
  const status = (okComfortable: boolean, okStretch: boolean): Zone => (okComfortable ? 'comfortable' : okStretch ? 'stretch' : 'housePoor');
  const rows: { label: string; value: string; rule: string; zone: Zone }[] = [
    {
      label: 'Housing ÷ after-tax income',
      value: Number.isFinite(reading.housingShare) ? percent(reading.housingShare, 0) : '—',
      rule: `≤ ${comfortable.maxHousingShare}% · ≤ ${stretch.maxHousingShare}%`,
      zone: status(reading.housingShare <= comfortable.maxHousingShare, reading.housingShare <= stretch.maxHousingShare),
    },
    {
      label: 'Savings rate after buying',
      value: Number.isFinite(reading.savingsRate) ? percent(reading.savingsRate, 0) : '—',
      rule: `≥ ${comfortable.minSavingsRate}% · ≥ ${stretch.minSavingsRate}%`,
      zone: status(reading.savingsRate >= comfortable.minSavingsRate, reading.savingsRate >= stretch.minSavingsRate),
    },
    {
      label: 'Cash left after closing',
      value: Number.isFinite(reading.reserveMonths) ? `${reading.reserveMonths.toFixed(1)} mo · ${money(cashLeft)}` : '—',
      rule: `≥ ${comfortable.minReserveMonths} mo · ≥ ${stretch.minReserveMonths} mo`,
      zone: status(reading.reserveMonths >= comfortable.minReserveMonths, reading.reserveMonths >= stretch.minReserveMonths),
    },
    {
      label: `Pays every bill through ${endYear}`,
      value: firstShortYear ? `Short from ${firstShortYear}` : 'Yes',
      rule: 'Required',
      zone: firstShortYear ? 'housePoor' : 'comfortable',
    },
  ];
  return (
    <div className="ns-dec-section">
      <div className="ns-dec-head">
        <h2 className="ns-dec-title">House-poor check</h2>
      </div>
      <div className="ns-hp">
        {rows.map((r) => (
          <div key={r.label} className="ns-hp-row">
            <span className={`ns-hp-mark ns-hp-mark-${r.zone}`} role="img" aria-label={ZONE_LABEL[r.zone]}>
              {r.zone === 'comfortable' ? '✓' : r.zone === 'stretch' ? '~' : '✗'}
            </span>
            <span className="ns-hp-label">{r.label}</span>
            <span className="ns-hp-value">{r.value}</span>
            <span className="ns-hp-rule">{r.rule}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
