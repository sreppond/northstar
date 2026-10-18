/**
 * The A/B "compare" sentence — docs/BORROW.md §6.
 *
 * Two stacked lists: what changed between two plans, and what it cost. Both
 * read from the same specs the drawers and hover cards already render from
 * (`ACCOUNT_TYPES`, `EVENT_MODULES`, `describeSchema`) — same discipline as
 * `detail.ts`, so a field added to a schema shows up here automatically
 * instead of silently going undiffed.
 *
 * Every changed field prints as "label OLD → NEW" rather than mixing that
 * with signed deltas for some fields and arrows for others — one format,
 * everywhere, even where BORROW.md's own examples used a delta ("+$18,000").
 * Consistent beats clever for something meant to be scanned at a glance.
 */
import type { Account, AccountFieldSpec, Plan, PlanEvent, PlanResult } from '@northstar/engine';
import { ACCOUNT_TYPES, EVENT_MODULES, pathMarkers } from '@northstar/engine';
import { describeSchema, type FieldDescriptor } from './drawer/schemaForm';
import { formatAccountValue, formatUnit } from './detail';
import { signedMoney } from './format';

export interface PlanChange {
  kind: 'settings' | 'account' | 'event' | 'rule';
  verb: 'added' | 'removed' | 'changed';
  sentence: string;
}

export interface OutcomeChange {
  label: string;
  sentence: string;
}

const SETTINGS_FIELDS: {
  key: 'baselineIncome' | 'baselineExpenses' | 'inflationRate' | 'incomeTaxRate' | 'projectionYears';
  label: string;
  unit: 'currency' | 'percent' | 'plain' | 'years';
}[] = [
  { key: 'baselineIncome', label: 'Baseline income', unit: 'currency' },
  { key: 'baselineExpenses', label: 'Baseline expenses', unit: 'currency' },
  { key: 'inflationRate', label: 'Inflation rate', unit: 'percent' },
  { key: 'incomeTaxRate', label: 'Income tax rate', unit: 'percent' },
  // V5-REVIEW-2 N12: "Projection years 66 → 21" read as engine jargon; the
  // sentence is now "Plan length 66 → 21 years".
  { key: 'projectionYears', label: 'Plan length', unit: 'years' },
];

/** "What's different" — a pure structural diff over two whole `Plan` objects. */
export function diffPlans(a: Plan, b: Plan): PlanChange[] {
  const changes: PlanChange[] = [];
  const names = nameLookup(a, b);

  for (const f of SETTINGS_FIELDS) {
    const av = a.settings[f.key];
    const bv = b.settings[f.key];
    if (av === bv) continue;
    changes.push({
      kind: 'settings',
      verb: 'changed',
      sentence: `${f.label} ${fmtSetting(av, f.unit)} → ${fmtSetting(bv, f.unit)}`,
    });
  }

  if (a.settings.dollarMode !== b.settings.dollarMode) {
    changes.push({
      kind: 'settings',
      verb: 'changed',
      sentence: `Display dollars ${dollarModeLabel(a.settings.dollarMode)} → ${dollarModeLabel(b.settings.dollarMode)}`,
    });
  }

  changes.push(...diffAccounts(a.accounts, b.accounts));
  changes.push(...diffEvents(a.events, b.events, names));

  if (JSON.stringify(a.rules) !== JSON.stringify(b.rules)) {
    changes.push({ kind: 'rule', verb: 'changed', sentence: 'Priority rules changed' });
  }

  return changes;
}

/**
 * "What it costs" — the two plans re-run, compared at the last year both
 * of them model (the chart clips a longer plan the same way, docs/NEXT.md).
 */
export function diffOutcomes(active: PlanResult, compare: PlanResult): OutcomeChange[] {
  const out: OutcomeChange[] = [];

  // V5-REVIEW-2 N12: compare net worth at the last year BOTH plans have and
  // say which year that is. Reading the active plan's last year off a shorter
  // comparison plan put "+$3.99M at 2091" against a plan that ends in 2086.
  const lastShared = Math.min(active.years.at(-1)?.year ?? Infinity, compare.years.at(-1)?.year ?? Infinity);
  const activeAt = active.years.find((y) => y.year === lastShared)?.netWorth;
  const compareAt = compare.years.find((y) => y.year === lastShared)?.netWorth;
  if (activeAt !== undefined && compareAt !== undefined) {
    const delta = compareAt - activeAt;
    if (Math.abs(delta) > 500) {
      out.push({ label: 'Net worth', sentence: `${signedMoney(delta)} at ${lastShared}` });
    }
  }

  const activeFirstShortfall = pathMarkers(active).shortfallYears[0];
  const compareFirstShortfall = pathMarkers(compare).shortfallYears[0];
  if (activeFirstShortfall !== compareFirstShortfall) {
    out.push({
      label: 'First shortfall',
      sentence: `${activeFirstShortfall ?? 'never'} → ${compareFirstShortfall ?? 'never'}`,
    });
  }

  return out;
}

function dollarModeLabel(mode: string): string {
  return mode === 'todaysDollars' ? "today's dollars" : 'future dollars';
}

