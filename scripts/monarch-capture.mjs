#!/usr/bin/env node
/**
 * Turn raw Monarch MCP tool output into a Northstar snapshot.
 *
 * The capture has to happen outside the browser: Monarch's API is not
 * CORS-open, and the session token lives in your system keyring precisely so
 * it never reaches a client bundle. So the loop is:
 *
 *   1. In Claude (Desktop or Code) with the Monarch MCP server configured, run
 *      `get_accounts` and — optionally — `get_cashflow`, saving each tool's
 *      JSON to a file.
 *   2. node scripts/monarch-capture.mjs accounts.json [cashflow.json] > snap.json
 *   3. Paste snap.json into Northstar → Import.
 *
 * Step 2 exists because `get_cashflow` returns Monarch's own nested aggregate
 * shape, which has moved more than once. Normalising it here keeps that churn
 * out of the engine (packages/engine/src/monarch.ts is a pure function of its
 * arguments and has no opinion about Monarch's wire format).
 *
 * The account rows need no reshaping at all — `get_accounts` already emits
 * id / name / type / balance / institution / is_active / is_hidden, which is
 * the snapshot's account shape. That is deliberate.
 */
import { readFileSync } from 'node:fs';

const [, , accountsPath, cashflowPath] = process.argv;

if (!accountsPath) {
  console.error(`usage: node scripts/monarch-capture.mjs <get_accounts.json> [get_cashflow.json]

  Both files are the raw JSON a Monarch MCP tool returned. A tool response
  wrapped as { success, data } is unwrapped automatically.`);
  process.exit(1);
}

const accounts = pickAccounts(read(accountsPath));
if (!accounts.length) {
  console.error(`No accounts found in ${accountsPath}. Is that a get_accounts response?`);
  process.exit(1);
}

const snapshot = {
  capturedAt: new Date().toISOString().slice(0, 10),
  accounts,
};

if (cashflowPath) {
  const cashflow = pickCashflow(read(cashflowPath));
  if (cashflow) snapshot.cashflow = cashflow;
  else console.error(`warning: no income/expense totals found in ${cashflowPath}; skipping cashflow.`);
}

process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);

// --- helpers ---------------------------------------------------------------

function read(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    console.error(`Could not read ${path}: ${e.message}`);
    process.exit(1);
  }
}

/** The MCP helpers wrap payloads as { success, data }; tolerate either form. */
function unwrap(value) {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'data' in value) {
    return value.data;
  }
  return value;
}

function pickAccounts(raw) {
  const data = unwrap(raw);
  const list = Array.isArray(data) ? data : (data?.accounts ?? []);
  return list
    .filter((a) => a && a.id != null)
    .map((a) => ({
      id: String(a.id),
      name: a.name ?? a.displayName ?? 'Unnamed account',
      type: a.type ?? null,
      // get_accounts does not return subtype today. Carried through when a
      // richer capture has it, because subtype is the only field that can tell
      // a 401(k) from a Roth from a taxable brokerage without asking.
      ...(a.subtype ? { subtype: a.subtype } : {}),
      balance: numberOrNull(a.balance ?? a.current_balance ?? a.display_balance),
      institution: a.institution ?? null,
      ...(a.is_active === undefined ? {} : { is_active: Boolean(a.is_active) }),
      ...(a.is_hidden === undefined ? {} : { is_hidden: Boolean(a.is_hidden) }),
      ...(numberOrNull(a.interest_rate) === null ? {} : { interest_rate: Number(a.interest_rate) }),
      ...(numberOrNull(a.planned_payment) === null
        ? {}
        : { planned_payment: Number(a.planned_payment) }),
    }));
}

/**
 * Monarch nests the totals as summary[0].summary.{sumIncome,sumExpense}, but
 * has also returned them flat. Try the known shapes rather than guessing, and
 * say nothing at all rather than emit a wrong number — a silently halved
 * income would be invisible once it reached the plan.
 */
function pickCashflow(raw) {
  const data = unwrap(raw);
  const totals =
    data?.summary?.[0]?.summary ??
    data?.summary?.summary ??
    data?.summary ??
    data;

  const income = numberOrNull(totals?.sumIncome ?? totals?.income);
  const expenses = numberOrNull(totals?.sumExpense ?? totals?.expenses);
  if (income === null || expenses === null) return null;

  const months = monthsIn(data) ?? 1;
  return { income, expenses, months };
}

/**
 * How many months the totals cover. Without it the annualisation is wrong by
 * exactly the factor nobody would notice — a quarter read as a month makes the
 * plan's income three times too large.
 */
function monthsIn(data) {
  const start = data?.start_date ?? data?.startDate;
  const end = data?.end_date ?? data?.endDate;
  if (!start || !end) return null;
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const months =
    (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  return months > 0 ? months : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
