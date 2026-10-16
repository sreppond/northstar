/**
 * The rail's destinations, in order (docs/REDESIGN-V4.md §2). Its own module
 * so `Sidebar`, `shortcuts` (⌘1–⌘9) and the command palette can all read it
 * without importing each other — the Sidebar ↔ shortcuts cycle used to make
 * every hot reload of the rail fail.
 */
import {
  ArrowLeftRight,
  CalendarRange,
  GitCompare,
  Home,
  LayoutDashboard,
  PiggyBank,
  Sunrise,
  Table2,
  TrendingUp,
  Umbrella,
  Users,
  Wallet,
} from 'lucide-react';

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
  { to: '/budget', label: 'Budget', Icon: PiggyBank, group: 'plan' },
  { to: '/family', label: 'Family', Icon: Users, group: 'plan' },
  { to: '/accounts', label: 'Accounts', Icon: Wallet, group: 'plan' },
  { to: '/cashflow', label: 'Cash Flow', Icon: ArrowLeftRight, group: 'plan' },
  { to: '/events', label: 'Events', Icon: CalendarRange, group: 'plan' },
  { to: '/retirement', label: 'Retirement', Icon: Sunrise, group: 'goals' },
  { to: '/house', label: 'Home', Icon: Home, group: 'goals' },
  { to: '/annuity', label: 'Annuity', Icon: Umbrella, group: 'goals' },
  { to: '/progress', label: 'Progress', Icon: TrendingUp, group: 'analysis' },
  { to: '/compare', label: 'Compare', Icon: GitCompare, group: 'analysis' },
  { to: '/reports', label: 'Reports', Icon: Table2, group: 'analysis' },
] as const;

export const GROUP_LABELS: Record<string, string> = {
  // docs/REDESIGN-V4.md §2: who you are and what you spend.
  plan: 'Household',
  // The questions you're answering (docs/REDESIGN-V4.md §2).
  goals: 'Decisions',
  analysis: 'Analysis',
};
