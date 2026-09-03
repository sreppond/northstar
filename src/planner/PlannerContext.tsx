import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_RETURN_SHIFT,
  deflate,
  headlineReturnRate,
  pathMarkers,
  runPlan,
  withReturnShift,
} from '@northstar/engine';
import type { AccountClass, Account, Plan, PlanEvent, RetirementConfig } from '@northstar/engine';
import { newAccountOfType } from '@northstar/engine';
import { usePlanStore } from './store/planStore';
import type { ProgressPoint } from './progress';
import { useMonarch } from './useMonarch';
import { useEventEditor, withDraft } from './drawer/useEventEditor';
import type { ChartSelection, CompareSeries, FanSeries } from './NetWorthChart';
import { useBreakpoint, yearColumnsFor } from './useBreakpoint';
import { cagr } from './format';
import { heroReading } from './reading';

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
  replacePlan(plan: Plan): void;
  updateSettings: ReturnType<typeof usePlanStore.getState>['updateSettings'];

  // -- Compare page's What-If --
  startWhatIf(planId: string): void;
  keepWhatIf(planId: string): void;
  revertWhatIf(planId: string): void;
  forkWhatIf(planId: string, name: string): void;

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
  heroFigure: number;

  // -- comparison & sensitivity --
  comparePlan: Plan | undefined;
  compare: CompareSeries | undefined;
  spread: FanSeries | undefined;
  spreadAtEnd: { low: number; high: number } | undefined;
  showFan: boolean;
  toggleFan(): void;
  fan: FanSeries | undefined;

  // -- undo/redo --
  undo(): void;
  redo(): void;
  canUndo: boolean;
  canRedo: boolean;

  // -- the instrument: scrub + drag-through-time --
  scrubYear: number | null;
  setScrubYear(year: number | null): void;
  dragDraft: PlanEvent | null;
  setDragDraft(event: PlanEvent | null): void;
  selected: ChartSelection | null;
  setSelected(selection: ChartSelection | null): void;

  // -- the year window (ledger pages) --
  columns: number;
  clampedStart: number;
  maxStart: number;
  windowYears: ReturnType<typeof runPlan>['years'];
  windowLabel: string;
  pageEarlier(): void;
  pageLater(): void;
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
  const columns = yearColumnsFor(useBreakpoint());
  const [winStart, setWinStart] = useState(0);
  const [selected, setSelected] = useState<ChartSelection | null>(null);
  const [showFan, setShowFan] = useState(false);
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
  const createPlan = usePlanStore((s) => s.createPlan);
  const duplicatePlan = usePlanStore((s) => s.duplicatePlan);
  const renamePlan = usePlanStore((s) => s.renamePlan);
  const deletePlan = usePlanStore((s) => s.deletePlan);
  const startWhatIf = usePlanStore((s) => s.startWhatIf);
  const keepWhatIf = usePlanStore((s) => s.keepWhatIf);
  const revertWhatIf = usePlanStore((s) => s.revertWhatIf);
  const forkWhatIf = usePlanStore((s) => s.forkWhatIf);
  const progressPoints = usePlanStore((s) => s.progressPoints);
  const upsertProgressPoint = usePlanStore((s) => s.upsertProgressPoint);
  const deleteProgressPoint = usePlanStore((s) => s.deleteProgressPoint);
  const editor = useEventEditor();
  const [accountDraft, setAccountDraft] = useState<Account | null>(null);
  const [assumptionsDraft, setAssumptionsDraft] = useState<Plan | null>(null);
  const [importing, setImporting] = useState(false);
  const monarch = useMonarch();

  const [scrubYear, setScrubYear] = useState<number | null>(null);
  const [dragDraft, setDragDraft] = useState<PlanEvent | null>(null);

  const stored = useMemo(() => plans.find((p) => p.id === planId) ?? plans[0], [plans, planId]);
  const visiblePlans = useMemo(() => plans.filter((p) => !p.isWhatIfSnapshot), [plans]);

  // ⌘Z / ⇧⌘Z, but never while a field has focus.
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

  // ⌘K, the command palette. Fires regardless of focus, unlike ⌘Z.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'k') return;
      e.preventDefault();
      setPaletteOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const plan = useMemo(
    () => withDraft(withDraft(assumptionsDraft ?? stored, editor.draft), dragDraft),
    [assumptionsDraft, stored, editor.draft, dragDraft],
  );

  const nominal = useMemo(() => runPlan(plan), [plan]);

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
  const toggleFan = () => setShowFan((on) => !on);

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

  const first = result.years[0];
  const last = result.years[result.years.length - 1];
  const growth = cagr(first?.netWorth ?? 0, last?.netWorth ?? 0, result.years.length - 1);

  const reading = useMemo(
    () => heroReading(plan, result, markers, growth),
    [plan, result, markers, growth],
  );

  const heroFigure =
    (scrubYear !== null ? result.years.find((y) => y.year === scrubYear)?.netWorth : undefined) ??
    reading.figure;

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
  const pageEarlier = () => setWinStart(Math.max(0, clampedStart - columns));
  const pageLater = () => setWinStart(Math.min(maxStart, clampedStart + columns));
  const resetWindow = () => setWinStart(0);

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
    heroFigure,

    comparePlan,
    compare,
    spread,
    spreadAtEnd,
    showFan,
    toggleFan,
    fan,

    undo,
    redo,
    canUndo,
    canRedo,

    scrubYear,
    setScrubYear,
    dragDraft,
    setDragDraft,
    selected,
    setSelected,

    columns,
    clampedStart,
    maxStart,
    windowYears,
    windowLabel,
    pageEarlier,
    pageLater,
    resetWindow,

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

    sidebarOpen,
    setSidebarOpen,
    paletteOpen,
    setPaletteOpen,
  };

  return <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>;
}
