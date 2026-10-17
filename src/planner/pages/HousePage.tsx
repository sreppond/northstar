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
import { RangePicker, TimeSeriesChart, rangeWindow } from '../charts';
import { ImpactStrip, PreviewActions } from '../ImpactStrip';
import { impactMetrics, presentResult } from '../impact';
import { planHealth } from '../health';
import { agesLineFor, dangerBandFor, useHeroHeight } from '../decisionKit';
import { priceGrid, pricePoints } from '../priceCurve';
import {
  ZONE_LABEL,
  applyTerms,
  cashCushion,
  currentTerms,
  fromDisplay,
  ownCost,
  toDisplay,
  nicePrice,
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
  const { plan, result, stored } = usePlanner();
  const hasHome = primaryHome(stored) !== undefined;

  return (
    <Page>
      <PageHeader title="Home" />
      <PlanCheckBanner only={['rent-after-purchase']} />
      <HomeDecision />
      {hasHome && <HouseForecastView plan={plan} result={result} />}
    </Page>
  );
}

/** Years worth looking at: next year through 20 years out, never past the plan. */
function candidateYears(start: number, end: number): number[] {
  const out: number[] = [];
  for (let y = start + 1; y <= Math.min(end - 1, start + 20); y++) out.push(y);
  return out;
}

function HomeDecision() {
  const { stored, result, replacePlan, savePlanAs, focusYear, setFocusYear, chartRange, setChartRange } = usePlanner();
  const saved = useMemo(() => currentTerms(stored), [stored]);
  const hasHome = primaryHome(stored) !== undefined;
  const [t, setT] = useState<HomeTerms>(saved);
  useEffect(() => setT(saved), [saved]);
  const heroHeight = useHeroHeight();

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
  const shownPrice = show(t.price, t.year);
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
        cashLeft: toDisplay(stored, p.reading.liquidAfterClosing, deferredYear),
        shortfallYear: p.reading.shortfallYear,
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
          cashLeft: show(reading.liquidAfterClosing, t.year),
          shortfallYear: reading.shortfallYear,
        }
      : undefined;

  // --- the cushion --------------------------------------------------------
  const cushionYears = cushion.years;
  const reserve = draftNominal.years.map((y) => show(recurringSpending(y) / 2, y.year));

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
          actions={<RangePicker value={chartRange} onChange={setChartRange} years={years} openingYear={start} />}
        />
      </section>

      <section className="ns-dec-section">
        <div className="ns-dec-head">
          <h2 className="ns-dec-title">{hasHome ? 'Try a different home' : 'Try a home'}</h2>
        </div>
        <div className="ns-levers ns-dec-levers">
          <Lever label="Price" display={money(nicePrice(shownPrice))} value={shownPrice} min={100_000} max={Math.round(priceMax / 50_000) * 50_000} step={25_000} onChange={setPrice} />
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
          <HousePoorCheck reading={reading} show={(v) => show(v, firstYear)} />
        </div>
      )}

      <section className="ns-dec-section">
        <div className="ns-dec-head">
          <h2 className="ns-dec-title">Your cash cushion</h2>
        </div>
        <TimeSeriesChart
          years={cushionYears}
          series={[
            { id: 'buy', label: `Buying in ${t.year}`, color: 'var(--data-nw)', values: cushion.withHome.map((v, i) => show(v, cushionYears[i])), kind: 'area' },
            { id: 'rent', label: 'Keep renting', color: 'var(--muted)', values: cushion.renting.map((v, i) => show(v, cushionYears[i])), dashed: true },
            { id: 'reserve', label: '6-month reserve', color: 'var(--warn)', values: reserve, dashed: true, lineWidth: 1.5 },
          ]}
          range={chartRange}
          todayYear={start}
          height={Math.max(220, heroHeight - 110)}
          focusYear={focusYear}
          onFocusYear={setFocusYear}
          danger={danger}
          onRequestRange={setChartRange}
          markers={[{ year: t.year, label: 'Buy', tone: 'cost' }]}
          readout={{ label: 'Cash and taxable investments', primaryId: 'buy', size: 'compact', agesFor: draftAges }}
          ariaLabel="Cash and taxable investments, buying versus renting, with the six-month reserve"
        />
      </section>
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
function HousePoorCheck({ reading, show }: { reading: NonNullable<ReturnType<typeof readHome>>; show(nominal: number): number }) {
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
      value: Number.isFinite(reading.reserveMonths) ? `${reading.reserveMonths.toFixed(1)} mo · ${money(show(reading.liquidAfterClosing))}` : '—',
      rule: `≥ ${comfortable.minReserveMonths} mo · ≥ ${stretch.minReserveMonths} mo`,
      zone: status(reading.reserveMonths >= comfortable.minReserveMonths, reading.reserveMonths >= stretch.minReserveMonths),
    },
    {
      label: 'Pays every bill for 10 years',
      value: reading.shortfallYear ? `Short in ${reading.shortfallYear}` : 'Yes',
      rule: 'Required',
      zone: reading.shortfallYear ? 'housePoor' : 'comfortable',
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
