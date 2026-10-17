import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Ellipsis } from 'lucide-react';
import { newAccountOfType } from '@northstar/engine';
import type { AccountClass, YearSnapshot } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import {
  DonutChart,
  RangePicker,
  TimeSeriesChart,
  rangeWindow,
  type ChartSeries,
  type DonutSegment,
  type RangeKey,
} from '../charts';
import { AnimatedFigure } from '../AnimatedFigure';
import { useBreakpoint } from '../useBreakpoint';
import { ACCOUNT_ICON } from '../domainIcons';
import { monarchHeaderStatus } from '../dashboard';
import { Levers, useLevers } from '../LeversPanel';
import { PlanCheckBanner } from '../PlanCheckBanner';
import { AccountsTab } from '../tabs/AccountsTab';
import { asOfDateLabel, money } from '../format';
import { classBalances } from '../ledger';
import { Page, accountClassColor } from '../ui';
import { DismissibleAlert } from '../ui/Alert';
import { Sheet } from '../ui/Sheet';
import {
  UNFUNDED_KEY,
  agesLabel,
  classBalanceAt,
  dangerBand,
  eventMarkers,
  groupMonthlySeries,
  presentClasses,
  spendingModel,
  type ClassRow,
  type SpendingModel,
} from './netWorthData';
import { PopMenu } from './PopMenu';
import './net-worth.css';

/**
 * Net Worth: the headline page (docs/REDESIGN-V5.md §5.1; R4, R7, R8, R16-R20).
 * It replaces both Overview and Accounts. The chart comes first and is the
 * only hero; below it, the year the chart is pointing at (a balance snapshot
 * on the left, that year's spending on the right), then every year's balances
 * in a table that scrolls sideways. Clicking a snapshot row, a slice or a
 * table row opens a sheet rather than navigating away.
 *
 * The "year in question" is dictated by the chart (R7): hover previews it,
 * a click pins it app-wide as `focusYear`, and with neither the chart's
 * window-end year shows, the same default its readout uses.
 */

type SeriesId = 'networth' | 'spendable' | AccountClass;

const SPENDABLE_ID = 'spendable';

const signedBalance = (value: number, liability: boolean) => (liability && value > 0 ? `−${money(value)}` : money(value));

