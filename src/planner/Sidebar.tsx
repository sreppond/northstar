import { Fragment, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  CalendarRange,
  Sunrise,
  Home,
  Umbrella,
  TrendingUp,
  GitCompare,
  Table2,
  Settings as SettingsIcon,
  Search,
  ChevronsUpDown,
  Menu,
} from 'lucide-react';
import { usePlanner } from './PlannerContext';
import { useBreakpoint } from './useBreakpoint';
import { ThemeToggle } from './ThemeToggle';
import { HeaderMenu } from './HeaderMenu';

/**
 * The persistent nav rail's destinations, regrouped for v3
 * (docs/REDESIGN-V3.md "Target information architecture"): Overview stands
 * alone above every group; PLAN is the ledger someone authors (Accounts,
 * Cash Flow, Events); GOALS are the lenses that judge the ledger against a
 * target (Retirement, House, Annuity); ANALYSIS is reading about the plan
 * rather than editing it (Progress, Compare, Reports). The old rail mixed
 * the ledger and the goal lenses into one "plan" bucket — two different
 * jobs sharing one label.
 *
 * Exported so `CommandPalette.tsx` can list the exact same destinations
 * rather than a second copy that could drift.
 */
export const NAV_ITEMS = [
  { to: '/overview', label: 'Overview', Icon: LayoutDashboard, group: 'overview' },
  { to: '/accounts', label: 'Accounts', Icon: Wallet, group: 'plan' },
  { to: '/cashflow', label: 'Cash Flow', Icon: ArrowLeftRight, group: 'plan' },
  { to: '/events', label: 'Events', Icon: CalendarRange, group: 'plan' },
  { to: '/retirement', label: 'Retirement', Icon: Sunrise, group: 'goals' },
  { to: '/house', label: 'House', Icon: Home, group: 'goals' },
  { to: '/annuity', label: 'Annuity', Icon: Umbrella, group: 'goals' },
  { to: '/progress', label: 'Progress', Icon: TrendingUp, group: 'analysis' },
  { to: '/compare', label: 'Compare', Icon: GitCompare, group: 'analysis' },
  { to: '/reports', label: 'Reports', Icon: Table2, group: 'analysis' },
] as const;

const GROUP_LABELS: Record<string, string> = {
  plan: 'Plan',
  goals: 'Goals',
  analysis: 'Analysis',
};

/**
 * Picks the layout, not just the styling: a persistent column on desktop, a
 * 56px top bar with the full rail available as a sheet below the `tablet`
 * breakpoint (docs/REDESIGN-V3.md "Mobile"). Two real layouts driven from
 * one component beats one flexbox trying to be both — the old horizontal
 * icon-strip scrolled the plan name and half the destinations off-screen.
 */
