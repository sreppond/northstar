/**
 * How engine concepts are presented. Kept out of the engine on purpose: codes,
 * colours and copy are UI decisions and must not leak into the projection.
 */
import type { EventKind, PlanEvent } from '@northstar/engine';
import { EVENT_MODULES } from '@northstar/engine';

export type EventTone = 'income' | 'cost' | 'end';

/**
 * The semantic colour rule (docs/PLAN.md §7.2): pin colour encodes what the
 * event does to cash, so the pin row reads as a cash-flow narrative.
 *
 * `retirement` is the ambiguous one — it stops income AND changes spending.
 * It is filed as a cost so the row stays a clean "what costs money" scan.
 */
const TONE: Record<EventKind, EventTone> = {
  income: 'income',
  newJob: 'income',
  windfall: 'income',
  socialSecurity: 'income',
  annualExpense: 'cost',
  otherExpense: 'cost',
  haveAKid: 'cost',
  buyAHome: 'cost',
  careerBreak: 'cost',
  retirement: 'cost',
  endOfPlan: 'end',
};

export function toneFor(kind: EventKind): EventTone {
  return TONE[kind] ?? 'cost';
}

export function codeFor(kind: EventKind): string {
  return EVENT_MODULES[kind]?.code ?? '···';
}

export function labelFor(kind: EventKind): string {
  return EVENT_MODULES[kind]?.label ?? kind;
}

/** One-line summary shown on a Gantt bar and in the selection footer. */
export function summarize(event: PlanEvent): string {
  const c = (event.config ?? {}) as Record<string, number | undefined>;
  switch (event.kind) {
    case 'buyAHome':
      return [
        money(c.price),
        c.downPaymentPercent !== undefined ? `${c.downPaymentPercent}% down` : null,
        c.mortgageRate !== undefined && c.termYears !== undefined
          ? `${c.mortgageRate}% / ${c.termYears}yr`
          : null,
      ]
        .filter(Boolean)
        .join(', ');
    case 'newJob':
      return [
        c.salary !== undefined ? `${money(c.salary)}/yr` : null,
        c.annualRaise ? `${c.annualRaise}% growth` : null,
      ]
        .filter(Boolean)
        .join(', ');
    case 'haveAKid':
      return [
        c.firstYearCost !== undefined ? `${money(c.firstYearCost)} year one` : null,
        c.annualCost !== undefined ? `${money(c.annualCost)}/yr after` : null,
      ]
        .filter(Boolean)
        .join(', ');
    case 'income':
      return c.amount !== undefined ? `+${money(c.amount)}/yr` : '';
    case 'windfall':
      return c.amount !== undefined ? `+${money(c.amount)} one-time` : '';
    case 'socialSecurity':
      return c.annualBenefit !== undefined ? `${money(c.annualBenefit)}/yr` : '';
    case 'annualExpense':
      return c.amount !== undefined ? `${money(c.amount)}/yr` : '';
    case 'otherExpense':
      return c.amount !== undefined ? `${money(c.amount)} one-time` : '';
    case 'careerBreak':
      return c.durationYears !== undefined ? `${c.durationYears}yr break` : '';
    case 'retirement':
      return c.spendingChangePercent !== undefined
        ? `spending ${c.spendingChangePercent > 0 ? '+' : ''}${c.spendingChangePercent}%`
        : '';
    case 'endOfPlan':
      return 'Projection horizon';
    default:
      return '';
  }
}

function money(value: number | undefined): string {
  if (value === undefined) return '';
  const abs = Math.abs(value);
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${Math.round(value / 1e3)}K`;
  return `$${Math.round(value)}`;
}