export function NetWorthPage() {
  const {
    plan,
    stored,
    planId,
    result,
    health,
    focusYear,
    setFocusYear,
    chartRange,
    setChartRange,
    allAccounts,
    setAccountDraft,
    setAssumptionsDraft,
    editor,
    replacePlan,
    monarch,
    localMonarch,
    freshness,
    rollPlanForward,
    setImporting,
  } = usePlanner();
  const navigate = useNavigate();
  // 420px desktop, 280px phone (docs/REDESIGN-V5.md §1.1).
  const heroHeight = useBreakpoint() === 'phone' ? 280 : 420;

  const [seriesId, setSeriesId] = useState<SeriesId>('networth');
  const [hover, setHover] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const levers = useLevers(plan);

  const years = useMemo(() => result.years.map((y) => y.year), [result]);
  const classes = useMemo(() => presentClasses(allAccounts, result.years), [allAccounts, result.years]);
  const spending = useMemo(() => spendingModel(plan, result), [plan, result]);
  const markers = useMemo(() => eventMarkers(plan, years), [plan, years]);
  const danger = useMemo(() => dangerBand(health, result), [health, result]);
  const ghostYears = levers.ghostResult?.years;

  // --- hero series --------------------------------------------------------
  const classOf = (id: SeriesId) => classes.find((c) => c.accountClass === id);
  const seriesLabel =
    seriesId === 'networth' ? 'Net worth' : seriesId === SPENDABLE_ID ? 'Spendable' : (classOf(seriesId)?.label ?? 'Net worth');

  const spendableValues = health.spendable;
  const series = useMemo<ChartSeries[]>(() => {
    if (seriesId === 'networth') {
      return [
        { id: 'nw', label: 'Net worth', color: 'var(--data-nw)', kind: 'area', values: result.years.map((y) => y.netWorth) },
        { id: SPENDABLE_ID, label: 'Spendable', color: 'var(--data-nw)', dashed: true, lineWidth: 1.5, values: spendableValues },
      ];
    }
    if (seriesId === SPENDABLE_ID) {
      return [{ id: SPENDABLE_ID, label: 'Spendable', color: 'var(--data-nw)', kind: 'area', values: spendableValues }];
    }
    const row = classOf(seriesId);
    return [
      {
        id: seriesId,
        label: seriesLabel,
        color: accountClassColor(seriesId),
        kind: 'area',
        values: classBalances(result.years, seriesId, row?.liability ?? false),
      },
    ];
    // classOf reads `classes`; seriesLabel derives from the same inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesId, result, spendableValues, classes]);

  // The What-if preview, as one dashed line over whichever series is showing.
  // Spendable has no ghost: it needs the lever-adjusted plan's withdrawal
  // gates, and a second health pass for one dashed line isn't worth it.
  const ghost = useMemo<ChartSeries | undefined>(() => {
    if (!ghostYears || seriesId === SPENDABLE_ID) return undefined;
    const byYear = new Map(
      ghostYears.map((y) => [
        y.year,
        seriesId === 'networth' ? y.netWorth : classBalanceAt(y, seriesId, classOf(seriesId)?.liability ?? false),
      ]),
    );
    return { label: 'What if', color: 'var(--ink)', values: years.map((y) => byYear.get(y) ?? NaN) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostYears, seriesId, years, classes]);

  const agesFor = (year: number) => agesLabel(plan, result.years.find((y) => y.year === year));

  // --- the year everything below follows ----------------------------------
  const windowEnd = rangeWindow(years, result.startYear, chartRange).to;
  const activeYear = [hover, focusYear, windowEnd].find((y): y is number => y !== null && years.includes(y)) ?? windowEnd;
  const activeIdx = years.indexOf(activeYear);
  const snapshot = result.years[activeIdx];

  // --- opening the account sheet ------------------------------------------
  function openClass(accountClass: AccountClass) {
    const owned = stored.accounts.find((a) => a.accountClass === accountClass && !a.isSynthetic);
    const eventMade = allAccounts.find((a) => a.accountClass === accountClass && a.isSynthetic);
    setAccountDraft(structuredClone(owned ?? eventMade ?? newAccountOfType(accountClass)));
  }

  // --- header menus -------------------------------------------------------
  const seriesGroups = [
    {
      items: [
        { key: 'networth', label: 'Net worth', checked: seriesId === 'networth', onSelect: () => setSeriesId('networth') },
        { key: SPENDABLE_ID, label: 'Spendable', checked: seriesId === SPENDABLE_ID, onSelect: () => setSeriesId(SPENDABLE_ID) },
      ],
    },
    {
      label: 'By account',
      items: classes.map((c) => ({
        key: c.accountClass,
        label: c.label,
        checked: seriesId === c.accountClass,
        onSelect: () => setSeriesId(c.accountClass),
      })),
    },
  ];

  const monarchAction = monarchHeaderStatus(monarch.status).action;
  const moreGroups = [
    {
      items: [
        { key: 'assumptions', label: 'Edit assumptions', onSelect: () => setAssumptionsDraft(structuredClone(stored)) },
        { key: 'event', label: '+ Add event', onSelect: editor.startNew },
        ...(monarchAction
          ? [
              {
                key: 'monarch',
                label: monarchAction.label === 'Connect' ? 'Connect Monarch' : `${monarchAction.label} from Monarch`,
                onSelect: monarchAction.kind === 'connect' ? monarch.openConnect : () => void monarch.refresh(),
              },
            ]
          : []),
      ],
    },
  ];

  const localSnapshot = localMonarch.snapshot;

  return (
    <Page className="ns-nw">
      <h1 className="ns-nw-sr">Net worth</h1>

      {/* The info alerts Overview carried (docs/REDESIGN-V5.md §4.3, R2): a new
          local Monarch capture to review, and a plan whose clock has fallen
          behind the calendar. Dismissible per signature, so a newer capture
          or next January brings them back. */}
      {localMonarch.isNew && localSnapshot && (
        <DismissibleAlert
          planId={planId}
          id="monarch-snapshot"
          signature={localSnapshot.capturedAt}
          tone="info"
          action={{ label: 'Review', onClick: () => setImporting(true) }}
        >
          New Monarch snapshot · {asOfDateLabel(localSnapshot.capturedAt)} · {localSnapshot.accounts.length} accounts
        </DismissibleAlert>
      )}
      <PlanCheckBanner />
      {freshness.needsRollover && (
        <DismissibleAlert
          planId={planId}
          id="roll-forward"
          signature={String(new Date().getUTCFullYear())}
          tone="info"
          action={{ label: 'Roll forward', onClick: rollPlanForward }}
        >
          It's {new Date().getUTCFullYear()} — roll the plan forward?
        </DismissibleAlert>
      )}

      <section className="ns-nw-hero" aria-label="Net worth over time">
        <TimeSeriesChart
          years={years}
          series={series}
          ghost={ghost}
          range={chartRange}
          todayYear={result.startYear}
          height={heroHeight}
          focusYear={focusYear}
          onFocusYear={setFocusYear}
          onHoverYear={setHover}
          danger={danger}
          onRequestRange={setChartRange}
          markers={markers}
          drawKey={seriesId}
          readout={{
            label: (
              <PopMenu
                label="Chart series"
                className="ns-nw-series"
                groups={seriesGroups}
                trigger={() => (
                  <>
                    {seriesLabel}
                    <ChevronDown size={16} strokeWidth={2.25} aria-hidden />
                  </>
                )}
              />
            ),
            primaryId: seriesId === 'networth' ? 'nw' : seriesId,
            agesFor,
            actions: (
              <div className="ns-nw-actions">
                <RangePicker value={chartRange} onChange={setChartRange} years={years} openingYear={result.startYear} />
                <button
                  type="button"
                  className={`ns-btn${levers.isDirty ? ' ns-nw-whatif-on' : ''}`}
                  onClick={() => setWhatIfOpen(true)}
                >
                  What if
                </button>
                <PopMenu
                  label="More"
                  align="end"
                  className="ns-btn-ghost ns-nw-more"
                  groups={moreGroups}
                  trigger={() => <Ellipsis size={16} strokeWidth={2} aria-hidden />}
                />
              </div>
            ),
          }}
          ariaLabel={`${seriesLabel} over time`}
        />
      </section>

      <div className="ns-nw-split">
        <YearSnapshot
          year={activeYear}
          ages={agesFor(activeYear)}
          classes={classes}
          snapshot={snapshot}
          onOpen={openClass}
        />
        <SpendingDonut
          year={activeYear}
          model={spending}
          index={activeIdx}
          showUnfunded={health.status === 'short'}
          unfunded={snapshot?.unfundedShortfall ?? 0}
          onSelect={(key) => {
            if (key === UNFUNDED_KEY) {
              setFocusYear(activeYear);
              navigate('/cashflow');
            } else setCategory(key);
          }}
        />
      </div>

      <section className="ns-nw-table" aria-labelledby="ns-nw-balances">
        <h2 id="ns-nw-balances" className="ns-nw-h2">
          Balances over time
        </h2>
        <AccountsTab
          years={result.years}
          accounts={allAccounts}
          opening={result.opening}
          focusYear={focusYear}
          onFocusYear={setFocusYear}
          dangerYears={health.shortYears}
          onEditType={openClass}
        />
      </section>

      <CategorySheet
        categoryKey={category}
        onClose={() => setCategory(null)}
        model={spending}
        years={years}
        todayYear={result.startYear}
        year={activeYear}
        index={activeIdx}
        initialRange={chartRange}
        focusYear={focusYear}
        onFocusYear={setFocusYear}
        danger={danger}
        agesFor={agesFor}
      />

      <Sheet open={whatIfOpen} onClose={() => setWhatIfOpen(false)} title="What if">
        <Levers
          plan={plan}
          stored={stored}
          result={result}
          replacePlan={replacePlan}
          onDone={() => setWhatIfOpen(false)}
          {...levers}
        />
      </Sheet>
    </Page>
  );
}

/* --- the year snapshot (left) --------------------------------------------- */

function YearSnapshot({
  year,
  ages,
  classes,
  snapshot,
  onOpen,
}: {
  year: number;
  ages?: string;
  classes: ClassRow[];
  snapshot: YearSnapshot | undefined;
  onOpen(accountClass: AccountClass): void;
}) {
  const rows = classes.map((c) => ({ ...c, value: classBalanceAt(snapshot, c.accountClass, c.liability) }));
  const total = (liability: boolean) => rows.filter((r) => r.liability === liability).reduce((a, r) => a + r.value, 0);
  const assets = total(false);
  const liabilities = total(true);

  return (
    <section className="ns-nw-snap" aria-label={`Balances in ${year}`}>
      <div className="ns-nw-snap-year">{year}</div>
      <div className="ns-nw-snap-ages">{ages ?? ' '}</div>
      <ul className="ns-nw-snap-list">
        {rows.map((r) => {
          const Icon = ACCOUNT_ICON[r.accountClass];
          const share = (r.liability ? liabilities : assets) > 0 ? Math.abs(r.value) / (r.liability ? liabilities : assets) : 0;
          return (
            <li key={r.accountClass}>
              <button type="button" className="ns-nw-snap-row" onClick={() => onOpen(r.accountClass)}>
                <Icon size={15} strokeWidth={2} aria-hidden className="ns-nw-snap-icon" />
                <span className="ns-nw-snap-name">{r.label}</span>
                <AnimatedFigure
                  className={`ns-nw-snap-value ns-num${Math.abs(r.value) < 50 ? ' ns-nw-zero' : ''}`}
                  value={signedBalance(r.value, r.liability)}
                />
                <span className="ns-nw-snap-bar" aria-hidden="true">
                  <span
                    className={`ns-nw-snap-fill ${r.liability ? 'ns-nw-snap-fill-out' : ''}`}
                    style={{ width: `${Math.max(share > 0 ? 3 : 0, share * 100)}%`, ['--c' as string]: accountClassColor(r.accountClass) }}
                  />
                </span>
                <ChevronRight size={14} strokeWidth={2} aria-hidden className="ns-nw-snap-caret" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="ns-nw-snap-total">
        <span>Net worth</span>
        <AnimatedFigure className="ns-nw-snap-value ns-num" value={money(snapshot?.netWorth ?? 0)} />
      </div>
    </section>
  );
}

/* --- the spending donut (right) ------------------------------------------- */

function SpendingDonut({
  year,
  model,
  index,
  showUnfunded,
  unfunded,
  onSelect,
}: {
  year: number;
  model: SpendingModel;
  index: number;
  showUnfunded: boolean;
  unfunded: number;
  onSelect(key: string): void;
}) {
  const months = model.months[index] ?? 12;
  const perMonth = (v: number) => v / months;
  const groups = model.groups[index] ?? [];

  // One key set for every year, with 0 for a group that has nothing this
  // year: DonutChart morphs arcs by position (docs/REDESIGN-V5.md §3.5), so a
  // slice that came and went would shove its neighbours instead of fading.
  const segments: DonutSegment[] = model.meta.map((m) => ({
    key: m.key,
    label: m.label,
    color: m.color,
    value: perMonth(groups.find((g) => g.key === m.key)?.total ?? 0),
  }));
  if (showUnfunded) {
    segments.push({ key: UNFUNDED_KEY, label: 'Unfunded', color: 'var(--out)', tone: 'danger', value: perMonth(unfunded) });
  }
  const spent = segments.filter((s) => s.key !== UNFUNDED_KEY).reduce((a, s) => a + s.value, 0);
  const short = showUnfunded && unfunded > 0;

  return (
    <section className="ns-nw-spend" aria-label={`Spending in ${year}`}>
      <DonutChart
        segments={segments}
        center={
          short
            ? { value: `Short ${money(perMonth(unfunded))}`, label: `a month in ${year}`, tone: 'danger' }
            : { value: `${money(spent)}/mo`, label: `Spending in ${year}` }
        }
        format={(v) => `${money(v)}/mo`}
        onSelect={onSelect}
        size={228}
        thickness={26}
        legend="side"
        ariaLabel={`Spending in ${year}`}
      />
    </section>
  );
}

/* --- the category sheet --------------------------------------------------- */

function CategorySheet({
  categoryKey,
  onClose,
  model,
  years,
  todayYear,
  year,
  index,
  initialRange,
  focusYear,
  onFocusYear,
  danger,
  agesFor,
}: {
  categoryKey: string | null;
  onClose(): void;
  model: SpendingModel;
  years: number[];
  todayYear: number;
  year: number;
  index: number;
  initialRange: RangeKey;
  focusYear: number | null;
  onFocusYear(year: number | null): void;
  danger: ReturnType<typeof dangerBand>;
  agesFor(year: number): string | undefined;
}) {
  // Keep the last category while the exit plays, as the account sheet does.
  const last = useRef<string | null>(null);
  if (categoryKey) last.current = categoryKey;
  const key = last.current;
  const meta = model.meta.find((m) => m.key === key);

  return (
    <Sheet open={categoryKey !== null} onClose={onClose} title={meta?.label ?? 'Spending'}>
      {meta && key && (
        <CategoryBody
          key={key}
          meta={meta}
          model={model}
          years={years}
          todayYear={todayYear}
          year={year}
          index={index}
          initialRange={initialRange}
          focusYear={focusYear}
          onFocusYear={onFocusYear}
          danger={danger}
          agesFor={agesFor}
        />
      )}
    </Sheet>
  );
}

function CategoryBody({
  meta,
  model,
  years,
  todayYear,
  year,
  index,
  initialRange,
  focusYear,
  onFocusYear,
  danger,
  agesFor,
}: {
  meta: SpendingModel['meta'][number];
  model: SpendingModel;
  years: number[];
  todayYear: number;
  year: number;
  index: number;
  initialRange: RangeKey;
  focusYear: number | null;
  onFocusYear(year: number | null): void;
  danger: ReturnType<typeof dangerBand>;
  agesFor(year: number): string | undefined;
}) {
  const [range, setRange] = useState<RangeKey>(initialRange);
  const [hover, setHover] = useState<number | null>(null);
  const series = useMemo<ChartSeries[]>(
    () => [{ id: meta.key, label: meta.label, color: meta.color, kind: 'area', values: groupMonthlySeries(model, meta.key) }],
    [meta, model],
  );

  // The parts list follows the chart inside the sheet, then the page's year.
  const partsYear = hover ?? focusYear ?? year;
  const partsIdx = years.includes(partsYear) ? years.indexOf(partsYear) : index;
  const months = model.months[partsIdx] ?? 12;
  const group = model.groups[partsIdx]?.find((g) => g.key === meta.key);

  return (
    <div className="ns-nw-cat">
      <div className="ns-nw-insight-bar">
        <RangePicker value={range} onChange={setRange} years={years} openingYear={todayYear} />
      </div>
      <TimeSeriesChart
        years={years}
        series={series}
        range={range}
        todayYear={todayYear}
        height={240}
        focusYear={focusYear}
        onFocusYear={onFocusYear}
        onHoverYear={setHover}
        danger={danger}
        onRequestRange={setRange}
        readout={{
          label: `${meta.label} per month`,
          size: 'compact',
          format: (v) => `${money(v)}/mo`,
          agesFor,
        }}
        yFormat={(v) => money(v)}
        ariaLabel={`${meta.label} spending per month`}
      />

      <section aria-label={`${meta.label} in ${partsYear}`}>
        <h3 className="ns-nw-subtitle">In {partsYear}</h3>
        {group && group.parts.length > 0 ? (
          <ul className="ns-nw-parts">
            {group.parts.map((p) => (
              <li key={p.key}>
                <span>{p.label}</span>
                <span className="ns-num">{money(p.amount / months)}/mo</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ns-subtle">Nothing in {meta.label.toLowerCase()} that year.</p>
        )}
      </section>
    </div>
  );
}
