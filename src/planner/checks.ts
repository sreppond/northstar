/**
 * Plan checks (docs/REDESIGN-V4.md §1.8): modelling mistakes the app can see
 * and the household can't — surfaced with a one-click fix, or a jump to the
 * thing to review, instead of a silently wrong forecast. Pure, so each check
 * is unit tested here rather than through a component.
 */
import type { Plan, PlanEvent } from '@northstar/engine';
import { DEFAULT_HORIZON_AGE, eventsPastHorizon, planEndYear, withHorizon } from '@northstar/engine';
import { joinNames } from './format';

export type PlanCheckAction =
  /** The plan with the problem fixed — handed straight to `replacePlan`. */
  | { kind: 'fix'; label: string; fixed: Plan; toast: string }
  | { kind: 'editEvent'; label: string; eventId: string }
  | { kind: 'editAccount'; label: string; accountId: string };

export interface PlanCheck {
  id: string;
  message: string;
  action?: PlanCheckAction;
}

/** Every check that applies, most consequential first. */
export function planChecks(plan: Plan): PlanCheck[] {
  return [
    horizonCheck(plan),
    rentAfterPurchaseCheck(plan),
    unearnedWagesCheck(plan),
    unownedIncomeCheck(plan),
    growthCheck(plan),
  ].filter((c): c is PlanCheck => c !== null);
}

/**
 * Events dated after the horizon never run: a retirement in 2058 inside a
 * plan that stops in 2046 just isn't in the forecast. The fix prefers the
 * lifetime horizon new plans default to; only if even that ends too early
 * does it fall back to "the latest event plus thirty years".
 */
export function horizonCheck(plan: Plan): PlanCheck | null {
  const late = eventsPastHorizon(plan);
  if (late.length === 0) return null;

  const end = planEndYear(plan);
  const latest = Math.max(...late.map((e) => e.startYear));
  const lifetime = withHorizon(plan, { mode: 'age', age: DEFAULT_HORIZON_AGE });
  const fixed =
    planEndYear(lifetime) >= latest ? lifetime : withHorizon(plan, { mode: 'year', year: latest + 30 });

  const message =
    late.length === 1
      ? `${late[0].name} (${late[0].startYear}) is after the plan ends in ${end}, so the forecast never reaches it.`
      : `${late.length} events are after the plan ends in ${end}, so the forecast never reaches them: ${late
          .map((e) => `${e.name} (${e.startYear})`)
          .join(', ')}.`;

  const through = planEndYear(fixed);
  return {
    id: 'horizon',
    message,
    action: { kind: 'fix', label: `Run through ${through}`, fixed, toast: `Plan now runs through ${through}` },
  };
}

/**
 * Buying a home adds a mortgage and carrying costs, but nothing takes the
 * rent away. With a budget, a housing line that never ends is the tell, and
 * the fix anchors it to the purchase. Without one, rent can only be hiding
 * inside the yearly living-expenses figure — said plainly, since the fix
 * there is splitting it out (the Budget page's job), not a click.
 */
export function rentAfterPurchaseCheck(plan: Plan): PlanCheck | null {
  const home = plan.events
    .filter((e) => e.kind === 'buyAHome' && e.isIncluded)
    .sort((a, b) => a.startYear - b.startYear)[0];
  if (!home) return null;

  const openHousing = (plan.budget ?? []).filter(
    (l) => l.isIncluded && l.category === 'housing' && l.kind !== 'saving' && !l.until,
  );
  if (openHousing.length > 0) {
    const ids = new Set(openHousing.map((l) => l.id));
    const fixed: Plan = {
      ...plan,
      budget: plan.budget!.map((l) => (ids.has(l.id) ? { ...l, until: { kind: 'event', eventId: home.id } } : l)),
    };
    return {
      id: 'rent-after-purchase',
      message: `${joinNames(openHousing.map((l) => l.name))} keeps going after ${home.name} (${home.startYear}), so the forecast pays for housing twice.`,
      action: { kind: 'fix', label: `End it in ${home.startYear}`, fixed, toast: `Housing now ends when you buy in ${home.startYear}` },
    };
  }

  const hasBudgetHousing = (plan.budget ?? []).some((l) => l.isIncluded && l.category === 'housing');
  if (!hasBudgetHousing && plan.settings.baselineExpenses > 0) {
    return {
      id: 'rent-after-purchase',
      message: `If your yearly living expenses include rent, it keeps going after ${home.name} (${home.startYear}) — the forecast would pay for housing twice.`,
    };
  }
  return null;
}

