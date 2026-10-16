/**
 * The rail's destinations, in order (docs/REDESIGN-V5.md §2). Its own module
 * so `Sidebar`, `shortcuts` (⌘1–⌘7) and the command palette can all read it
 * without importing each other — the Sidebar ↔ shortcuts cycle used to make
 * every hot reload of the rail fail.
 */
import {
  ArrowLeftRight,
  CalendarRange,
  GitCompare,
  Home,
  PiggyBank,
  Sunrise,
  Table2,
  TrendingUp,
  Umbrella,
} from 'lucide-react';

/**
 * v5 has 7 main destinations plus 2 under More (docs/REDESIGN-V5.md §2),
 * down from 12. `main` is where you read the plan; `decisions` are the
 * lenses that judge it against a choice (Home, Retirement, Annuity & SEPP);
 * `more` is reference material, drawn smaller and quieter.
 *
 * The order is load-bearing: ⌘1–⌘7 are the first seven entries
 * (`shortcuts.ts`), so `more` entries, which come last, get no number.
 *
 * Exported so `CommandPalette.tsx` can list the exact same destinations
 * rather than a second copy that could drift.
 */
export const NAV_ITEMS = [
  { to: '/net-worth', label: 'Net Worth', Icon: TrendingUp, group: 'main' },
  { to: '/cashflow', label: 'Cash Flow', Icon: ArrowLeftRight, group: 'main' },
  { to: '/budget', label: 'Budget', Icon: PiggyBank, group: 'main' },
  { to: '/timeline', label: 'Timeline', Icon: CalendarRange, group: 'main' },
  { to: '/house', label: 'Home', Icon: Home, group: 'decisions' },
  { to: '/retirement', label: 'Retirement', Icon: Sunrise, group: 'decisions' },
  { to: '/annuity', label: 'Annuity & SEPP', Icon: Umbrella, group: 'decisions' },
  // Q1 default (docs/REDESIGN-V5.md §9): the Compare page stays, renamed.
  { to: '/compare', label: 'Scenarios', Icon: GitCompare, group: 'more' },
  { to: '/reports', label: 'Reports', Icon: Table2, group: 'more' },
] as const;

export type NavGroup = (typeof NAV_ITEMS)[number]['group'];

/** `main` has no label: the four pages everyone uses need no heading. */
export const GROUP_LABELS: Record<NavGroup, string | undefined> = {
  main: undefined,
  decisions: 'Decisions',
  more: 'More',
};
