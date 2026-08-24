import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_RETURN_SHIFT,
  deflate,
  headlineReturnRate,
  pathMarkers,
  runPlan,
  withReturnShift,
} from '@northstar/engine';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './planner/planner.css';

import type { AccountClass, Account, Plan } from '@northstar/engine';
import { newAccountOfType } from '@northstar/engine';
import { usePlanStore } from './planner/store/planStore';
import { HoverCard } from './planner/HoverCard';
import { planDetail } from './planner/detail';
import { AnimatedFigure } from './planner/AnimatedFigure';
import { CompareDiff } from './planner/CompareDiff';
import { AccountDrawer } from './planner/drawer/AccountDrawer';
import { AssumptionsDrawer } from './planner/drawer/AssumptionsDrawer';
import { ImportDrawer } from './planner/drawer/ImportDrawer';
import { ConnectDrawer } from './planner/drawer/ConnectDrawer';
import { DataBanner } from './planner/DataBanner';
import { useMonarch } from './planner/useMonarch';
import { EventDrawer } from './planner/drawer/EventDrawer';
import { useEventEditor, withDraft } from './planner/drawer/useEventEditor';
import {
  NetWorthChart,
  type ChartSelection,
  type CompareSeries,
  type FanSeries,
} from './planner/NetWorthChart';
import { AccountsTab } from './planner/tabs/AccountsTab';
import { CashFlowTab } from './planner/tabs/CashFlowTab';
import { EventsTab } from './planner/tabs/EventsTab';
import { cagr, money, percent } from './planner/format';
import { heroReading } from './planner/reading';
import { ThemeToggle } from './planner/ThemeToggle';
import { HeaderMenu } from './planner/HeaderMenu';
import { useBreakpoint, yearColumnsFor } from './planner/useBreakpoint';
import { Sidebar } from './planner/Sidebar';
import { ViewTabs, type ViewId } from './planner/ViewTabs';
import { RetirementForecastView } from './planner/views/RetirementForecastView';
import { HouseForecastView } from './planner/views/HouseForecastView';
import { SeppForecastView } from './planner/views/SeppForecastView';

type TabId = 'accounts' | 'cashflow' | 'events';

const TABS: { id: TabId; name: string }[] = [
  { id: 'accounts', name: 'Accounts' },
  { id: 'cashflow', name: 'Cash Flow' },
  { id: 'events', name: 'Events' },
];

