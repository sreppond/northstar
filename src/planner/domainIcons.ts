import type { ComponentType } from 'react';
import type { AccountClass, EventKind } from '@northstar/engine';
import {
  Briefcase,
  Gift,
  Landmark,
  Baby,
  Home,
  PauseCircle,
  Sunrise,
  Receipt,
  FlagTriangleRight,
  Wallet,
  TrendingUp,
  ShieldCheck,
  Sparkles,
  Box,
  CreditCard,
  HandCoins,
  Building2,
  Umbrella,
  type LucideProps,
} from 'lucide-react';

/**
 * Event kinds grouped onto a shared icon (`domainIcons.ts`, borrowed from
 * Northstar v2's `components/icons/domainIcons.ts`): shape carries the
 * distinction, not a new colour — "colour is data" stays intact, since these
 * render inside the existing tone-coloured badge (`ns-code-income` /
 * `ns-code-cost` / `ns-code-end`), same as the 3-letter codes they replace.
 * The same icon set doubles as the "Work status change"/"Expense" picker
 * glyphs in `EventDrawer.tsx` and the Gantt row glyph in `EventsTab.tsx` —
 * one vocabulary, reused rather than duplicated per surface.
 */
export const EVENT_ICON: Record<EventKind, ComponentType<LucideProps>> = {
  job: Briefcase,
  newJob: Briefcase,
  income: Landmark,
  windfall: Gift,
  socialSecurity: Landmark,
  annualExpense: Receipt,
  otherExpense: Receipt,
  haveAKid: Baby,
  buyAHome: Home,
  careerBreak: PauseCircle,
  retirement: Sunrise,
  endOfPlan: FlagTriangleRight,
};

/**
 * Account classes onto a shared icon, same vocabulary and same reasoning as
 * `EVENT_ICON` above — rendered bare (no colour badge) next to the balance
 * sheet's row label in `AccountsTab.tsx`, since a magnitude bar already
 * carries that row's colour; the icon adds shape, not a second hue.
 */
export const ACCOUNT_ICON: Record<AccountClass, ComponentType<LucideProps>> = {
  cash: Wallet,
  taxableInvestment: TrendingUp,
  taxDeferredInvestment: ShieldCheck,
  variableAnnuity: Umbrella,
  taxFreeInvestment: Sparkles,
  realEstate: Home,
  otherAsset: Box,
  creditCard: CreditCard,
  loan: HandCoins,
  mortgage: Building2,
};
