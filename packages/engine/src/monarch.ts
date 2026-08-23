/**
 * Importing a Monarch balance sheet into a plan.
 *
 * Monarch and Northstar disagree about what an account IS, and the whole of
 * this module is that disagreement resolved in one place:
 *
 *  - Monarch has one row per LINKED INSTITUTION — three brokerages, two cards.
 *    Northstar has one row per ASSET CLASS (accountTypes.ts). So the import
 *    folds many Monarch rows into one Northstar account per class.
 *  - Monarch signs liabilities negative. Northstar keeps positive magnitudes
 *    and distinguishes debt with `isLiability` (types.ts). So balances are
 *    taken as magnitudes.
 *  - Monarch knows what you HAVE. It does not know what you EXPECT. So an
 *    import writes `initialBalance` and nothing else: growth rates, tax rates,
 *    penalties and withdrawal timing are the user's assumptions and survive
 *    every refresh untouched. This is the rule the whole design turns on —
 *    an import that reset `growthRate` to some Monarch-derived trailing return
 *    would silently overwrite the modelling judgement that is the entire point
 *    of the tool.
 *
 * The snapshot is captured OUTSIDE the browser (Monarch's API is not
 * CORS-open and the session token must never reach a client bundle), so what
 * arrives here is untrusted pasted JSON. Hence zod: `parseSnapshot` is the
 * only door in.
 */
import { z } from 'zod';
import { ACCOUNT_TYPES } from './accountTypes.js';
import type { Account, AccountClass, Plan } from './types.js';

// ---------------------------------------------------------------------------
// The snapshot contract
// ---------------------------------------------------------------------------

/**
 * One linked account as `get_accounts` reports it. Field names are snake_case
 * to match the MCP tool's own JSON, so a captured response can be handed over
 * with no reshaping — the fewer transformations between Monarch and here, the
 * fewer places for a mapping to rot.
 *
 * `subtype`, `interest_rate` and `planned_payment` are optional because
 * `get_accounts` does NOT currently return them. They are honoured when a
 * richer capture supplies them and never invented when it does not.
 */
export const monarchAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Monarch's `type.name`: depository, brokerage, credit, loan, … */
  type: z.string().nullable().optional(),
  /** Monarch's `subtype.name`: 401k, roth, checking, mortgage, … */
  subtype: z.string().nullable().optional(),
  balance: z.number().nullable().optional(),
  institution: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  is_hidden: z.boolean().optional(),
  interest_rate: z.number().nullable().optional(),
  planned_payment: z.number().nullable().optional(),
});

export type MonarchAccount = z.infer<typeof monarchAccountSchema>;

/**
 * Cashflow normalised at capture time rather than here. `get_cashflow`'s
 * response shape has moved more than once; pinning it inside the engine would
 * make a Monarch-side change a failing build in a pure projection package.
 * Normalising at the edge keeps this module a function of its arguments.
 */
export const monarchCashflowSchema = z.object({
  income: z.number(),
  expenses: z.number(),
  /** Months the two figures span. Annualisation divides by this. */
  months: z.number().positive(),
});

export const monarchSnapshotSchema = z.object({
  /** ISO date the capture was taken. Shown so a stale import is visible. */
  capturedAt: z.string(),
  accounts: z.array(monarchAccountSchema),
  cashflow: monarchCashflowSchema.optional(),
  /**
   * Per-account class assignment, keyed by Monarch account id.
   *
   * This exists because `get_accounts` returns `type` but not `subtype`, so a
   * 401(k), a Roth IRA and a taxable brokerage all arrive as `brokerage` —
   * indistinguishable in the one dimension the engine's tax model turns on.
   * Rather than guess, unresolved brokerages are reported as `needsChoice`
   * and the answer is recorded here, where it survives the next refresh.
   */
  overrides: z.record(z.string(), z.string()).optional(),
});

export type MonarchSnapshot = z.infer<typeof monarchSnapshotSchema>;

