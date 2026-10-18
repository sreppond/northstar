import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  deflate,
  headlineReturnRate,
  pathMarkers,
  planFreshness,
  runPlan,
} from '@northstar/engine';
import type {
  AccountClass,
  Account,
  Plan,
  PlanFreshness,
  RetirementConfig,
  ChartRangeKey,
} from '@northstar/engine';
import { newAccountOfType } from '@northstar/engine';
import { usePlanStore } from './store/planStore';
import type { ProgressPoint } from './store/planStore';
import { useMonarch } from './useMonarch';
import { useLocalMonarch } from './useLocalMonarch';
import { rollForward } from './rollover';
import { useEventEditor, withDraft } from './drawer/useEventEditor';
import { asOfDateLabel, cagr } from './format';
import { heroReading } from './reading';
import { useGlobalShortcuts } from './shortcuts';
import { openShortcutSheet } from './ShortcutSheet';
import { planHealth, type PlanHealth } from './health';

/**
 * Everything the routed pages (`pages/*.tsx`) need, computed once here rather
 * than re-derived per page. This is a mechanical extraction of what used to
 * be `Planner()`'s body in `App.tsx` before the sidebar/multi-page port
 * (docs/BORROW.md-style port of Northstar v2's IA) — no logic changed, only
 * relocated so every route can read `plan`/`result`/`editor`/etc. without
 * prop-drilling one giant object through a router.
 */
export interface PlannerContextValue {
  // -- plans & the active one --
  plans: Plan[];
  /** `plans`, minus any hidden What-If snapshot — what a human should ever pick from. */
  visiblePlans: Plan[];
  planId: string;
  stored: Plan;
  setActive(id: string): void;
  createPlan(name: string): void;
  duplicatePlan(id: string): void;
  renamePlan(id: string, name: string): void;
  deletePlan(id: string): void;
  replacePlan(plan: Plan, toastMessage?: string): void;
  updateSettings: ReturnType<typeof usePlanStore.getState>['updateSettings'];

  // -- Compare page's What-If --
  startWhatIf(planId: string): void;
  keepWhatIf(planId: string): void;
  revertWhatIf(planId: string): void;
  forkWhatIf(planId: string, name: string): void;
  savePlanAs(plan: Plan, name: string): void;

  // -- Progress: the historical net-worth ledger --
  progressPoints: ProgressPoint[];
  upsertProgressPoint(point: ProgressPoint): void;
  deleteProgressPoint(id: string): void;

  // -- the live-preview-composed plan and its projection --
  plan: Plan;
  result: ReturnType<typeof runPlan>;
  nominal: ReturnType<typeof runPlan>;
  markers: ReturnType<typeof pathMarkers>;
  allAccounts: Account[];
  reading: ReturnType<typeof heroReading>;
  growth: number;

  // -- undo/redo --
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;

  // -- the instrument: the pinned year --
  /**
   * The year pinned by clicking any time chart, app-wide (docs/REDESIGN-V5.md
   * §4.1). Hover stays local to each chart. Resets to null when the active
   * plan changes.
   */
  focusYear: number | null;
  setFocusYear(year: number | null): void;
  /** Range for every time chart; persisted per plan in `settings.chartRange`, default `'all'`. */
  chartRange: ChartRangeKey;
  setChartRange(range: ChartRangeKey): void;
  /** Does the plan run out of money, and the spendable-money series (docs/REDESIGN-V5.md §4.2). */
  health: PlanHealth;
  /**
   * Inert shims: the old chart-selection and year-pager state is gone
   * (V5-REVIEW-1 D1), but `App.tsx` (unit U4's file) still calls both when
   * the active plan changes. Delete these two lines and those calls together.
   */
  setSelected(selection: null): void;
  resetWindow(): void;

  // -- events & accounts --
  upsertEvent: ReturnType<typeof usePlanStore.getState>['upsertEvent'];
  deleteEvent: ReturnType<typeof usePlanStore.getState>['deleteEvent'];
  upsertAccount: ReturnType<typeof usePlanStore.getState>['upsertAccount'];
  editor: ReturnType<typeof useEventEditor>;
  accountDraft: Account | null;
  setAccountDraft(account: Account | null): void;
  assumptionsDraft: Plan | null;
  setAssumptionsDraft(plan: Plan | null): void;

  // -- retirement's never-blank prompt --
  onSetRetirementYear(year: number): void;

  // -- Monarch import/sync --
  monarch: ReturnType<typeof useMonarch>;
  importing: boolean;
  setImporting(importing: boolean): void;

  // -- freshness: how stale `stored`'s balances/clock are, and the local
  // Monarch-drop-in loop (docs/ROADMAP-10.md Track B/C4) --
  freshness: PlanFreshness;
  localMonarch: ReturnType<typeof useLocalMonarch>;
  rollPlanForward(): void;

