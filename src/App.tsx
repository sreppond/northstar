import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './planner/planner.css';
import './planner/ui/ui.css';
import './planner/pages/analysis.css';

import { usePlanStore } from './planner/store/planStore';
import { PlannerProvider, usePlanner } from './planner/PlannerContext';
import { Sidebar } from './planner/Sidebar';
import { PlanSwitcher } from './planner/PlanSwitcher';
import { CommandPalette } from './planner/CommandPalette';
import { ShortcutSheet } from './planner/ShortcutSheet';
import { ToastRegion, toast } from './planner/ui/Toast';
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
    localMonarch,
    progressPoints,
    upsertProgressPoint,
    deleteProgressPoint,
    undo,
    accountDraft,
    setAccountDraft,
    assumptionsDraft,
    setAssumptionsDraft,
  } = usePlanner();

  return (
    <div className="ns">
      <Sidebar />

      <main className="ns-main">
        {/* Real height only under `html.ns-tauri` (planner.css) — a no-op
            div everywhere else, same idiom as `Sidebar.tsx`'s rail strip. */}
        <div className="ns-drag-strip" data-tauri-drag-region />
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

      <ShortcutSheet />
      <ToastRegion />

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
          // A snapshot `scripts/monarch-sync.mjs` already dropped on disk
          // (docs/ROADMAP-10.md Track B/C4) — `ImportDrawer` prefers `fetched`
          // when both are present, so this only ever prefills when there is
          // no server-fetched capture already on screen. The Overview
          // "Review" banner (`OverviewPage.tsx`) opens this same drawer via
          // `setImporting(true)`; it does nothing else, since the snapshot
          // itself flows through here.
          localSnapshot={localMonarch.snapshot}
          onImport={(next, overrides, progressPoint) => {
            // Re-importing the same day's capture updates that day's point
            // rather than piling up a second one at the same date.
            const previousPoint = progressPoints.find((p) => p.date === progressPoint.date);
            // Only the LOCAL snapshot's own "new" state should clear —
            // a server-fetched import (`monarch.fetched` was set) never came
            // from `useLocalMonarch` in the first place, so it has nothing to
            // mark applied.
            const willMarkApplied = !monarch.fetched && Boolean(localMonarch.snapshot);
            const previousAppliedAt = localMonarch.lastAppliedAt;

            // No `toastMessage` here — an import's Undo has to revert more
            // than the plan (the Progress point it upserted, and the
            // "applied" marker), so this fires its own toast below instead
            // of `replacePlan`'s single-entry one (docs/W3-REVIEW.md #8).
            replacePlan({ ...next, settings: { ...next.settings, monarchOverrides: overrides } });
            upsertProgressPoint(previousPoint ? { ...progressPoint, id: previousPoint.id } : progressPoint);
            if (willMarkApplied && localMonarch.snapshot) {
              localMonarch.markApplied(localMonarch.snapshot.capturedAt);
            }

            toast('Imported Monarch snapshot', {
              action: {
                label: 'Undo',
                onClick: () => {
                  undo();
                  if (previousPoint) {
                    upsertProgressPoint(previousPoint);
                  } else {
                    deleteProgressPoint(progressPoint.id);
                  }
                  if (willMarkApplied) {
                    localMonarch.resetApplied(previousAppliedAt);
                  }
                },
              },
            });

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