/** Parse untrusted JSON into a snapshot. Throws `z.ZodError` on bad input. */
export function parseSnapshot(raw: unknown): MonarchSnapshot {
  return monarchSnapshotSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Monarch `type.name` → account class, where the type alone settles it. */
const BY_TYPE: Record<string, AccountClass> = {
  depository: 'cash',
  credit: 'creditCard',
  loan: 'loan',
  real_estate: 'realEstate',
  vehicle: 'otherAsset',
  valuables: 'otherAsset',
  other_asset: 'otherAsset',
  other_liability: 'loan',
};

/**
 * Monarch `subtype.name` → account class. Subtype is the only field that can
 * tell the three investment tax treatments apart, so when it is present it
 * wins over the type.
 */
const BY_SUBTYPE: Record<string, AccountClass> = {
  // tax-deferred
  '401k': 'taxDeferredInvestment',
  '403b': 'taxDeferredInvestment',
  '457b': 'taxDeferredInvestment',
  ira: 'taxDeferredInvestment',
  sep_ira: 'taxDeferredInvestment',
  simple_ira: 'taxDeferredInvestment',
  pension: 'taxDeferredInvestment',
  // tax-free
  roth: 'taxFreeInvestment',
  roth_401k: 'taxFreeInvestment',
  roth_ira: 'taxFreeInvestment',
  hsa: 'taxFreeInvestment',
  '529': 'taxFreeInvestment',
  // taxable
  brokerage: 'taxableInvestment',
  taxable: 'taxableInvestment',
  // cash
  checking: 'cash',
  savings: 'cash',
  money_market: 'cash',
  cd: 'cash',
  // debt
  mortgage: 'mortgage',
  student: 'loan',
  auto: 'loan',
  credit_card: 'creditCard',
};

export type Classification =
  | { kind: 'mapped'; accountClass: AccountClass; via: 'override' | 'subtype' | 'type' }
  | { kind: 'needsChoice'; candidates: AccountClass[] }
  | { kind: 'unknown' };

const ALL_CLASSES = new Set<string>(Object.keys(ACCOUNT_TYPES));

/** Which Northstar class a single Monarch account belongs in, and why. */
export function classify(account: MonarchAccount, overrides: Record<string, string> = {}): Classification {
  const override = overrides[account.id];
  if (override && ALL_CLASSES.has(override)) {
    return { kind: 'mapped', accountClass: override as AccountClass, via: 'override' };
  }

  const subtype = normalise(account.subtype);
  if (subtype && BY_SUBTYPE[subtype]) {
    return { kind: 'mapped', accountClass: BY_SUBTYPE[subtype], via: 'subtype' };
  }

  const type = normalise(account.type);

  // The one genuinely ambiguous case, and the reason `overrides` exists:
  // without a subtype, a brokerage could be any of the three tax treatments.
  // Defaulting to taxable would put a 401(k)'s balance somewhere the engine
  // taxes at capital-gains rates with no penalty and no age gate — wrong in
  // three directions at once, and invisible once imported.
  if (type === 'brokerage') {
    return {
      kind: 'needsChoice',
      candidates: ['taxableInvestment', 'taxDeferredInvestment', 'taxFreeInvestment'],
    };
  }

  if (type && BY_TYPE[type]) {
    return { kind: 'mapped', accountClass: BY_TYPE[type], via: 'type' };
  }

  return { kind: 'unknown' };
}

function normalise(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export interface AmbiguousAccount {
  id: string;
  name: string;
  institution?: string;
  balance: number;
  candidates: AccountClass[];
}

/**
 * Every account Monarch cannot classify on its own, computed WITHOUT consulting
 * overrides — so the list is the same before and after any of them is answered.
 *
 * That independence is the point. Deriving the queue from the unresolved set
 * instead means a row disappears the moment it is answered and the rest jump up
 * under the pointer; the next click then lands on a different account than the
 * one aimed at, and a misfiled 401(k) is invisible from that moment on. The
 * queue is a fixed list of questions, and an answer fills one in rather than
 * removing it.
 */
export function ambiguousAccounts(snapshot: MonarchSnapshot): AmbiguousAccount[] {
  const out: AmbiguousAccount[] = [];
  for (const account of snapshot.accounts) {
    if (account.is_active === false || account.is_hidden) continue;
    const result = classify(account, {});
    if (result.kind !== 'needsChoice') continue;
    out.push({
      id: account.id,
      name: account.name,
      institution: account.institution ?? undefined,
      balance: Math.abs(account.balance ?? 0),
      candidates: result.candidates,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The import
// ---------------------------------------------------------------------------

export interface ClassLine {
  accountClass: AccountClass;
  label: string;
  /** Balance currently in the plan, before the import. */
  before: number;
  /** Balance the import would write. */
  after: number;
  /** The Monarch accounts that rolled into this line. */
  sources: { id: string; name: string; institution?: string; balance: number }[];
  /** True when no account of this class exists in the plan yet. */
  isNew: boolean;
}

export interface ImportReport {
  capturedAt: string;
  lines: ClassLine[];
  /** Accounts whose class could not be settled without the user. */
  needsChoice: { id: string; name: string; institution?: string; balance: number; candidates: AccountClass[] }[];
  /** Accounts skipped, with the reason. */
  skipped: { id: string; name: string; reason: string }[];
  /** Derived plan settings, when the snapshot carried cashflow. */
  baseline?: { income: number; expenses: number; currentIncome: number; currentExpenses: number };
  netWorth: number;
}

export interface ImportOptions {
  /**
   * Fold cashflow into `baselineIncome` / `baselineExpenses`. Off by default:
   * a plan usually models salary as an `income` EVENT so it can stop at
   * retirement, and adding a baseline on top of that double-counts it. The
   * report always shows the figures; applying them is a deliberate act.
   */
  applyCashflow?: boolean;
}

/**
 * What an import WOULD do. Pure — computes the report without touching the
 * plan, so the UI can show the diff before anything is committed.
 */
export function previewImport(plan: Plan, snapshot: MonarchSnapshot): ImportReport {
  const overrides = snapshot.overrides ?? {};
  const buckets = new Map<AccountClass, ClassLine['sources']>();
  const needsChoice: ImportReport['needsChoice'] = [];
  const skipped: ImportReport['skipped'] = [];

  for (const account of snapshot.accounts) {
    if (account.is_active === false) {
      skipped.push({ id: account.id, name: account.name, reason: 'Closed in Monarch' });
      continue;
    }
    if (account.is_hidden) {
      skipped.push({ id: account.id, name: account.name, reason: 'Hidden in Monarch' });
      continue;
    }

    const result = classify(account, overrides);
    // Liabilities arrive negative from Monarch; the engine wants magnitudes.
    const balance = Math.abs(account.balance ?? 0);

    if (result.kind === 'needsChoice') {
      needsChoice.push({
        id: account.id,
        name: account.name,
        institution: account.institution ?? undefined,
        balance,
        candidates: result.candidates,
      });
      continue;
    }
    if (result.kind === 'unknown') {
      skipped.push({
        id: account.id,
        name: account.name,
        reason: `Unrecognised Monarch type "${account.type ?? 'none'}"`,
      });
      continue;
    }

    const sources = buckets.get(result.accountClass) ?? [];
    sources.push({
      id: account.id,
      name: account.name,
      institution: account.institution ?? undefined,
      balance,
    });
    buckets.set(result.accountClass, sources);
  }

  const lines: ClassLine[] = [];
  for (const [accountClass, sources] of buckets) {
    // Synthetic accounts belong to the event that created them (a home and its
    // mortgage from `buyAHome`). Importing over one would put a real balance
    // on a projected purchase, and the engine rebuilds it on the next run
    // anyway, so the import only ever touches user-owned accounts.
    const existing = plan.accounts.find(
      (a) => a.accountClass === accountClass && !a.isSynthetic,
    );
    // Summing floats leaves a tail ($49,632.649999999994 from two clean
    // balances). Harmless to the projection, but it persists into the plan and
    // shows up in an export, so it is settled here at the one place balances
    // are combined.
    const after = toCents(sources.reduce((sum, s) => sum + s.balance, 0));
    lines.push({
      accountClass,
      label: ACCOUNT_TYPES[accountClass].label,
      before: existing?.initialBalance ?? 0,
      after,
      sources,
      isNew: !existing,
    });
  }

  lines.sort((a, b) => a.label.localeCompare(b.label));

  const netWorth = lines.reduce(
    (sum, line) => sum + (ACCOUNT_TYPES[line.accountClass].isLiability ? -line.after : line.after),
    0,
  );

  const report: ImportReport = { capturedAt: snapshot.capturedAt, lines, needsChoice, skipped, netWorth };

  if (snapshot.cashflow) {
    const { income, expenses, months } = snapshot.cashflow;
    report.baseline = {
      income: annualise(income, months),
      expenses: annualise(expenses, months),
      currentIncome: plan.settings.baselineIncome,
      currentExpenses: plan.settings.baselineExpenses,
    };
  }

  return report;
}

/** Round to whole dollars — cents in a 60-year projection are noise. */
function annualise(amount: number, months: number): number {
  return Math.round((Math.abs(amount) / months) * 12);
}

/** Kill floating-point tails without losing the cents Monarch reported. */
function toCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Apply an import, returning a NEW plan. Never mutates its argument: the
 * store's undo stack keeps whole plan snapshots and shares structure with
 * what is on screen (planStore.ts).
 */
export function applyImport(
  plan: Plan,
  snapshot: MonarchSnapshot,
  options: ImportOptions = {},
): { plan: Plan; report: ImportReport } {
  const report = previewImport(plan, snapshot);

  const accounts = plan.accounts.map((a) => ({ ...a }));

  for (const line of report.lines) {
    const index = accounts.findIndex(
      (a) => a.accountClass === line.accountClass && !a.isSynthetic,
    );

    if (index === -1) {
      const spec = ACCOUNT_TYPES[line.accountClass];
      accounts.push({
        id: `monarch-${line.accountClass}`,
        name: spec.label,
        ...structuredClone(spec.defaults),
        initialBalance: line.after,
        ...linkedFrom(snapshot, line),
      });
      continue;
    }

    // The balance is the ONLY thing an import writes. Everything else on this
    // account is the user's modelling and is left exactly as it was.
    accounts[index] = {
      ...accounts[index],
      initialBalance: line.after,
      ...linkedFrom(snapshot, line),
    };
  }

  const settings = { ...plan.settings };
  if (options.applyCashflow && report.baseline) {
    settings.baselineIncome = report.baseline.income;
    settings.baselineExpenses = report.baseline.expenses;
  }

  return { plan: { ...plan, accounts, settings }, report };
}

/**
 * Provenance for the `linked*` fields on `Account` — what the real-world
 * account actually reports, kept beside the user's own assumption so the two
 * can be compared rather than silently merged.
 *
 * Only ever populated from figures the snapshot genuinely carries. Monarch's
 * `get_accounts` does not return rates today, so on a plain capture this
 * contributes nothing rather than inventing a number.
 */
function linkedFrom(snapshot: MonarchSnapshot, line: ClassLine): Partial<Account> {
  const ids = new Set(line.sources.map((s) => s.id));
  const source = snapshot.accounts.filter((a) => ids.has(a.id));

  const rates = source.map((a) => a.interest_rate).filter(isNumber);
  const payments = source.map((a) => a.planned_payment).filter(isNumber);

  const linked: Partial<Account> = {};
  // One Northstar row can front several real cards at different APRs. A mean
  // would be a rate nothing charges; the highest is the one worth seeing.
  if (rates.length) linked.linkedInterestRate = Math.max(...rates);
  if (payments.length) linked.linkedPlannedPayment = payments.reduce((a, b) => a + b, 0);
  return linked;
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
