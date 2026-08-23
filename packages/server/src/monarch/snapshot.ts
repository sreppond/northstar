/**
 * Monarch's API shape → the engine's `MonarchSnapshot`.
 *
 * The engine already knows how to fold a snapshot into a plan
 * (packages/engine/src/monarch.ts) and is deliberately ignorant of Monarch's
 * wire format. This module is the only place the two meet, so when Monarch
 * changes a field name exactly one file moves.
 *
 * The payoff for going direct rather than through the MCP tool is here:
 * `subtype` lets the engine classify a 401(k) without asking, and the rate
 * fields fill in the `linked*` provenance that has been declared on `Account`
 * since the schema was reverse-engineered and never had a source.
 */
import type { MonarchSnapshot } from '@northstar/engine';
import type { CashflowTotals, MonarchApiAccount } from './client.ts';

export function toSnapshot(
  accounts: MonarchApiAccount[],
  cashflow: CashflowTotals | null,
  capturedAt = new Date(),
): MonarchSnapshot {
  const snapshot: MonarchSnapshot = {
    capturedAt: capturedAt.toISOString().slice(0, 10),
    accounts: accounts.map(toAccount),
  };

  if (cashflow) {
    snapshot.cashflow = {
      income: cashflow.income,
      expenses: cashflow.expenses,
      months: cashflow.months,
    };
  }

  return snapshot;
}

function toAccount(account: MonarchApiAccount): MonarchSnapshot['accounts'][number] {
  return {
    id: account.id,
    name: account.displayName ?? 'Unnamed account',
    type: account.type?.name ?? null,
    subtype: account.subtype?.name ?? null,
    // `displayBalance` is what Monarch shows in its own UI, and it is the one
    // that matches what a person expects to see. `currentBalance` is the
    // fallback for accounts that do not carry it.
    balance: account.displayBalance ?? account.currentBalance ?? null,
    institution: account.institution?.name ?? null,
    // Monarch marks a closed account with a deactivation timestamp rather than
    // a boolean, so absence is what means active.
    is_active: !account.deactivatedAt,
    is_hidden: Boolean(account.isHidden),
    ...rateOf(account),
    ...(account.plannedPayment == null ? {} : { planned_payment: account.plannedPayment }),
  };
}

/**
 * Monarch carries both `interestRate` and `apr`, and which one is populated
 * varies by institution and account type. Prefer the explicit interest rate and
 * fall back to APR — for the revolving debt where they differ, APR is the rate
 * that actually accrues.
 */
function rateOf(account: MonarchApiAccount): { interest_rate?: number } {
  const rate = account.interestRate ?? account.apr;
  if (rate == null) return {};
  // Monarch reports these as percentages in some places and fractions in
  // others. A "0.0599" landing in a field the engine reads as 5.99% would
  // model a mortgage at six hundredths of a percent, which looks plausible on
  // a chart and is wildly wrong. Anything under 1 is treated as a fraction.
  return { interest_rate: rate < 1 ? round(rate * 100, 3) : round(rate, 3) };
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** The default cashflow window: the three whole months before today. */
export function defaultCashflowRange(now = new Date()): { startDate: string; endDate: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 3, 1));
  return { startDate: iso(start), endDate: iso(end) };
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}