export function Sidebar() {
  const isMobile = useBreakpoint() !== 'desktop';
  const [sheetOpen, setSheetOpen] = useState(false);
  const location = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sheetNavRef = useRef<HTMLElement>(null);

  // A route change means the sheet has done its job.
  useEffect(() => setSheetOpen(false), [location.pathname]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheetOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  // Focus management (docs/REDESIGN-V3.md review M13): opening the sheet
  // used to leave focus on the menu button, so Tab walked straight into the
  // page behind the scrim. `inert` on the two siblings the sheet floats
  // over keeps Tab (and a screen reader's virtual cursor) confined to the
  // dialog without hand-rolling a focus trap; closing restores focus to the
  // button that opened it, the same as any other disclosure in this app.
  useEffect(() => {
    if (!sheetOpen) return;
    const nav = sheetNavRef.current;
    const toFocus =
      nav?.querySelector<HTMLElement>('.ns-rail-link.active') ?? nav?.querySelector<HTMLElement>('.ns-rail-link');
    toFocus?.focus();

    const main = document.querySelector('.ns-main');
    const topbar = document.querySelector('.ns-topbar');
    main?.setAttribute('inert', '');
    topbar?.setAttribute('inert', '');

    return () => {
      main?.removeAttribute('inert');
      topbar?.removeAttribute('inert');
      menuButtonRef.current?.focus();
    };
  }, [sheetOpen]);

  if (!isMobile) return <RailContent className="ns-rail" />;

  return (
    <>
      <MobileTopBar onMenu={() => setSheetOpen(true)} menuRef={menuButtonRef} menuExpanded={sheetOpen} />
      {sheetOpen && (
        <>
          <div className="ns-rail-scrim" onClick={() => setSheetOpen(false)} />
          <RailContent
            className="ns-rail ns-rail-sheet"
            onNavigate={() => setSheetOpen(false)}
            sheet
            navRef={sheetNavRef}
          />
        </>
      )}
    </>
  );
}

function MobileTopBar({
  onMenu,
  menuRef,
  menuExpanded,
}: {
  onMenu(): void;
  menuRef: RefObject<HTMLButtonElement | null>;
  menuExpanded: boolean;
}) {
  return (
    <div className="ns-topbar">
      <Link to="/overview" className="ns-topbar-brand" aria-label="Northstar">
        <img src="/favicon.png" alt="" width={22} height={22} />
      </Link>
      <PlanSwitcherTrigger compact />
      <button
        ref={menuRef}
        type="button"
        className="ns-topbar-menu"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={menuExpanded}
        onClick={onMenu}
      >
        <Menu size={19} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

/** The plan switcher trigger: name + a mono "2026–2046 · 21 yrs" sub-label
    + a chevron, opening the existing plan-management overlay unchanged.
    `compact` drops the sub-label for the mobile top bar, which has no
    room for a second line next to the brand mark and menu button. */
function PlanSwitcherTrigger({ compact }: { compact?: boolean }) {
  const { stored, result, setSidebarOpen } = usePlanner();
  // +1: both end points count (X1, docs/REDESIGN-V3.md review) — 2026-2046
  // is 21 plan years, not the 20 a bare subtraction gives.
  const years = result.endYear - stored.settings.startYear + 1;

  return (
    <button
      type="button"
      className={`ns-rail-plan${compact ? ' ns-rail-plan-compact' : ''}`}
      onClick={() => setSidebarOpen(true)}
      title="Switch or manage plans"
    >
      <span className="ns-rail-plan-text">
        <span className="ns-rail-plan-name">{stored.name}</span>
        {!compact && (
          <span className="ns-rail-plan-sub ns-num">
            {stored.settings.startYear}–{result.endYear} · {years} yrs
          </span>
        )}
      </span>
      <ChevronsUpDown size={14} strokeWidth={1.75} aria-hidden className="ns-rail-plan-chevron" />
    </button>
  );
}

function RailContent({
  className,
  onNavigate,
  sheet,
  navRef,
}: {
  className: string;
  onNavigate?(): void;
  /** Rendered as the mobile sheet rather than the persistent column — picks
      up dialog semantics instead of plain nav landmark semantics (M13). */
  sheet?: boolean;
  navRef?: RefObject<HTMLElement | null>;
}) {
  const {
    stored,
    setPaletteOpen,
    setAssumptionsDraft,
    undo,
    redo,
    canUndo,
    canRedo,
    setImporting,
    monarch,
  } = usePlanner();

  // A quiet hint rather than hiding the destination: Annuity still opens to
  // its own EmptyState (docs/REDESIGN-V3.md "Annuity") when the plan has no
  // variableAnnuity account yet.
  const hasAnnuity = stored.accounts.some((a) => a.accountClass === 'variableAnnuity');

  const sheetProps = sheet
    ? { role: 'dialog' as const, 'aria-modal': true, 'aria-label': 'Navigation' }
    : { 'aria-label': 'Primary' };

  return (
    <nav ref={navRef} className={className} {...sheetProps}>
      <Link to="/overview" className="ns-rail-brand" onClick={onNavigate}>
        <img src="/favicon.png" alt="" width={22} height={22} />
        <span className="ns-rail-brand-word">Northstar</span>
      </Link>

      <PlanSwitcherTrigger />

      <button type="button" className="ns-rail-search" onClick={() => setPaletteOpen(true)}>
        <Search size={14} strokeWidth={1.75} aria-hidden />
        <span>Search or jump…</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="ns-rail-nav">
        {NAV_ITEMS.map(({ to, label, Icon, group }, i) => {
          // A group's eyebrow appears once, the moment the group changes —
          // keyed off the previous item rather than a fixed index so the
          // grouping stays correct if NAV_ITEMS is ever reordered. Overview
          // is its own group with no label: it isn't a member of PLAN,
          // GOALS or ANALYSIS.
          const showLabel = group !== 'overview' && group !== NAV_ITEMS[i - 1]?.group;
          return (
            <Fragment key={to}>
              {showLabel && <div className="ns-rail-eyebrow">{GROUP_LABELS[group]}</div>}
              <NavLink
                to={to}
                className={({ isActive }) => `ns-rail-link${isActive ? ' active' : ''}`}
                onClick={onNavigate}
              >
                <Icon size={17} strokeWidth={1.75} aria-hidden />
                <span>{label}</span>
                {to === '/annuity' && !hasAnnuity && <span className="ns-rail-link-hint">Add</span>}
              </NavLink>
            </Fragment>
          );
        })}
      </div>

      <div className="ns-rail-footer">
        <button
          type="button"
          className="ns-head-icon-btn"
          title="Settings"
          aria-label="Settings"
          onClick={() => setAssumptionsDraft(structuredClone(stored))}
        >
          <SettingsIcon size={17} strokeWidth={1.75} aria-hidden />
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
    </nav>
  );
}