export default function App() {
  const [tab, setTab] = useState<TabId>('accounts');
  const [view, setView] = useState<ViewId>('netWorth');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // The window pages rather than the type shrinking, and how many years fit
  // depends on the viewport.
  const columns = yearColumnsFor(useBreakpoint());
  const [winStart, setWinStart] = useState(0);
  const [selected, setSelected] = useState<ChartSelection | null>(null);
  const [showFan, setShowFan] = useState(false);

  const plans = usePlanStore((s) => s.plans);
  const planId = usePlanStore((s) => s.activeId);
  const setActive = usePlanStore((s) => s.setActive);
  const upsertEvent = usePlanStore((s) => s.upsertEvent);
  const deleteEvent = usePlanStore((s) => s.deleteEvent);
  const undo = usePlanStore((s) => s.undo);
  const redo = usePlanStore((s) => s.redo);
  const canUndo = usePlanStore((s) => s.past.length > 0);
  const canRedo = usePlanStore((s) => s.future.length > 0);

  const upsertAccount = usePlanStore((s) => s.upsertAccount);
  const replacePlan = usePlanStore((s) => s.replacePlan);
  const updateSettings = usePlanStore((s) => s.updateSettings);
  const createPlan = usePlanStore((s) => s.createPlan);
  const duplicatePlan = usePlanStore((s) => s.duplicatePlan);
  const renamePlan = usePlanStore((s) => s.renamePlan);
  const deletePlan = usePlanStore((s) => s.deletePlan);
  const editor = useEventEditor();
  const [accountDraft, setAccountDraft] = useState<Account | null>(null);
  const [assumptionsDraft, setAssumptionsDraft] = useState<Plan | null>(null);
  const [importing, setImporting] = useState(false);
  const monarch = useMonarch();

  const stored = useMemo(() => plans.find((p) => p.id === planId) ?? plans[0], [plans, planId]);

  // ⌘Z / ⇧⌘Z, but never while a field has focus — the browser's own undo
  // inside a text input is what someone means there.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // Both drawers preview live: whichever draft is open stands in for the
  // stored plan in the projection, without ever being written to the store.
  // That is what makes Cancel free.
  const plan = useMemo(
    () => withDraft(assumptionsDraft ?? stored, editor.draft),
    [assumptionsDraft, stored, editor.draft],
  );

  // The plan is the only source of truth; the result is always derived, never
  // stored. Storing it is how the chart and the table end up disagreeing.
  const nominal = useMemo(() => runPlan(plan), [plan]);

  // The engine always runs nominal; today's dollars is a presentation choice.
  const result = useMemo(
    () =>
      plan.settings.dollarMode === 'todaysDollars'
        ? deflate(nominal, plan.settings.inflationRate)
        : nominal,
    [nominal, plan.settings.dollarMode, plan.settings.inflationRate],
  );

  const comparePlan = useMemo(
    () =>
      plan.settings.compareToPlanId
        ? plans.find((p) => p.id === plan.settings.compareToPlanId)
        : undefined,
    [plans, plan.settings.compareToPlanId],
  );

  // A whole extra projection costs microseconds, so comparison is just a
  // second runPlan rather than anything clever.
  const compare: CompareSeries | undefined = useMemo(() => {
    if (!comparePlan) return undefined;
    const raw = runPlan(comparePlan);
    return {
      name: comparePlan.name,
      result:
        plan.settings.dollarMode === 'todaysDollars'
          ? deflate(raw, plan.settings.inflationRate)
          : raw,
    };
  }, [comparePlan, plan.settings.dollarMode, plan.settings.inflationRate]);

  // Return sensitivity: the same plan under a better and a worse market. Two
  // more runPlan calls, which cost microseconds — the honest way to show that
  // the single least reliable input drives most of the spread.
  //
  // Computed ALWAYS, not only when the chart's Range toggle is on, because the
  // hero's risk line quotes it on every render. The toggle now controls
  // whether the band is drawn, not whether the spread is known.
  const spread: FanSeries | undefined = useMemo(() => {
    if (headlineReturnRate(plan) === undefined) return undefined;

    const run = (delta: number) => {
      const raw = runPlan(withReturnShift(plan, delta));
      return plan.settings.dollarMode === 'todaysDollars'
        ? deflate(raw, plan.settings.inflationRate)
        : raw;
    };
    return {
      shift: DEFAULT_RETURN_SHIFT,
      low: run(-DEFAULT_RETURN_SHIFT),
      high: run(DEFAULT_RETURN_SHIFT),
    };
  }, [plan]);

  const fan = showFan ? spread : undefined;
  // Shared by the chart's own "Range" pill and the hero's tappable risk
  // phrase — two doors onto the same one bit of state (docs/REDESIGN.md
  // §4.1). The chart's own toggle stays the only door on a failing plan,
  // where the risk phrase is suppressed.
  const toggleFan = () => setShowFan((on) => !on);

  // The moments worth pointing at on the line — chiefly the years the plan
  // runs dry, which until now only appeared in a table if you scrolled to them.
  const markers = useMemo(() => pathMarkers(result), [result]);

  // User accounts plus the synthetic ones events create, which the balance
  // sheet rolls into their class row.
  const allAccounts: Account[] = useMemo(() => {
    const synthetic = new Map<string, Account>();
    for (const row of result.years.flatMap((y) => y.accounts)) {
      if (synthetic.has(row.accountId)) continue;
      if (plan.accounts.some((a) => a.id === row.accountId)) continue;
      synthetic.set(row.accountId, {
        ...newAccountOfType(row.accountClass),
        id: row.accountId,
        name: row.name,
        accountClass: row.accountClass,
        isLiability: row.isLiability,
        isSynthetic: true,
        initialBalance: row.open || row.close,
      });
    }
    return [...plan.accounts, ...synthetic.values()];
  }, [plan.accounts, result.years]);

  const first = result.years[0];
  const last = result.years[result.years.length - 1];
  const growth = cagr(first?.netWorth ?? 0, last?.netWorth ?? 0, result.years.length - 1);

  const reading = useMemo(
    () => heroReading(plan, result, markers, growth),
    [plan, result, markers, growth],
  );

  // The spread the headline figure depends on, at the horizon. Only worth
  // saying when it is genuinely a range — on a plan with no market exposure
  // the two runs land on the same number and the line would be noise.
  const spreadAtEnd = useMemo(() => {
    if (!spread) return undefined;
    const at = (r: typeof spread.low) =>
      r.years.find((y) => y.year === result.endYear)?.netWorth ??
      r.years[r.years.length - 1]?.netWorth;
    const low = at(spread.low);
    const high = at(spread.high);
    if (low === undefined || high === undefined) return undefined;
    if (high - low < Math.max(1000, Math.abs(reading.figure) * 0.02)) return undefined;
    return { low, high };
  }, [spread, result.endYear, reading.figure]);

  const maxStart = Math.max(0, result.years.length - columns);
  const clampedStart = Math.min(winStart, maxStart);
  const windowYears = result.years.slice(clampedStart, clampedStart + columns);
  const windowLabel =
    windowYears.length > 0
      ? `${windowYears[0].year}–${windowYears[windowYears.length - 1].year}`
      : '';

  return (
    <div className="ns">
      <header className="ns-head">
        <div className="ns-head-row">
          <div className="ns-wordmark">Northstar</div>
          <ViewTabs view={view} onSelect={setView} />
          <div className="ns-head-actions">
            {/* Visual stub only — Phase 5 wires the real palette
                (docs/EXECUTION.md Phase 2). */}
            <button type="button" className="ns-cmdk-stub" title="Command palette (coming soon)">
              <kbd>⌘K</kbd>
            </button>
            <ThemeToggle />
            <HeaderMenu
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
              onImport={() => setImporting(true)}
              onSignOut={() => void monarch.signOut()}
            />
          </div>
        </div>
        <button
          type="button"
          className="ns-scenario-title"
          onClick={() => setSidebarOpen(true)}
          title="Switch or manage plans"
        >
          {stored.name}
        </button>
      </header>

      <main className="ns-main">
        {view === 'retirement' && <RetirementForecastView plan={plan} result={result} />}
        {view === 'house' && <HouseForecastView plan={plan} result={result} />}
        {view === 'sepp' && <SeppForecastView plan={plan} result={result} />}

        {view === 'netWorth' && (
          <>
        <section className="ns-card">
          <div className="ns-hero-actions">
            <HoverCard detail={planDetail(plan, result.endYear)} side="bottom">
              <button
                type="button"
                className="ns-btn"
                onClick={() => setAssumptionsDraft(structuredClone(stored))}
              >
                Edit assumptions
              </button>
            </HoverCard>
            <button type="button" className="ns-btn ns-btn-primary" onClick={editor.startNew}>
              + Add event
            </button>
          </div>

          <DataBanner
            status={monarch.status}
            busy={monarch.busy}
            onConnect={monarch.openConnect}
            onRefresh={() => void monarch.refresh()}
          />

          <div className="ns-hero">
            <AnimatedFigure className="ns-hero-figure" value={money(reading.figure)} />
            <p className="ns-hero-read">{reading.read}</p>

            {/* Suppressed on a failing plan: a range around a number that
                never arrives is not the thing to be reading. Demoted from a
                permanent second sentence to a single tappable phrase that
                toggles the same fan band the chart's own "Range" pill drives
                (docs/REDESIGN.md §4.1) — one bit of state, two doors onto it. */}
            {spreadAtEnd && !reading.isAlarm && (
              <button
                type="button"
                className="ns-hero-risk"
                aria-pressed={showFan}
                onClick={toggleFan}
              >
                Between <b>{money(spreadAtEnd.low)}</b> and <b>{money(spreadAtEnd.high)}</b>{' '}
                depending on how markets run.
              </button>
            )}
          </div>
        </section>

        {/* The chart as the spine (docs/REDESIGN.md §4.1): full-bleed and
            unboxed rather than nested in a card, so it reads as the
            instrument the page is built around rather than one card among
            several. */}
        <section className="ns-spine">
          <NetWorthChart
            result={result}
            plan={plan}
            rateLabel={percent(headlineReturnRate(plan) ?? 0)}
            selected={selected}
            compare={compare}
            fan={fan}
            markers={markers}
            canFan={headlineReturnRate(plan) !== undefined}
            onToggleFan={toggleFan}
            onSelect={setSelected}
          />

          <div className="ns-selection">
            {selected ? (
              <>
                <span className={`ns-ref${selected.tone === 'cost' ? ' ns-ref-cost' : ''}`}>
                  {selected.code}
                </span>
                <span className="ns-selection-label">{selected.label}</span>
                <span className="ns-subtle ns-num">
                  {selected.year}
                  {selected.detail ? ` · ${selected.detail}` : ''}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    className="ns-btn-ghost"
                    onClick={() => {
                      const event = stored.events.find((e) => e.id === selected.eventId);
                      if (event) editor.edit(event);
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="ns-btn-ghost" onClick={() => setSelected(null)}>
                    Clear
                  </button>
                </div>
              </>
            ) : (
              <span className="ns-hint">
                Hover the chart for any year, or tap an event marker to see its details.
              </span>
            )}
          </div>

          {result.warnings.length > 0 && (
            <div className="ns-warning">
              <strong>{result.warnings.length} warning{result.warnings.length > 1 ? 's' : ''}:</strong>
              <span>{result.warnings[0]}</span>
            </div>
          )}
        </section>

        <section className="ns-card">
          <div className="ns-tabbar">
            <div className="ns-segmented" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  className="ns-tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <div className="ns-compare">
              <label className="ns-compare-label" htmlFor="ns-compare-select">
                Compare
              </label>
              <select
                id="ns-compare-select"
                className="ns-select"
                value={stored.settings.compareToPlanId ?? ''}
                onChange={(e) =>
                  updateSettings(stored.id, { compareToPlanId: e.target.value || undefined })
                }
              >
                <option value="">None</option>
                {plans
                  .filter((p) => p.id !== stored.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>

            {tab !== 'events' && (
              <div className="ns-window">
                <span className="ns-window-label">{windowLabel}</span>
                <button
                  type="button"
                  className="ns-btn ns-btn-square"
                  aria-label="Earlier years"
                  disabled={clampedStart === 0}
                  onClick={() => setWinStart(Math.max(0, clampedStart - columns))}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="ns-btn ns-btn-square"
                  aria-label="Later years"
                  disabled={clampedStart >= maxStart}
                  onClick={() => setWinStart(Math.min(maxStart, clampedStart + columns))}
                >
                  →
                </button>
              </div>
            )}
          </div>

          {comparePlan && compare && (
            <CompareDiff plan={plan} comparePlan={comparePlan} result={result} compareResult={compare.result} />
          )}

          {tab === 'accounts' && (
            <AccountsTab
              window={windowYears}
              accounts={allAccounts}
              onEditType={(accountClass: AccountClass) => {
                const owned = stored.accounts.find(
                  (a) => a.accountClass === accountClass && !a.isSynthetic,
                );
                setAccountDraft(structuredClone(owned ?? newAccountOfType(accountClass)));
              }}
            />
          )}
          {tab === 'cashflow' && (
            <CashFlowTab
              window={windowYears}
              events={plan.events}
              onEdit={(event) => editor.edit(event)}
              onEditAssumptions={() => setAssumptionsDraft(structuredClone(stored))}
            />
          )}
          {tab === 'events' && (
            <EventsTab
              events={plan.events}
              result={result}
              selected={selected}
              onSelect={setSelected}
              onEdit={(event) => editor.edit(event)}
            />
          )}
        </section>
          </>
        )}
      </main>

      {sidebarOpen && (
        <Sidebar
          onClose={() => setSidebarOpen(false)}
          plans={plans}
          activePlanId={planId}
          onSelectPlan={(id) => {
            setActive(id);
            setSelected(null);
            setWinStart(0);
            editor.close();
          }}
          onCreatePlan={() => createPlan(`Scenario ${plans.length + 1}`)}
          onRenamePlan={renamePlan}
          onDuplicatePlan={duplicatePlan}
          onDeletePlan={deletePlan}
        />
      )}

      {monarch.connecting && (
        <ConnectDrawer
          status={monarch.status}
          onConnected={monarch.afterConnect}
          onCancel={monarch.closeConnect}
        />
      )}

      {(importing || monarch.fetched) && (
        <ImportDrawer
          plan={stored}
          fetched={monarch.fetched}
          onImport={(next, overrides) => {
            replacePlan({ ...next, settings: { ...next.settings, monarchOverrides: overrides } });
            setImporting(false);
            monarch.clearFetched();
          }}
          onCancel={() => {
            setImporting(false);
            monarch.clearFetched();
          }}
        />
      )}

      {assumptionsDraft && (
        <AssumptionsDrawer
          draft={assumptionsDraft}
          accounts={allAccounts}
          onChange={setAssumptionsDraft}
          onSave={() => {
            replacePlan(assumptionsDraft);
            setAssumptionsDraft(null);
          }}
          onCancel={() => setAssumptionsDraft(null)}
        />
      )}

      {accountDraft && (
        <AccountDrawer
          draft={accountDraft}
          synthetic={allAccounts.filter(
            (a) => a.isSynthetic && a.accountClass === accountDraft.accountClass,
          )}
          planStartYear={stored.settings.startYear}
          planEndYear={result.endYear}
          onChange={setAccountDraft}
          onSave={() => {
            upsertAccount(stored.id, accountDraft);
            setAccountDraft(null);
          }}
          onCancel={() => setAccountDraft(null)}
        />
      )}

      {editor.open && (
        <EventDrawer
          draft={editor.draft}
          allEvents={plan.events}
          participants={plan.participants}
          accounts={plan.accounts}
          planStartYear={stored.settings.startYear}
          planEndYear={result.endYear}
          isNew={editor.isNew}
          onChange={editor.change}
          onPickKind={(kind) => editor.pickKind(kind, stored)}
          onSave={() => {
            if (editor.draft) upsertEvent(stored.id, editor.draft);
            editor.close();
          }}
          onCancel={editor.close}
          onDelete={() => {
            if (editor.draft) deleteEvent(stored.id, editor.draft.id);
            setSelected(null);
            editor.close();
          }}
        />
      )}
    </div>
  );
}