function diffAccounts(as: Account[], bs: Account[]): PlanChange[] {
  const changes: PlanChange[] = [];
  const bById = new Map(bs.map((acc) => [acc.id, acc]));
  const seen = new Set<string>();

  for (const a of as) {
    seen.add(a.id);
    const b = bById.get(a.id);
    if (!b) {
      changes.push({ kind: 'account', verb: 'removed', sentence: `Removes ${a.name}` });
      continue;
    }
    changes.push(...diffOneAccount(a, b));
  }
  for (const b of bs) {
    if (!seen.has(b.id)) {
      changes.push({ kind: 'account', verb: 'added', sentence: `Adds ${b.name}` });
    }
  }
  return changes;
}

function diffOneAccount(a: Account, b: Account): PlanChange[] {
  if (a.accountClass !== b.accountClass) {
    return [
      {
        kind: 'account',
        verb: 'changed',
        sentence: `${a.name}: ${ACCOUNT_TYPES[a.accountClass].label} → ${ACCOUNT_TYPES[b.accountClass].label}`,
      },
    ];
  }

  const changes: PlanChange[] = [];
  for (const field of ACCOUNT_TYPES[a.accountClass].fields) {
    const av = a[field.key];
    const bv = b[field.key];
    if (av === undefined && bv === undefined) continue;
    if (deepEqual(av, bv)) continue;
    changes.push({
      kind: 'account',
      verb: 'changed',
      sentence: `${a.name} — ${field.label} ${fmtAccount(av, field)} → ${fmtAccount(bv, field)}`,
    });
  }
  return changes;
}

function diffEvents(as: PlanEvent[], bs: PlanEvent[], names: Names): PlanChange[] {
  const changes: PlanChange[] = [];
  const bById = new Map(bs.map((e) => [e.id, e]));
  const seen = new Set<string>();

  for (const a of as) {
    seen.add(a.id);
    const b = bById.get(a.id);
    if (!b) {
      changes.push({ kind: 'event', verb: 'removed', sentence: `Removes ${a.name} (${a.startYear})` });
      continue;
    }
    changes.push(...diffOneEvent(a, b, names));
  }
  for (const b of bs) {
    if (!seen.has(b.id)) {
      changes.push({ kind: 'event', verb: 'added', sentence: `Adds ${b.name} (${b.startYear})` });
    }
  }
  return changes;
}

function diffOneEvent(a: PlanEvent, b: PlanEvent, names: Names): PlanChange[] {
  const changes: PlanChange[] = [];

  if (a.startYear !== b.startYear) {
    changes.push({
      kind: 'event',
      verb: 'changed',
      sentence: `${a.name} moves ${a.startYear} → ${b.startYear}`,
    });
  }

  // A changed kind under the same id should not happen — ids are generated
  // per-kind — but stay defensive rather than diff two unrelated schemas.
  if (a.kind !== b.kind) return changes;

  const fields = describeSchema(EVENT_MODULES[a.kind].schema);
  const ac = (a.config ?? {}) as Record<string, unknown>;
  const bc = (b.config ?? {}) as Record<string, unknown>;

  for (const field of fields) {
    // A record/object field (e.g. per-line retention percentages) has no
    // generic one-line summary — same reason the generated form skips it.
    if (field.kind === 'custom') continue;
    const av = ac[field.name];
    const bv = bc[field.name];
    if (av === undefined && bv === undefined) continue;
    if (deepEqual(av, bv)) continue;
    changes.push({
      kind: 'event',
      verb: 'changed',
      sentence: `${a.name} — ${field.label} ${fmtEvent(av, field, names)} → ${fmtEvent(bv, field, names)}`,
    });
  }

  return changes;
}

function fmtAccount(raw: unknown, field: AccountFieldSpec): string {
  if (raw === undefined || raw === null) return '—';
  return formatAccountValue(raw, field);
}

function fmtEvent(raw: unknown, field: FieldDescriptor, names: Names): string {
  if (raw === undefined || raw === null || raw === '') return '—';
  // V5-REVIEW-2 N12: a reference field holds an id ("p1"); the diff prints
  // what the person sees in the app, never the id itself.
  if (typeof raw === 'string' && /Id$/.test(field.name)) return names.resolve(field.name, raw);
  return formatUnit(raw, field.unit);
}

function fmtSetting(raw: unknown, unit: 'currency' | 'percent' | 'plain' | 'years'): string {
  if (unit === 'years') {
    const n = Number(raw);
    return Number.isFinite(n) ? `${n} ${n === 1 ? 'year' : 'years'}` : String(raw);
  }
  return formatUnit(raw, unit);
}

interface Names {
  resolve(fieldName: string, id: string): string;
}

/**
 * Id -> display name across BOTH plans (an id may exist on one side only: a
 * removed or added person), so the diff never has to show a raw id.
 */
function nameLookup(a: Plan, b: Plan): Names {
  const people = new Map<string, string>();
  const accounts = new Map<string, string>();
  const events = new Map<string, string>();
  for (const plan of [a, b]) {
    for (const p of plan.participants) people.set(p.id, p.name);
    for (const acc of plan.accounts) accounts.set(acc.id, acc.name);
    for (const e of plan.events) events.set(e.id, e.name);
  }
  return {
    resolve(fieldName, id) {
      if (/^participant|owner/i.test(fieldName)) return people.get(id) ?? '(removed)';
      if (/account/i.test(fieldName)) return accounts.get(id) ?? '(removed)';
      if (/event/i.test(fieldName)) return events.get(id) ?? '(removed)';
      return people.get(id) ?? accounts.get(id) ?? events.get(id) ?? '(removed)';
    },
  };
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
