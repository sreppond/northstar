/**
 * The detail model behind every hover card.
 *
 * One shape, three builders. The principle: hovering something shows the
 * assumptions behind it, and clicking through edits those same assumptions —
 * so both must read from ONE spec. An account's card is rendered from the very
 * field list its settings drawer edits; an event's card from the very zod
 * schema its form is generated from. They cannot drift.
 */
import type { Account, Participant, Plan, PlanEvent } from '@northstar/engine';
import { ACCOUNT_TYPES, EVENT_MODULES, visibleFields } from '@northstar/engine';
import type { AccountFieldSpec, FieldUnit } from '@northstar/engine';
import { describeSchema } from './drawer/schemaForm';
import { toneFor } from './presentation';
import { detailMoney, roundMoney } from './format';

export interface DetailRow {
  label: string;
  value: string;
}

export interface DetailSection {
  heading?: string;
  rows: DetailRow[];
}

export interface Detail {
  title: string;
  sections: DetailSection[];
}

// --- plan assumptions -------------------------------------------------------

export function planDetail(plan: Plan, endYear: number): Detail {
  const sections: DetailSection[] = [];
  const s = plan.settings;
  const people = plan.participants.filter((x) => x.isIncluded);

  // With one person their name is the card title and their rows lead; with a
  // household the plan name leads and each person gets their own section.
  const solo = people.length === 1 ? people[0] : undefined;

  for (const p of people) {
    sections.push({
      heading: solo ? undefined : p.name,
      rows: [
        { label: 'Current age', value: String(s.startYear - p.birthYear) },
        { label: 'Retirement age', value: retirementAge(plan, p) },
        { label: 'Life expectancy', value: String(p.lifeExpectancy) },
      ],
    });
  }

  sections.push({
    heading: 'Assumptions',
    rows: [
      { label: 'Yearly take-home income', value: detailMoney(takeHomeIncome(plan)) },
      { label: 'Yearly living expenses', value: detailMoney(s.baselineExpenses) },
      { label: 'Yearly inflation rate', value: `${s.inflationRate}%` },
      { label: 'Income tax rate', value: `${s.incomeTaxRate}%` },
      {
        label: 'Future values',
        value: s.dollarMode === 'todaysDollars' ? "Today's dollars" : 'Future dollars',
      },
      { label: 'Projection ends', value: String(endYear) },
    ],
  });

  return { title: solo ? solo.name : plan.name, sections };
}

function retirementAge(plan: Plan, participant: Participant): string {
  const event = plan.events.find((e) => e.kind === 'retirement' && e.isIncluded);
  if (!event) return 'Not set';
  return String(event.startYear - participant.birthYear);
}

/**
 * Baseline income plus the earned income of any event running in the first
 * plan year — the figure a person would recognise as "what I take home now".
 */
function takeHomeIncome(plan: Plan): number {
  const year = plan.settings.startYear;
  let total = plan.settings.baselineIncome;
  for (const event of plan.events) {
    if (!event.isIncluded || event.startYear > year) continue;
    const config = (event.config ?? {}) as Record<string, number | undefined>;
    if (event.kind === 'income' && (config.endYear ?? Infinity) >= year) {
      total += config.amount ?? 0;
    }
    if (event.kind === 'newJob' && (config.endYear ?? Infinity) >= year) {
      total += config.salary ?? 0;
    }
  }
  return total;
}

// --- event ------------------------------------------------------------------

export function eventDetail(event: PlanEvent): Detail {
  const mod = EVENT_MODULES[event.kind];
  const parsed = mod.schema.safeParse(event.config ?? {});
  const config = (parsed.success ? parsed.data : (event.config ?? {})) as Record<string, unknown>;
  const fields = describeSchema(mod.schema);

  const rows: DetailRow[] = [{ label: 'Year', value: String(event.startYear) }];
  const detailRows: DetailRow[] = [];

  for (const field of fields) {
    const raw = config[field.name];
    if (raw === undefined || raw === null || raw === '') continue;
    detailRows.push({ label: field.label, value: formatUnit(raw, field.unit) });
  }

  const sections: DetailSection[] = [{ rows }];
  if (detailRows.length > 0) {
    sections.push({ heading: toneFor(event.kind) === 'income' ? 'Income' : 'Expenses', rows: detailRows });
  }

  return { title: event.name, sections };
}

// --- account ----------------------------------------------------------------

export function accountDetail(account: Account, closingBalance?: number): Detail {
  const spec = ACCOUNT_TYPES[account.accountClass];
  const rows: DetailRow[] = [];

  if (closingBalance !== undefined) {
    rows.push({ label: 'Balance this year', value: detailMoney(closingBalance) });
  }

  for (const field of visibleFields(spec, account)) {
    const raw = account[field.key];
    if (raw === undefined || raw === null) continue;
    rows.push({ label: field.label, value: formatAccountValue(raw, field) });
  }

  return {
    title: spec.label,
    sections: [{ rows }],
  };
}

const GROWTH_LABEL: Record<string, string> = {
  fixed: 'Fixed rate',
  noChange: 'No change',
  schedule: 'Scheduled',
};

const TIMING_LABEL: Record<string, string> = {
  always: 'Any time',
  never: 'Never',
  starting_year: 'From a set year',
};

function formatAccountValue(raw: unknown, field: AccountFieldSpec): string {
  if (field.kind === 'growthMethod') return GROWTH_LABEL[String(raw)] ?? String(raw);
  if (field.kind === 'withdrawalTiming') return TIMING_LABEL[String(raw)] ?? String(raw);
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  return formatUnit(raw, field.unit);
}

export function formatUnit(raw: unknown, unit: FieldUnit | 'plain'): string {
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (typeof raw !== 'number') return String(raw);

  switch (unit) {
    case 'currency':
      return roundMoney(raw);
    case 'percent':
      return `${trim(raw)}%`;
    case 'year':
      return String(Math.round(raw));
    case 'age':
      return `${trim(raw)}`;
    default:
      return trim(raw);
  }
}

function trim(value: number): string {
  return String(Number(value.toFixed(2)));
}
