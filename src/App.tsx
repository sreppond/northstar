import { useMemo, useState } from 'react';
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
import { AccountDrawer } from './planner/drawer/AccountDrawer';
import { AssumptionsDrawer } from './planner/drawer/AssumptionsDrawer';
import { EventDrawer } from './planner/drawer/EventDrawer';
import { useEventEditor, withDraft } from './planner/drawer/useEventEditor';
import { NetWorthChart, type ChartSelection } from './planner/NetWorthChart';
import { AccountsTab } from './planner/tabs/AccountsTab';
import { CashFlowTab } from './planner/tabs/CashFlowTab';
import { EventsTab } from './planner/tabs/EventsTab';
import { cagr, money, percent, roundMoney } from './planner/format';

type TabId = 'accounts' | 'cashflow' | 'events';

const TABS: { id: TabId; name: string }[] = [
  { id: 'accounts', name: 'Accounts' },
  { id: 'cashflow', name: 'Cash Flow' },
  { id: 'events', name: 'Events' },
];

/** Only eight year-columns fit; the window pages rather than the type shrinking. */
const WINDOW = 8;

export default function App() {
  const [tab, setTab] = useState<TabId>('accounts');
  const [winStart, setWinStart] = useState(0);
  const [selected, setSelected] = useState<ChartSelection | null>(null);

  const plans = usePlanStore((s) => s.plans);
  const planId = usePlanStore((s) => s.activeId);
  const setActive = usePlanStore((s) => s.setActive);
  const upsertEvent = usePlanStore((s) => s.upsertEvent);
  const deleteEvent = usePlanStore((s) => s.deleteEvent);
  const undo = usePlanStore((s) => s.undo);
  const canUndo = usePlanStore((s) => s.past.length > 0);

  const upsertAccount = usePlanStore((s) => s.upsertAccount);
  const replacePlan = usePlanStore((s) => s.replacePlan);
  const editor = useEventEditor();
  const [accountDraft, setAccountDraft] = useState<Account | null>(null);
  const [assumptionsDraft, setAssumptionsDraft] = useState<Plan | null>(null);

  const stored = useMemo(() => plans.find((p) => p.id === planId) ?? plans[0], [plans, planId]);

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
      note: `End of ${result.endYear}`,
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

  const maxStart = Math.max(0, result.years.length - WINDOW);
  const clampedStart = Math.min(winStart, maxStart);
  const windowYears = result.years.slice(clampedStart, clampedStart + WINDOW);
  const windowLabel =
    windowYears.length > 0
      ? `${windowYears[0].year}–${windowYears[windowYears.length - 1].year}`
      : '';

  return (
    <div className="ns">
      <header className="ns-head">
        <div className="ns-wordmark">Forecasting</div>
        <div className="ns-badge">Plan</div>
        <div className="ns-scenarios">
          {plans.map((p) => (
            <button
              key={p.id}
              type="button"
              className="ns-scenario"
              aria-pressed={p.id === planId}
              onClick={() => {
                setActive(p.id);
                setSelected(null);
                setWinStart(0);
                editor.close();
              }}
            >
              <span className="ns-dot" />
              {p.name}
            </button>
          ))}
        </div>
      </header>

      <main className="ns-main">
        <section className="ns-card">
          <div className="ns-title-row">
            <div className="ns-title-icon" aria-hidden>
              <TargetIcon />
            </div>
            <div className="ns-title">{plan.name}</div>
            <div className="ns-subtle ns-num">
              {result.startYear}–{result.endYear} · {eventCount} events
            </div>
            <div className="ns-title-actions">
              {canUndo && (
                <button type="button" className="ns-btn-ghost" onClick={undo}>
                  Undo
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
            {tab !== 'events' && (
              <div className="ns-window">
                <span className="ns-window-label">{windowLabel}</span>
                <button
                  type="button"
                  className="ns-btn ns-btn-square"
                  aria-label="Earlier years"
                  disabled={clampedStart === 0}
                  onClick={() => setWinStart(Math.max(0, clampedStart - WINDOW))}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="ns-btn ns-btn-square"
                  aria-label="Later years"
                  disabled={clampedStart >= maxStart}
                  onClick={() => setWinStart(Math.min(maxStart, clampedStart + WINDOW))}
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
