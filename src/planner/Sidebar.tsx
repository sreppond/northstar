import { Link, NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  CalendarRange,
  Sunrise,
  Home,
  Umbrella,
  Settings as SettingsIcon,
} from 'lucide-react';
import { usePlanner } from './PlannerContext';
import { ThemeToggle } from './ThemeToggle';
import { HeaderMenu } from './HeaderMenu';

/**
 * The persistent nav rail — Northstar v2's information architecture, ported
 * whole (docs/BORROW.md-style port): a fixed dark surface at every theme
 * (planner.css's `--rail-*` tokens, deliberately not redefined in the dark
 * blocks), real routes instead of the old header's `view` state, and the
 * plan switcher living directly under the brand mark rather than behind a
 * header badge. Collapses to a horizontal scroll strip below the `tablet`
 * breakpoint (planner.css's `@media (max-width: 1024px)`), matching v2's own
 * mobile treatment rather than a drawer/hamburger.
 *
 * Exported so `CommandPalette.tsx` can list the exact same destinations
 * rather than a second copy that could drift.
 */
export const NAV_ITEMS = [
  { to: '/overview', label: 'Overview', Icon: LayoutDashboard },
  { to: '/accounts', label: 'Accounts', Icon: Wallet },
  { to: '/cashflow', label: 'Cash Flow', Icon: ArrowLeftRight },
  { to: '/events', label: 'Events', Icon: CalendarRange },
  { to: '/retirement', label: 'Retirement', Icon: Sunrise },
  { to: '/house', label: 'House', Icon: Home },
  { to: '/annuity', label: 'Annuity', Icon: Umbrella },
] as const;

export function Sidebar() {
  const {
    stored,
    setSidebarOpen,
    setPaletteOpen,
    setAssumptionsDraft,
    undo,
    redo,
    canUndo,
    canRedo,
    setImporting,
    monarch,
  } = usePlanner();

  return (
    <nav className="ns-rail" aria-label="Primary">
      <Link to="/overview" className="ns-rail-brand">
        <img src="/favicon.png" alt="" width={22} height={22} />
        <span className="ns-rail-brand-word">Northstar</span>
      </Link>

      <button
        type="button"
        className="ns-rail-plan"
        onClick={() => setSidebarOpen(true)}
        title="Switch or manage plans"
      >
        {stored.name}
      </button>

      <div className="ns-rail-nav">
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `ns-rail-link${isActive ? ' active' : ''}`}
          >
            <Icon size={17} strokeWidth={1.75} aria-hidden />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>

      <div className="ns-rail-footer">
        <button
          type="button"
          className="ns-cmdk-stub"
          title="Command palette"
          onClick={() => setPaletteOpen(true)}
        >
          <kbd>⌘K</kbd>
        </button>
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
