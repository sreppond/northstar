import { useEffect, useMemo, useState } from 'react';
import { deflate, runPlan } from '@northstar/engine';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/700.css';
import './planner/planner.css';

import type { AccountClass, Account, Plan } from '@northstar/engine';
import { newAccountOfType } from '@northstar/engine';
import { usePlanStore } from './planner/store/planStore';
import { HoverCard } from './planner/HoverCard';
import { planDetail } from './planner/detail';
import { ScenarioBar } from './planner/ScenarioBar';
import { AccountDrawer } from './planner/drawer/AccountDrawer';
import { AssumptionsDrawer } from './planner/drawer/AssumptionsDrawer';
import { EventDrawer } from './planner/drawer/EventDrawer';
import { useEventEditor, withDraft } from './planner/drawer/useEventEditor';
import { NetWorthChart, type ChartSelection, type CompareSeries } from './planner/NetWorthChart';
import { AccountsTab } from './planner/tabs/AccountsTab';
import { CashFlowTab } from './planner/tabs/CashFlowTab';
import { EventsTab } from './planner/tabs/EventsTab';
import { cagr, money, percent, roundMoney, signedMoney } from './planner/format';
import { useBreakpoint, yearColumnsFor } from './planner/useBreakpoint';

type TabId = 'accounts' | 'cashflow' | 'events';

const TABS: { id: TabId; name: string }[] = [
  { id: 'accounts', name: 'Accounts' },
  { id: 'cashflow', name: 'Cash Flow' },
  { id: 'events', name: 'Events' },
];

export default function App() {
  const [tab, setTab] = useState<TabId>('accounts');
  // The window pages rather than the type shrinking, and how many years fit
  // depends on the viewport.
  const columns = yearColumnsFor(useBreakpoint());
  const [winStart, setWinStart] = useState(0);
  const [selected, setSelected] = useState<ChartSelection | null>(null);

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

  const eventCount = plan.events.filter((e) => e.isIncluded && !e.isHidden).length;
  const first = result.years[0];
  const last = result.years[result.years.length - 1];
  const growth = cagr(first?.netWorth ?? 0, last?.netWorth ?? 0, result.years.length - 1);

  // Compared at the ACTIVE plan's horizon, matching how the chart clips it.
  const endOfCompare =
    compare?.result.years.find((y) => y.year === result.endYear)?.netWorth ??
    compare?.result.years[compare.result.years.length - 1]?.netWorth ??
    0;

  const homeEvent = plan.events.find((e) => e.kind === 'buyAHome' && e.isIncluded);
  const homeConfig = (homeEvent?.config ?? {}) as { price?: number; downPaymentPercent?: number };

  const stats = [
    {
      label: 'Net worth (EOY)',
      value: money(first?.netWorth ?? 0),
      note: 'End of first plan year',
    },
    {
      label: 'Net worth at end',
      value: money(last?.netWorth ?? 0),
      note: compare
        ? `${signedMoney((last?.netWorth ?? 0) - endOfCompare)} vs ${compare.name}`
        : `End of ${result.endYear}`,
    },
    {
      label: 'Annual growth',
      value: growth === undefined ? '—' : percent(growth),
      note: 'Compound, net worth',
    },
    homeEvent
      ? {
          label: 'Home purchase',
          value: String(homeEvent.startYear),
          note:
            homeConfig.price !== undefined
              ? `${roundMoney(homeConfig.price)}, ${roundMoney(
                  homeConfig.price * (1 - (homeConfig.downPaymentPercent ?? 20) / 100),
                )} financed`
              : '',
        }
      : {
          label: 'Projection',
          value: `${result.years.length} yrs`,
          note: `${result.startYear}–${result.endYear}`,
        },
  ];

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
        <div className="ns-wordmark">Forecasting</div>
        <div className="ns-badge">Plan</div>
        <ScenarioBar
          plans={plans}
          activeId={planId}
          onSelect={(id) => {
            setActive(id);
            setSelected(null);
            setWinStart(0);
            editor.close();
          }}
          onCreate={() => createPlan(`Scenario ${plans.length + 1}`)}
          onRename={renamePlan}
          onDuplicate={duplicatePlan}
          onDelete={deletePlan}
        />
      </header>

      <main className="ns-main">
        <section className="ns-card">
          <div className="ns-title-row">
            <div className="ns-title-icon" aria-hidden>
              <TargetIcon />
            </div>
            <div className="ns-title">{plan.name}</div>
            <div className="ns-subtle ns-num">
              {result.startYear}–{result.endYear} · {eventCount} event{eventCount === 1 ? '' : 's'}
            </div>
            <div className="ns-title-actions">
              {canUndo && (
                <button type="button" className="ns-btn-ghost" onClick={undo} title="Undo (⌘Z)">
                  Undo
                </button>
              )}
              {canRedo && (
                <button type="button" className="ns-btn-ghost" onClick={redo} title="Redo (⇧⌘Z)">
                  Redo
                </button>
              )}
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
          </div>

          <div className="ns-kpis">
            {stats.map((stat) => (
              <div key={stat.label} className="ns-kpi">
                <div className="ns-kpi-label">{stat.label}</div>
                <div className="ns-kpi-value ns-num">{stat.value}</div>
                <div className="ns-kpi-note ns-num">{stat.note}</div>
              </div>
            ))}
          </div>

          <NetWorthChart
            result={result}
            events={plan.events}
            rateLabel={percent(
              plan.accounts.find((a) => a.growthRateMethod === 'fixed')?.growthRate ?? 0,
            )}
            selected={selected}
            compare={compare}
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
          {tab === 'cashflow' && <CashFlowTab window={windowYears} />}
          {tab === 'events' && (
            <EventsTab
              events={plan.events}
              result={result}
              selected={selected}
              onSelect={setSelected}
            />
          )}
        </section>
      </main>

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

function TargetIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.5" fill="currentColor" />
    </svg>
  );
}
