/**
 * Income with its tax attached (docs/REDESIGN-V5.md §7.2): the Cash Flow
 * page headlines what each source pays AFTER tax, with gross and tax under it.
 *
 * The engine does not tax per source. It taxes the household once
 * (`run.ts` step 7: one "Income tax" line = ordinary taxable income, net of
 * pretax contributions, times `incomeTaxRate`) and adds a few lines that DO
 * name what they tax. This module spreads the one household line back across
 * the sources that fed it, so every dollar of `snapshot.totalTaxes` lands
 * somewhere (tested):
 *
 *   tax line                               goes to
 *   -------------------------------------  ----------------------------------
 *   "Withdrawal tax — X" (accountId)       `withdrawalTax` (money drawn from
 *                                          X to cover a gap, not income)
 *   "Tax on {y} trading gains — X"         `withdrawalTax` too: an active-trading
 *     (category "gainsTax")                account's gains tax is an investment
 *                                          cost, not tax on income
 *   "RMD tax — X", "SEPP tax — X"          the RMD / SEPP income line of X
 *     (accountId)
 *   "<Event> — tax" (sourceEventId only,   that event's source (a windfall,
 *     no accountId)                        taxed by its own rate)
 *   "Income tax" (neither id)              split pro rata, below
 *
 * APPROXIMATION, and the reason the UI labels it "Tax (share)". A household
 * tax is not really owed by any one source: the rate is flat here but the
 * bracket is shared, so a second income raises the tax on the first. A pro
 * rata split by each source's share of ordinary income is the plain, defensible
 * reading, and it is exact when the rate is flat (which `incomeTaxRate` is).
 * It is NOT a marginal "what this job costs you in tax" number.
 *
 * Which income is ordinary and taxable. The engine stamps `taxable` on event
 * and baseline income lines, so a non-taxable income (`isTaxable: false`)
 * takes no share. Everything else is inferred from what the engine does:
 *  - Not ordinary: `taxable === false`, any line with an `accountId` (RMD and SEPP are taxed at the
 *    account's own rate by their own tax line; event termination proceeds,
 *    like a home sale, are taxed by nothing here), a line whose event has its
 *    own tax line (windfall), and the "— untaxed portion" half of Social
 *    Security.
 *  - Ordinary: everything else. That is baseline income and event income
 *    (jobs, bonuses, RSUs, Social Security's taxable half, income events).
 */
import type { LineItem, YearSnapshot } from '@northstar/engine';

export interface IncomeSource {
  /** Stable within a year; `event:<id>` for an event, else the line's own label. */
  key: string;
  label: string;
  gross: number;
  /** This source's tax, whether named by the engine or its share of "Income tax". */
  tax: number;
  net: number;
  sourceEventId?: string;
}

export interface IncomeWithTax {
  sources: IncomeSource[];
  /** Tax on money drawn from accounts to cover a gap. Not tied to any source. */
  withdrawalTax: number;
  /** `tax` is every tax line (sources plus `withdrawalTax`), so `net` is true after-tax income. */
  total: { gross: number; tax: number; net: number };
}

const WITHDRAWAL_TAX_PREFIX = 'Withdrawal tax';
/** `run.ts` step 10b: an active-trading account's gains tax, paid the year after. */
const GAINS_TAX_CATEGORY = 'gainsTax';
const SEPP_TAX_PREFIX = 'SEPP tax';
const UNTAXED_SUFFIX = 'untaxed portion';

