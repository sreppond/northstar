import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ChevronDown, Ellipsis } from 'lucide-react';
import { newAccountOfType } from '@northstar/engine';
import type { AccountClass } from '@northstar/engine';
import { usePlanner } from '../PlannerContext';
import { RangePicker, TimeSeriesChart, type ChartSeries, type DangerBand } from '../charts';
import { useBreakpoint } from '../useBreakpoint';
import { monarchHeaderStatus } from '../dashboard';
import { Levers, useLevers } from '../LeversPanel';
import { PlanCheckBanner } from '../PlanCheckBanner';
import { AccountsTab } from '../tabs/AccountsTab';
import { asOfDateLabel } from '../format';
import { classBalances } from '../ledger';
import { Page, accountClassColor } from '../ui';
import { DismissibleAlert } from '../ui/Alert';
import { Sheet } from '../ui/Sheet';
import { agesLabel, classBalanceAt, eventMarkers, monthlyDangerBand, presentClasses } from './netWorthData';
import { PopMenu } from './PopMenu';
import './net-worth.css';

/**
 * Net Worth: the headline page (docs/REDESIGN-V5.md §5.1; R4, R7, R8, R16-R20).
 * It replaces both Overview and Accounts. The chart is the only hero; below it
 * sits every year's balances in a table that scrolls sideways. Clicking a
 * table row opens the account sheet rather than navigating away.
 *
 * A click on the chart pins a year app-wide as `focusYear`, which the table
 * highlights.
 */

type SeriesId = 'networth' | 'spendable' | AccountClass;

const SPENDABLE_ID = 'spendable';

/** Below this width the What if and "…" buttons join the title row (V5-REVIEW-2 N22). */
const NARROW = '(max-width: 479px)';
function subscribeNarrow(notify: () => void) {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener('change', notify);
  return () => mq.removeEventListener('change', notify);
}
const useNarrow = () =>
  useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW).matches,
    () => false,
  );

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
  // 420px desktop, 280px phone (docs/REDESIGN-V5.md §1.1).
  const heroHeight = useBreakpoint() === 'phone' ? 280 : 420;

  const [seriesId, setSeriesId] = useState<SeriesId>('networth');
  const [whatIfOpen, setWhatIfOpen] = useState(false);
  const levers = useLevers(plan);

  const years = useMemo(() => result.years.map((y) => y.year), [result]);
  const classes = useMemo(() => presentClasses(allAccounts, result.years), [allAccounts, result.years]);
  const markers = useMemo(() => eventMarkers(plan, years), [plan, years]);
  // The hero's Short pill is per month, the readout says "/mo" (V5-REVIEW-1 F10).
  const danger = useMemo<DangerBand | undefined>(() => monthlyDangerBand(health, plan, result), [health, plan, result]);
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

  // --- opening the account sheet ------------------------------------------
  // Stable, as is `pinYear` below, so the balances table (React.memo) is not
  // re-rendered by every pointer move over the chart (V5-REVIEW-1 F28).
  const openClass = useCallback(
    (accountClass: AccountClass) => {
      const owned = stored.accounts.find((a) => a.accountClass === accountClass && !a.isSynthetic);
      const eventMade = allAccounts.find((a) => a.accountClass === accountClass && a.isSynthetic);
      setAccountDraft(structuredClone(owned ?? eventMade ?? newAccountOfType(accountClass)));
    },
    [stored.accounts, allAccounts, setAccountDraft],
  );
  const setFocusRef = useRef(setFocusYear);
  setFocusRef.current = setFocusYear;
  const pinYear = useCallback((year: number | null) => setFocusRef.current(year), []);

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

  // V5-REVIEW-2 N22: on a phone these two sit on the "Net worth ▾" title row,
  // right-aligned, so the range picker is the only thing on the row below. One
  // pair of elements, placed in either slot, never rendered twice.
  const narrow = useNarrow();
  const whatIfButton = (
    <button type="button" className={`ns-btn${levers.isDirty ? ' ns-nw-whatif-on' : ''}`} onClick={() => setWhatIfOpen(true)}>
      What if
    </button>
  );
  const moreMenu = (
    <PopMenu
      label="More"
      align="end"
      className="ns-btn-ghost ns-nw-more"
      groups={moreGroups}
      trigger={() => <Ellipsis size={16} strokeWidth={2} aria-hidden />}
    />
  );

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
          danger={danger}
          onRequestRange={setChartRange}
          markers={markers}
          drawKey={seriesId}
          readout={{
            label: (
              <div className="ns-nw-titlerow">
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
                {narrow && (
                  <div className="ns-nw-title-actions">
                    {whatIfButton}
                    {moreMenu}
                  </div>
                )}
              </div>
            ),
            primaryId: seriesId === 'networth' ? 'nw' : seriesId,
            shortUnit: '/mo',
            agesFor,
            actions: (
              <div className="ns-nw-actions">
                <RangePicker value={chartRange} onChange={setChartRange} years={years} openingYear={result.startYear} compact />
                {!narrow && whatIfButton}
                {!narrow && moreMenu}
              </div>
            ),
          }}
          ariaLabel={`${seriesLabel} over time`}
        />
      </section>

      <section className="ns-nw-table" aria-labelledby="ns-nw-balances">
        <h2 id="ns-nw-balances" className="ns-nw-h2">
          Balances over time
        </h2>
        <AccountsTab
          years={result.years}
          accounts={allAccounts}
          opening={result.opening}
          focusYear={focusYear}
          onFocusYear={pinYear}
          dangerYears={health.shortYears}
          onEditType={openClass}
        />
      </section>

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
