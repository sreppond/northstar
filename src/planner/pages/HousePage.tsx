import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { DEFAULT_ZONES, affordabilityCurve, planEndYear, primaryHome, readHome, runPlan } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { money, percent, planMetaLine } from '../format';
import { Page, PageHeader, SectionCard, StackedBar } from '../ui';
import { PlanCheckBanner } from '../PlanCheckBanner';
import { HouseForecastView } from '../views/HouseForecastView';
import { AffordabilityMap, type MapPoint } from '../views/AffordabilityMap';
import { ChartLegend, MiniChart } from '../views/MiniChart';
import { ImpactStrip, PreviewActions } from '../ImpactStrip';
import { impactMetrics, presentResult } from '../impact';
import { budgetView } from '../budgetView';
import { isHouseholdModel } from '../household';
import {
  ZONE_LABEL,
  applyTerms,
  cashCushion,
  currentTerms,
  fromDisplay,
  ownCost,
  priceLadder,
  toDisplay,
  nicePrice,
  zoneOf,
  type HomeTerms,
  type Zone,
} from '../homeView';
import './household.css';

/**
 * Home (docs/REDESIGN-V4.md §4.6): everything needed to decide when to buy,
 * how much to spend, and whether that price leaves the household house-poor
 * — on one page, against the whole plan.
 */
