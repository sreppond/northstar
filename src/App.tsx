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

import type { AccountClass, Account, Plan, PlanEvent, RetirementConfig } from '@northstar/engine';
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
import { CommandPalette } from './planner/CommandPalette';
import { Onboarding } from './planner/Onboarding';
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

/**
 * The gate in front of the planner (docs/REDESIGN.md §6 item 6). A
 * genuinely empty store (`plans.length === 0`) — nobody has ever saved a
 * plan in this browser — renders `Onboarding` instead of silently seeding
 * `samplePlan.ts`'s fabricated "Amazon" scenarios.
 *
 * `onboarding` stays reactive to `plans.length` rather than being decided
 * once: if a backend later hydrates real plans out from under a genuinely
 * empty local store (`serverSync.ts`'s "the server is the durable copy"),
 * this falls straight through to the real planner instead of stranding the
 * user on a stale onboarding form. The one exception is `begun`, set the
 * moment `Onboarding` creates its own first plan (`startPlan`) — without it,
 * `plans.length` would flip to 1 immediately and skip the "add a first
 * job/account" stage before the user ever sees it.
 */
export default function App() {
  const plans = usePlanStore((s) => s.plans);
  const [begun, setBegun] = useState(false);

  if (plans.length === 0 || begun) {
    return <Onboarding onBegin={() => setBegun(true)} onFinish={() => setBegun(false)} />;
  }
  return <Planner />;
}

function Planner() {
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

  // The instrument (docs/REDESIGN.md §4.1, §5.4): the year under the pointer
  // while scrubbing the chart, and the event currently being dragged through
  // time. Both are ordinary React state, NOT store state — nothing here
  // touches `usePlanStore` until a drag actually commits (see `dragDraft`
  // below and NetWorthChart's `onDragCommit`).
  const [scrubYear, setScrubYear] = useState<number | null>(null);
  const [dragDraft, setDragDraft] = useState<PlanEvent | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  // ⌘K, the command palette (docs/REDESIGN.md §3.2). Unlike ⌘Z this fires
  // regardless of focus — a conventional palette shortcut (Slack, Linear,
  // VS Code) is meant to reach you wherever you are, and the combo is
  // distinctive enough that it never collides with ordinary typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      setPaletteOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Both drawers preview live: whichever draft is open stands in for the
  // stored plan in the projection, without ever being written to the store.
  // That is what makes Cancel free. A drag through time (docs/REDESIGN.md
  // §4.1) is the same trick played a third time: `withDraft` is a plain,
  // generic (plan, draft) -> plan substitution, so it composes by chaining —
  // `dragDraft` overlays on top of whatever the drawers already produced,
  // with no drawer UI of its own (unlike `editor.change`, it never flips
  // anything open). In practice at most one of `editor.draft`/`dragDraft` is
  // ever non-null at a time, but the chain is correct either way.
  const plan = useMemo(
    () => withDraft(withDraft(assumptionsDraft ?? stored, editor.draft), dragDraft),
    [assumptionsDraft, stored, editor.draft, dragDraft],
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

  // The Retirement lens's never-blank prompt (docs/REDESIGN.md §4.2) writes
  // straight to the store rather than staging a draft — there is no drawer,
  // no separate save step, just "the instant a value is set". Reuses any
  // existing retirement event's config (and id) so re-setting the year from
  // the prompt after toggling one off never leaves a duplicate behind.
  const onSetRetirementYear = (year: number) => {
    const participantId = stored.participants.find((p) => p.isIncluded)?.id;
    const existing = stored.events.find((e) => e.kind === 'retirement');
    const existingConfig = existing?.config as Partial<RetirementConfig> | undefined;
    upsertEvent(stored.id, {
      id: existing?.id ?? `e${Math.random().toString(36).slice(2, 10)}`,
      kind: 'retirement',
      name: existing?.name ?? 'Retire',
      startYear: year,
      isIncluded: true,
      config: { spendingChangePercent: -20, ...existingConfig, participantId },
    });
  };

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

  // Scrub (docs/REDESIGN.md §4.1): "point at 2034 and it reads 2034's net
  // worth." `reading.figure` is the horizon figure and stays the resting
  // value; while a year is under the pointer, the hero shows THAT year's net
  // worth instead. Dragging an event is a different, already-live path —
  // `dragDraft` above reprojects `result` itself, so `reading.figure` (still
  // the horizon year) moves live on its own without going through this.
  const heroFigure =
    (scrubYear !== null ? result.years.find((y) => y.year === scrubYear)?.netWorth : undefined) ??
    reading.figure;

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
  // Named so the ⌘K palette (docs/REDESIGN.md §3.2, "absorbs... the year
  // pager") can fire the exact same page turn the ← / → buttons do below.
  const pageEarlier = () => setWinStart(Math.max(0, clampedStart - columns));
  const pageLater = () => setWinStart(Math.min(maxStart, clampedStart + columns));

  return (
    <div className="ns">
      <header className="ns-head">
        <div className="ns-head-row">
          <div className="ns-wordmark">Northstar</div>
          <ViewTabs view={view} onSelect={setView} />
          <div className="ns-head-actions">
            <button
              type="button"
              className="ns-cmdk-stub"
              title="Command palette"
              onClick={() => setPaletteOpen(true)}
            >
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
        {view === 'retirement' && (
          <RetirementForecastView plan={plan} result={result} onSetRetirementYear={onSetRetirementYear} />
        )}
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
            <AnimatedFigure className="ns-hero-figure" value={money(heroFigure)} />
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
            onScrubYear={setScrubYear}
            onDragPreview={setDragDraft}
            onDragCommit={(eventId, year) => {
              // Commits against `stored` (the source of truth), never
              // `plan` — `plan` may already have `dragDraft` overlaid on
              // it, and re-reading the event from there would fold the
              // in-flight draft into what gets written. One call, so this
              // is the drag's single undo entry (docs/REDESIGN.md §4.1).
              // `dragDraft` itself is cleared separately, by the
              // `onDragPreview(null)` NetWorthChart fires right after this.
              const event = stored.events.find((e) => e.id === eventId);
              if (event) upsertEvent(stored.id, { ...event, startYear: year });
            }}
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
                  onClick={pageEarlier}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="ns-btn ns-btn-square"
                  aria-label="Later years"
                  disabled={clampedStart >= maxStart}
                  onClick={pageLater}
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
              highlightYear={scrubYear}
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
              highlightYear={scrubYear}
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

      {paletteOpen && (
        <CommandPalette
          view={view}
          onSelectView={setView}
          plans={plans}
          activePlanId={stored.id}
          compareToPlanId={stored.settings.compareToPlanId}
          onSetCompare={(id) => updateSettings(stored.id, { compareToPlanId: id })}
          windowLabel={windowLabel}
          canPageEarlier={clampedStart > 0}
          canPageLater={clampedStart < maxStart}
          onPageEarlier={pageEarlier}
          onPageLater={pageLater}
          onOpenSidebar={() => setSidebarOpen(true)}
          onClose={() => setPaletteOpen(false)}
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
          saved={stored}
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