  // -- chrome: plan switcher & command palette --
  sidebarOpen: boolean;
  setSidebarOpen(open: boolean): void;
  paletteOpen: boolean;
  setPaletteOpen(open: boolean): void;
}

const PlannerContext = createContext<PlannerContextValue | null>(null);

export function usePlanner(): PlannerContextValue {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error('usePlanner() called outside <PlannerProvider>');
  return ctx;
}

export function PlannerProvider({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

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
  const updateSettingsSilently = usePlanStore((s) => s.updateSettingsSilently);
  const createPlan = usePlanStore((s) => s.createPlan);
  const duplicatePlan = usePlanStore((s) => s.duplicatePlan);
  const renamePlan = usePlanStore((s) => s.renamePlan);
  const deletePlan = usePlanStore((s) => s.deletePlan);
  const startWhatIf = usePlanStore((s) => s.startWhatIf);
  const keepWhatIf = usePlanStore((s) => s.keepWhatIf);
  const revertWhatIf = usePlanStore((s) => s.revertWhatIf);
  const forkWhatIf = usePlanStore((s) => s.forkWhatIf);
  const savePlanAs = usePlanStore((s) => s.savePlanAs);
  const progressPoints = usePlanStore((s) => s.progressPoints);
  const upsertProgressPoint = usePlanStore((s) => s.upsertProgressPoint);
  const deleteProgressPoint = usePlanStore((s) => s.deleteProgressPoint);
  const editor = useEventEditor();
  const [accountDraft, setAccountDraft] = useState<Account | null>(null);
  const [assumptionsDraft, setAssumptionsDraft] = useState<Plan | null>(null);
  const [importing, setImporting] = useState(false);
  const monarch = useMonarch();
  const localMonarch = useLocalMonarch();

  // Keyed by plan so a pin never carries into another plan: the stored year
  // is only honoured while its plan is the active one, with no effect pass
  // (and no frame showing the old plan's pin).
  const [focus, setFocus] = useState<{ planId: string; year: number | null }>({ planId, year: null });
  const focusYear = focus.planId === planId ? focus.year : null;
  const setFocusYear = (year: number | null) => setFocus({ planId, year });

  const stored = useMemo(() => plans.find((p) => p.id === planId) ?? plans[0], [plans, planId]);
  const visiblePlans = useMemo(() => plans.filter((p) => !p.isWhatIfSnapshot), [plans]);

  // How stale `stored`'s own clock/balances are — the SAVED plan, not the
  // live `plan` below (which can carry an in-progress assumptions/event
  // draft that never touched `asOfDate`). `new Date()` on every render is
  // deliberate, not memoized: `planFreshness` is cheap pure arithmetic, and
  // a memoized value would go stale the moment midnight passes while the
  // tab stays open.
  const freshness = planFreshness(stored, new Date());
  // `rollForward` now returns `{ plan, projectedFrom }` (docs/W3-REVIEW.md
  // #4) rather than a bare `Plan` — `projectedFrom` is the old plan's stale
  // `asOfDate` the new initial balances were actually PROJECTED forward
  // from, so the toast can say that instead of implying the new balances are
  // as fresh as "Jan 1" (the exact bug #4 fixes: staleness used to just
  // disappear on rollover).
  const rollPlanForward = () => {
    const { plan: rolled, projectedFrom } = rollForward(stored, new Date());
    replacePlan(
      rolled,
      projectedFrom
        ? `Rolled forward using balances projected from ${asOfDateLabel(projectedFrom)}`
        : 'Rolled the plan forward',
    );
  };

  // The one keyboard-shortcut registry (docs/ROADMAP-10.md C6,
  // `shortcuts.ts`) — replaces what used to be two separate `window`
  // keydown listeners here (⌘Z/⇧⌘Z and ⌘K) with a single dispatcher, so
  // ⌘1–⌘9, ⌘N, ⌘, and `?` can join them without a third/fourth/fifth
  // listener each doing its own typing-guard.
  const navigate = useNavigate();
  useGlobalShortcuts({
    navigate,
    newEvent: () => editor.startNew(),
    openSettings: () => setAssumptionsDraft(structuredClone(stored)),
    undo,
    redo,
    togglePalette: () => setPaletteOpen((v) => !v),
    openHelp: () => openShortcutSheet(),
  });

  const plan = useMemo(
    () => withDraft(assumptionsDraft ?? stored, editor.draft),
    [assumptionsDraft, stored, editor.draft],
  );

  const nominal = useMemo(() => runPlan(plan), [plan]);

  const result = useMemo(
    () =>
      plan.settings.dollarMode === 'todaysDollars'
        ? deflate(nominal, plan.settings.inflationRate)
        : nominal,
    [nominal, plan.settings.dollarMode, plan.settings.inflationRate],
  );

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

  const markers = useMemo(() => pathMarkers(result), [result]);
  // Passed `plan` so "spendable" can honour each account's withdrawal gates.
  const health = useMemo(() => planHealth(result, plan), [result, plan]);

  // Persisted through `updateSettingsSilently` so it survives reloads per plan. Read
  // from `stored`, not the draft-composed `plan`: it is a display preference,
  // not something an in-progress edit should flicker.
  const chartRange: ChartRangeKey = stored.settings.chartRange ?? 'all';
  const setChartRange = (range: ChartRangeKey) => {
    // A range pick is a view preference, never an undo step (docs/REDESIGN-V5.md §4.1).
    if (range !== chartRange) updateSettingsSilently(stored.id, { chartRange: range });
  };

  const allAccounts: Account[] = useMemo(() => {
    const synthetic = new Map<string, Account>();
    for (const row of result.years.flatMap((y) => y.accounts)) {
      if (synthetic.has(row.accountId)) continue;
      if (plan.accounts.some((a) => a.id === row.accountId)) continue;
      synthetic.set(row.accountId, {
        ...newAccountOfType(row.accountClass as AccountClass),
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

  const last = result.years[result.years.length - 1];
  // From the plan's real opening balance (`result.opening`, as of
  // `asOfDate`) to the horizon's close, over the REAL elapsed time between
  // those two dates — not the whole-number "years.length - 1" this used to
  // give, which measured from `years[0]`'s projected Dec 31 close (already a
  // few months of assumed growth past today) over a clock that always
  // ticked in whole calendar years regardless of how much of the stub year
  // was actually left (docs/MATH.md "Today vs. years[0]", queued for this
  // wave). A plan whose as-of date is Sep 25 has ~21.3 years to a 2046
  // horizon, not a flat 20.
  const growth = cagr(
    result.opening?.netWorth ?? result.years[0]?.netWorth ?? 0,
    last?.netWorth ?? 0,
    elapsedYearsToHorizon(plan.settings.startYear, plan.settings.asOfDate, result.endYear),
  );

  // Passed separately from `growth` (docs/REVIEW.md S15) so the hero reading
  // can name the market-return assumption behind the net-worth CAGR it
  // reports, rather than leaving that number looking like it disagrees with
  // the chart meta line's own "Return X%".
  const marketReturn = headlineReturnRate(plan);
  const reading = useMemo(
    () => heroReading(plan, result, markers, growth, marketReturn),
    [plan, result, markers, growth, marketReturn],
  );

  const value: PlannerContextValue = {
    plans,
    visiblePlans,
    planId,
    stored,
    setActive,
    createPlan,
    duplicatePlan,
    renamePlan,
    deletePlan,
    replacePlan,
    updateSettings,

    startWhatIf,
    keepWhatIf,
    revertWhatIf,
    forkWhatIf,
    savePlanAs,

    progressPoints,
    upsertProgressPoint,
    deleteProgressPoint,

    plan,
    result,
    nominal,
    markers,
    allAccounts,
    reading,
    growth,

    undo,
    redo,
    canUndo,
    canRedo,

    focusYear,
    setFocusYear,
    chartRange,
    setChartRange,
    health,
    setSelected: noop,
    resetWindow: noop,

    upsertEvent,
    deleteEvent,
    upsertAccount,
    editor,
    accountDraft,
    setAccountDraft,
    assumptionsDraft,
    setAssumptionsDraft,

    onSetRetirementYear,

    monarch,
    importing,
    setImporting,

    freshness,
    localMonarch,
    rollPlanForward,

    sidebarOpen,
    setSidebarOpen,
    paletteOpen,
    setPaletteOpen,
  };

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}

/** Real elapsed time from `asOfDate` (or Jan 1st of `startYear` when unset —
    the same fallback `planFreshness`/`planMetaLine` both use) to
    December 31st of `endYear`, in fractional years — the CAGR clock `growth`
    above uses (docs/MATH.md "Today vs. years[0]", queued for this wave). A
    365.25-day year, matching the leap-year-averaged convention a "years
    elapsed" figure conventionally uses; nothing else in this file needs
    day-level precision for a single growth-rate headline. */
function elapsedYearsToHorizon(startYear: number, asOfDate: string | undefined, endYear: number): number {
  const parsed = asOfDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(asOfDate) : null;
  const asOfUTC = parsed
    ? Date.UTC(Number(parsed[1]), Number(parsed[2]) - 1, Number(parsed[3]))
    : Date.UTC(startYear, 0, 1);
  const endUTC = Date.UTC(endYear, 11, 31);
  return Math.max(0, (endUTC - asOfUTC) / (365.25 * 86_400_000));
}

function noop() {}