export function HousePage() {
  const { plan, result, stored } = usePlanner();
  const hasHome = primaryHome(stored) !== undefined;

  return (
    <Page>
      <PageHeader title="Home" meta={planMetaLine(stored, result.endYear)} />
      <PlanCheckBanner only={['rent-after-purchase']} />
      <HomeDecision />
      {hasHome && (
        <>
          <div className="ns-hh-divider">Owning it</div>
          <HouseForecastView plan={plan} result={result} />
        </>
      )}
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
  const { stored, result, replacePlan, savePlanAs } = usePlanner();
  const saved = useMemo(() => currentTerms(stored), [stored]);
  const hasHome = primaryHome(stored) !== undefined;
  const [t, setT] = useState<HomeTerms>(saved);
  useEffect(() => setT(saved), [saved]);

  const start = stored.settings.startYear;
  const years = useMemo(() => candidateYears(start, planEndYear(stored)), [start, stored]);
  const show = (nominal: number, year: number) => toDisplay(stored, nominal, year);

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
  const ladder = useMemo(
    () =>
      priceLadder(stored, t, [
        { key: 'comfortable', label: 'Comfortable max', price: atYear?.byZone.comfortable ?? 0 },
        { key: 'stretch', label: 'Stretch max', price: atYear?.byZone.stretch ?? 0 },
        { key: 'yours', label: hasHome && !isDraft ? 'Your plan' : 'Trying', price: t.price },
      ]).sort((a, b) => a.reading.price - b.reading.price),
    [stored, t, atYear, hasHome, isDraft],
  );

  const own = useMemo(() => ownCost(draftPlan, draftNominal), [draftPlan, draftNominal]);
  const cushion = useMemo(() => cashCushion(draftPlan, draftNominal), [draftPlan, draftNominal]);

  const firstComfortable = curve.find((p) => p.byZone.comfortable > 0);
  const later = firstComfortable ? curve.find((p) => p.year === firstComfortable.year + 5) : undefined;

  const setPrice = (shown: number) => setT((x) => ({ ...x, price: fromDisplay(stored, shown, x.year) }));
  const shownPrice = show(t.price, t.year);
  const priceMax = Math.max(1_000_000, ...points.map((p) => p.stretch * 1.5), shownPrice * 1.25);

  return (
    <>
      <p className="ns-hh-answer">
        {firstComfortable ? (
          <>
            The soonest you could comfortably buy is <strong>{firstComfortable.year}</strong>, up to{' '}
            <strong>{money(nicePrice(show(firstComfortable.byZone.comfortable, firstComfortable.year)))}</strong>
            {later ? (
              <>
                ; by {later.year}, up to {money(nicePrice(show(later.byZone.comfortable, later.year)))}
              </>
            ) : null}
            .{' '}
          </>
        ) : (
          <>Nothing in the next {years.length} years fits comfortably yet. </>
        )}
        {reading && zone && (
          <>
            {money(nicePrice(shownPrice))} in {t.year} is <strong className={`ns-zone-text ns-zone-text-${zone}`}>{ZONE_LABEL[zone].toLowerCase()}</strong>
            {Number.isFinite(reading.housingShare) ? ` — housing would take ${percent(reading.housingShare, 0)} of after-tax income` : ''}
            {reading.shortfallYear ? `, and the plan can't pay its bills in ${reading.shortfallYear}` : ''}.
          </>
        )}
      </p>

      <SectionCard title="When, and how much" meta="Each year: the price the whole plan can carry" divider={false}>
        <AffordabilityMap
          points={points}
          selected={{ year: t.year, price: shownPrice }}
          saved={hasHome ? { year: saved.year, price: show(saved.price, saved.year) } : undefined}
          onPick={(year, price) => setT((x) => ({ ...x, year, price: fromDisplay(stored, price, year) }))}
        />
      </SectionCard>

      <div className="ns-hh-split">
        <SectionCard title={hasHome ? 'Try a different home' : 'Try a home'} meta="Nothing changes until you keep it" divider={false}>
          <div className="ns-levers">
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
          {!hasHome && <p className="ns-hh-note">Compared with renting. Keep adds this purchase to the plan.</p>}
        </SectionCard>

        {reading && <HousePoorCheck reading={reading} show={(v) => show(v, firstYear)} />}
      </div>

      {own && (
        <SectionCard title="What owning costs each month" meta={`${firstYear}, the first full year`} divider={false}>
          <OwnVsRent own={own} show={(v) => show(v, firstYear)} showRent={(v) => show(v, t.year - 1)} beforeYear={t.year - 1} />
        </SectionCard>
      )}

      {isHouseholdModel(stored) && (
        <SectionCard title="Your budget, before and after" meta={`${t.year - 1} vs ${firstYear}`} divider={false}>
          <BeforeAfter plan={draftPlan} result={draftResult} before={t.year - 1} after={firstYear} />
        </SectionCard>
      )}

      <SectionCard title="Price ladder" meta={`Buying in ${t.year}, each row the whole plan`} flush>
        <div className="ns-table-scroll">
          <table className="ns-ladder">
            <thead>
              <tr>
                <th>Price</th>
                <th>Cash at closing</th>
                <th>Owning /mo</th>
                <th>Housing share</th>
                <th>Savings rate</th>
                <th>Net worth at 60</th>
                <th>Money lasts</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((r) => (
                <tr key={r.key} className={r.key === 'yours' ? 'ns-ladder-yours' : undefined}>
                  <td>
                    <span className={`ns-zone-chip ns-zone-chip-${r.zone}`}>{ZONE_LABEL[r.zone]}</span>
                    <span className="ns-num">{money(nicePrice(show(r.reading.price, t.year)))}</span>
                    <span className="ns-ladder-sub">{r.label}</span>
                  </td>
                  <td className="ns-num">{money(show(r.reading.cashAtClosing, t.year))}</td>
                  <td className="ns-num">{money(show(r.reading.housingMonthly, firstYear))}</td>
                  <td className="ns-num">{percent(r.reading.housingShare, 0)}</td>
                  <td className="ns-num">{Number.isFinite(r.reading.savingsRate) ? percent(r.reading.savingsRate, 0) : '—'}</td>
                  <td className="ns-num">{r.impact.netWorthAt60 ? money(r.impact.netWorthAt60.value) : '—'}</td>
                  <td className="ns-num">{r.impact.runsDryYear ? `Until ${r.impact.runsDryYear}` : 'Through the plan'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Your cash cushion" meta="Cash and taxable investments, buying vs renting" divider={false}>
        <MiniChart
          years={cushion.years}
          height={220}
          series={[
            { label: `Buying in ${t.year}`, color: 'var(--data-nw)', values: cushion.withHome.map((v, i) => show(v, cushion.years[i])), fill: true },
            { label: 'Keep renting', color: 'var(--muted)', values: cushion.renting.map((v, i) => show(v, cushion.years[i])), dashed: true },
          ]}
          markYear={t.year}
        />
        <ChartLegend
          series={[
            { label: `Buying in ${t.year}`, color: 'var(--data-nw)' },
            { label: 'Keep renting', color: 'var(--muted)' },
          ]}
        />
      </SectionCard>
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
    <SectionCard title="House-poor check" meta="Comfortable · stretch thresholds" divider={false}>
      <div className="ns-score">
        {rows.map((r) => (
          <div key={r.label} className="ns-score-row">
            <span className={`ns-score-mark ns-zone-mark-${r.zone}`} aria-label={ZONE_LABEL[r.zone]}>
              {r.zone === 'comfortable' ? '✓' : r.zone === 'stretch' ? '~' : '✗'}
            </span>
            <span className="ns-score-label">{r.label}</span>
            <span className="ns-score-value ns-num">{r.value}</span>
            <span className="ns-score-rule ns-num">{r.rule}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function OwnVsRent({
  own,
  show,
  showRent,
  beforeYear,
}: {
  own: NonNullable<ReturnType<typeof ownCost>>;
  show(nominal: number): number;
  /** Rent is the year before the purchase — its own year's dollars. */
  showRent(nominal: number): number;
  beforeYear: number;
}) {
  const rent = showRent(own.rentBefore);
  const total = show(own.total);
  const max = Math.max(total, rent, 1);
  const colors = ['var(--mix-1)', 'var(--mix-3)', 'var(--mix-6)', 'var(--mix-4)', 'var(--mix-5)'];
  return (
    <div className="ns-ownrent">
      {own.rentBefore > 0 && (
        <div className="ns-ownrent-row">
          <span className="ns-ownrent-label">Rent in {beforeYear}</span>
          <div className="ns-ownrent-track">
            <span className="ns-ownrent-seg" style={{ width: `${(rent / max) * 100}%`, background: 'var(--muted-light)' }} />
          </div>
          <span className="ns-ownrent-total ns-num">{money(rent)}</span>
        </div>
      )}
      <div className="ns-ownrent-row">
        <span className="ns-ownrent-label">Owning</span>
        <div className="ns-ownrent-track">
          {own.parts.map((p, i) => (
            <span key={p.label} className="ns-ownrent-seg" style={{ width: `${(show(p.monthly) / max) * 100}%`, background: colors[i % colors.length] }} title={`${p.label}: ${money(show(p.monthly))}`} />
          ))}
        </div>
        <span className="ns-ownrent-total ns-num">{money(total)}</span>
      </div>
      <div className="ns-ui-stackedbar-legend">
        {own.parts.map((p, i) => (
          <div key={p.label} className="ns-ui-stackedbar-legend-item">
            <span className="ns-ui-stackedbar-dot" style={{ background: colors[i % colors.length] }} aria-hidden />
            <span className="ns-ui-stackedbar-legend-label">{p.label}</span>
            <span className="ns-ui-stackedbar-legend-value ns-num">{money(show(p.monthly))}</span>
          </div>
        ))}
        {own.rentBefore > 0 && (
          <div className="ns-ui-stackedbar-legend-item">
            <span className="ns-ui-stackedbar-legend-label">Change from rent</span>
            <span className="ns-ui-stackedbar-legend-value ns-num">
              {total >= rent ? '+' : '−'}
              {money(Math.abs(total - rent))}/mo
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function BeforeAfter({ plan, result, before, after }: { plan: Parameters<typeof budgetView>[0]; result: ReturnType<typeof presentResult>; before: number; after: number }) {
  const rows = [before, after]
    .map((year) => ({ year, snap: result.years.find((y) => y.year === year) }))
    .filter((r): r is { year: number; snap: NonNullable<typeof r.snap> } => r.snap !== undefined)
    .map((r) => ({ year: r.year, view: budgetView(plan, r.snap) }));
  return (
    <div className="ns-beforeafter">
      {rows.map(({ year, view }) => (
        <div key={year}>
          <div className="ns-beforeafter-head">
            <span>{year === before ? `Before · ${year}` : `After · ${year}`}</span>
            <span className="ns-num">{view.savingsRate !== undefined ? `${percent(view.savingsRate, 0)} saved` : ''}</span>
          </div>
          <StackedBar segments={view.buckets.map((b) => ({ key: b.key, label: b.label, value: b.monthly, color: b.color }))} format={(v) => `${money(v)}/mo`} />
        </div>
      ))}
    </div>
  );
}