/** Recurring income lines that look like pay but that retirement and leave can't touch. */
function unearnedIncomes(plan: Plan): PlanEvent[] {
  return plan.events.filter(
    (e) =>
      e.kind === 'income' &&
      e.isIncluded &&
      !e.isHidden &&
      (e.config as { isEarned?: boolean }).isEarned !== true,
  );
}

/**
 * An `income` event not marked earned survives retirement, leave and a new
 * job — right for a rental or a pension, wrong for a salary. Only raised
 * once there is a retirement or a career break for it to slip past.
 */
export function unearnedWagesCheck(plan: Plan): PlanCheck | null {
  const stopsPay = plan.events.some((e) => e.isIncluded && (e.kind === 'retirement' || e.kind === 'careerBreak'));
  if (!stopsPay) return null;
  const lines = unearnedIncomes(plan);
  if (lines.length === 0) return null;

  const ids = new Set(lines.map((e) => e.id));
  const fixed: Plan = {
    ...plan,
    events: plan.events.map((e) => (ids.has(e.id) ? { ...e, config: { ...(e.config as object), isEarned: true } } : e)),
  };
  const names = joinNames(lines.map((e) => e.name));
  return {
    id: 'unearned-wages',
    message: `${names} ${lines.length === 1 ? "isn't" : "aren't"} marked as earned income, so retiring never stops ${lines.length === 1 ? 'it' : 'them'}. Right for a pension or rent; wrong for a paycheck.`,
    action: {
      kind: 'fix',
      label: lines.length === 1 ? 'Mark as earned' : 'Mark all as earned',
      fixed,
      toast: `${names} now ${lines.length === 1 ? 'stops' : 'stop'} at retirement`,
    },
  };
}

/** With two adults, pay that doesn't say whose it is can't follow one person's retirement or leave. */
export function unownedIncomeCheck(plan: Plan): PlanCheck | null {
  const adults = plan.participants.filter((p) => p.isIncluded && p.role !== 'child');
  if (adults.length < 2) return null;
  const unowned = plan.events.filter(
    (e) =>
      e.isIncluded &&
      !e.isHidden &&
      (e.kind === 'job' || e.kind === 'newJob' || e.kind === 'income') &&
      !(e.config as { participantId?: string }).participantId,
  );
  if (unowned.length === 0) return null;
  return {
    id: 'unowned-income',
    message: `${joinNames(unowned.map((e) => e.name))} ${unowned.length === 1 ? "doesn't" : "don't"} say whose ${unowned.length === 1 ? 'it is' : 'they are'}, so one of you retiring or taking leave can't be modelled on its own.`,
    action: { kind: 'editEvent', label: 'Set the person', eventId: unowned[0].id },
  };
}

/** A fixed return of 12% a year or more, compounded for decades, is the single biggest way to overstate a plan. */
export const HIGH_GROWTH_PERCENT = 12;

export function growthCheck(plan: Plan): PlanCheck | null {
  const high = plan.accounts.filter(
    (a) => a.isIncluded && !a.isLiability && a.growthRateMethod === 'fixed' && a.growthRate >= HIGH_GROWTH_PERCENT,
  );
  if (high.length === 0) return null;
  const top = Math.max(...high.map((a) => a.growthRate));
  return {
    id: 'high-growth',
    message: `${joinNames(high.map((a) => a.name))} ${high.length === 1 ? 'assumes' : 'assume'} up to ${top}% a year. Over 20 years that ends ${Math.round(Math.pow(1 + top / 100, 20) / Math.pow(1.07, 20))}× higher than 7% a year would.`,
    action: { kind: 'editAccount', label: 'Review', accountId: high[0].id },
  };
}
