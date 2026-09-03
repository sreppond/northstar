import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './planner/planner.css';

import { usePlanStore } from './planner/store/planStore';
import { PlannerProvider, usePlanner } from './planner/PlannerContext';
import { Sidebar } from './planner/Sidebar';
import { PlanSwitcher } from './planner/PlanSwitcher';
import { CommandPalette } from './planner/CommandPalette';
import { Onboarding } from './planner/Onboarding';
import { AccountDrawer } from './planner/drawer/AccountDrawer';
import { AssumptionsDrawer } from './planner/drawer/AssumptionsDrawer';
import { ImportDrawer } from './planner/drawer/ImportDrawer';
import { ConnectDrawer } from './planner/drawer/ConnectDrawer';
import { EventDrawer } from './planner/drawer/EventDrawer';
import { OverviewPage } from './planner/pages/OverviewPage';
import { AccountsPage } from './planner/pages/AccountsPage';
import { CashFlowPage } from './planner/pages/CashFlowPage';
import { EventsPage } from './planner/pages/EventsPage';
import { RetirementPage } from './planner/pages/RetirementPage';
import { HousePage } from './planner/pages/HousePage';
import { AnnuityPage } from './planner/pages/AnnuityPage';
import { ProgressPage } from './planner/pages/ProgressPage';
import { ComparePage } from './planner/pages/ComparePage';
import { ReportsPage } from './planner/pages/ReportsPage';

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
  return (
    <PlannerProvider>
      <PlannerShell />
    </PlannerProvider>
  );
}

/**
 * The shell: the persistent nav rail (`Sidebar.tsx`, ported from Northstar
 * v2's IA) plus whichever page the route selects, plus every overlay that
 * used to hang off `Planner()` directly — none of their behavior changed,
 * only where they're composed from.
 */
function PlannerShell() {
  const {
    sidebarOpen,
    setSidebarOpen,
    paletteOpen,
    setPaletteOpen,
    visiblePlans,
    planId,
    setActive,
    createPlan,
    duplicatePlan,
    renamePlan,
    deletePlan,
    setSelected,
    resetWindow,
    editor,
    stored,
    result,
    allAccounts,
    upsertEvent,
    deleteEvent,
    upsertAccount,
    replacePlan,
    monarch,
    importing,
    setImporting,
    accountDraft,
    setAccountDraft,
    assumptionsDraft,
    setAssumptionsDraft,
  } = usePlanner();

  return (
    <div className="ns">
      <Sidebar />

      <main className="ns-main">
        <Routes>
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/cashflow" element={<CashFlowPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/retirement" element={<RetirementPage />} />
          <Route path="/house" element={<HousePage />} />
          <Route path="/annuity" element={<AnnuityPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/compare" element={<ComparePage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Routes>
      </main>

      {sidebarOpen && (
        <PlanSwitcher
          onClose={() => setSidebarOpen(false)}
          plans={visiblePlans}
          activePlanId={planId}
          onSelectPlan={(id) => {
            setActive(id);
            setSelected(null);
            resetWindow();
            editor.close();
          }}
          onCreatePlan={() => createPlan(`Scenario ${visiblePlans.length + 1}`)}
          onRenamePlan={renamePlan}
          onDuplicatePlan={duplicatePlan}
          onDeletePlan={deletePlan}
        />
      )}

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}

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
          allEvents={stored.events}
          participants={stored.participants}
          accounts={stored.accounts}
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
