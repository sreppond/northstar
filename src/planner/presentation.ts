/**
 * How engine concepts are presented. Kept out of the engine on purpose: codes,
 * colours and copy are UI decisions and must not leak into the projection.
 */
import type { EventKind, PlanEvent } from '@northstar/engine';
import { EVENT_MODULES } from '@northstar/engine';
import { money as formatMoney } from './format';

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
  job: 'income',
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
    case 'job':
    case 'newJob':
      return [
        c.salary !== undefined ? `${money(c.salary)}/yr` : null,
        c.annualRaise ? `${c.annualRaise}% growth` : null,
      ]
        .filter(Boolean)
        .join(', ');
    case 'haveAKid':
      return [
        c.annualCost !== undefined ? `${money(c.annualCost)}/yr` : null,
        c.supportYears !== undefined ? `${c.supportYears}yrs` : null,
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

/** `format.ts`'s `money`, tolerant of an event field that hasn't been set
    (docs/ROADMAP-10.md C2 — one number language, not a second money
    formatter living beside it). */
function money(value: number | undefined): string {
  return value === undefined ? '' : formatMoney(value);
}