export function incomeWithTax(snapshot: YearSnapshot): IncomeWithTax {
  // Events that carry a tax line of their own are taxed by it alone.
  const selfTaxedEvents = new Set(
    snapshot.taxes.filter((t) => t.sourceEventId && !t.accountId).map((t) => t.sourceEventId!),
  );
  const isOrdinary = (line: LineItem): boolean =>
    line.taxable !== false &&
    !line.accountId &&
    !(line.sourceEventId && selfTaxedEvents.has(line.sourceEventId)) &&
    !line.label.endsWith(UNTAXED_SUFFIX);

  // --- sources: one per event, else one per line ---------------------------
  interface Draft {
    source: IncomeSource;
    lines: LineItem[];
    ordinary: number;
  }
  const drafts = new Map<string, Draft>();
  const draftFor = (key: string, init: () => Omit<IncomeSource, 'gross' | 'tax' | 'net'>): Draft => {
    let d = drafts.get(key);
    if (!d) {
      d = { source: { ...init(), gross: 0, tax: 0, net: 0 }, lines: [], ordinary: 0 };
      drafts.set(key, d);
    }
    return d;
  };

  for (const line of snapshot.income) {
    const key = line.sourceEventId
      ? `event:${line.sourceEventId}`
      : line.accountId
        ? `account:${line.accountId}:${line.category ?? ''}`
        : `line:${line.label}`;
    const d = draftFor(key, () => ({
      key,
      label: line.label,
      ...(line.sourceEventId ? { sourceEventId: line.sourceEventId } : {}),
    }));
    d.lines.push(line);
    d.source.gross += line.amount;
    if (isOrdinary(line)) d.ordinary += line.amount;
  }

  // An event's lines are named "<Event>", "<Event> — signing bonus", ...:
  // the source reads as the event, as `lifeChangeRows` does for the table.
  for (const d of drafts.values()) {
    if (d.lines.length < 2) continue;
    const largest = d.lines.reduce((a, b) => (b.amount > a.amount ? b : a));
    d.source.label = largest.label.split(' — ')[0];
  }

  // --- tax lines named by the engine ---------------------------------------
  let withdrawalTax = 0;
  let householdTax = 0;

  for (const tax of snapshot.taxes) {
    if (tax.category === GAINS_TAX_CATEGORY || tax.label.startsWith(WITHDRAWAL_TAX_PREFIX)) {
      withdrawalTax += tax.amount;
    } else if (tax.accountId) {
      // RMD or SEPP tax: onto that account's matching income line. A SEPP and
      // an RMD on one account are kept apart by the SEPP category.
      const wantSepp = tax.label.startsWith(SEPP_TAX_PREFIX);
      const target = [...drafts.values()].find(
        (d) =>
          !d.source.sourceEventId &&
          d.lines.some((l) => l.accountId === tax.accountId && (l.category === 'sepp') === wantSepp),
      );
      if (target) target.source.tax += tax.amount;
      else withdrawalTax += tax.amount;
    } else if (tax.sourceEventId) {
      const key = `event:${tax.sourceEventId}`;
      const target = draftFor(key, () => ({
        key,
        label: tax.label.split(' — ')[0],
        sourceEventId: tax.sourceEventId,
      }));
      target.source.tax += tax.amount;
    } else {
      householdTax += tax.amount;
    }
  }

  // --- the household "Income tax", pro rata by ordinary income -------------
  const ordinaryTotal = [...drafts.values()].reduce((sum, d) => sum + d.ordinary, 0);
  if (householdTax > 0) {
    if (ordinaryTotal > 0) {
      for (const d of drafts.values()) d.source.tax += householdTax * (d.ordinary / ordinaryTotal);
    } else {
      // Tax with no ordinary income to blame (the inference above found none).
      // Keep it visible rather than drop it, so the totals still reconcile.
      const key = 'household:income-tax';
      draftFor(key, () => ({ key, label: 'Income tax' })).source.tax += householdTax;
    }
  }

  const sources = [...drafts.values()].map((d) => ({
    ...d.source,
    net: d.source.gross - d.source.tax,
  }));
  const gross = sources.reduce((sum, s) => sum + s.gross, 0);
  const tax = sources.reduce((sum, s) => sum + s.tax, 0) + withdrawalTax;
  return { sources, withdrawalTax, total: { gross, tax, net: gross - tax } };
}
