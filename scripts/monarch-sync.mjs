#!/usr/bin/env node
/**
 * The monthly drop-in: `npm run monarch:sync`.
 *
 * Opens Chrome against a persistent, local-only profile, waits for the owner
 * to log into Monarch by hand the first time (MFA included — this script
 * never sees, reads, prompts for, or stores credentials), and on every run
 * after that reuses the saved session headlessly. Once logged in, it calls
 * Monarch's GraphQL API from *inside the logged-in page* — `page.evaluate`
 * running `fetch(..., { credentials: 'include' })` — which is sturdier than
 * scraping the DOM and means the session cookie never has to leave the
 * browser. The query documents, header conventions, and the
 * GraphQL→snapshot mapping are reused verbatim from
 * `packages/server/src/monarch/{queries,client,snapshot}.ts` — nothing here
 * is a second copy of that logic.
 *
 * Normalizing and writing the snapshot is one path regardless of where the
 * accounts came from — a live capture, or (for testing without a live
 * Monarch login) `--from-file`, which skips the browser and feeds a fixture
 * through the exact same validate → toSnapshot → parseSnapshot → write code.
 *
 * Output: `<data dir>/monarch/snapshots/<YYYY-MM-DD>.json` (or
 * `-HHMM` appended if that file already exists — a second run the same day
 * does not clobber the first) and `.../latest.json`, which is what
 * `src-tauri/src/lib.rs`'s `monarch_latest_snapshot` command and
 * `scripts/vite-monarch-plugin.ts`'s dev route both read.
 */
import { existsSync, mkdirSync, chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright-core';

import { GET_ACCOUNTS, GET_CASHFLOW } from '../packages/server/src/monarch/queries.ts';
import {
  HEADERS,
  AUTH_ERROR,
  monthsBetween,
  accountsResponse,
  cashflowResponse,
} from '../packages/server/src/monarch/client.ts';
import { toSnapshot, defaultCashflowRange } from '../packages/server/src/monarch/snapshot.ts';
import { monarchDir, profileDir, snapshotsDir } from './monarch-paths.mjs';
import { summarizeBalances } from './monarch-summary.mjs';

// Registered here, once, before anything below ever dynamically imports the
// engine — see ts-extension-loader.mjs for why this is needed at all (the
// server files above don't need it; they already import each other with
// explicit `.ts` specifiers, which plain Node resolves natively).
register(new URL('./ts-extension-loader.mjs', import.meta.url));

const MONARCH_URL = 'https://app.monarch.com';
const GRAPHQL_URL = 'https://api.monarch.com/graphql';
const LOGIN_TIMEOUT_MS = 10 * 60_000;
const LOGIN_REMINDER_MS = 30_000;
const CHROME_PATH =
  process.env.NORTHSTAR_CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

class SyncError extends Error {}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  ensureDirs();

  const capturedAt = new Date();
  let accounts;
  let cashflowTotals = null;

  if (args.fromFile) {
    const fixture = readJSON(args.fromFile);
    accounts = validateAccounts({ accounts: fixture.accounts ?? [] });
    if (args.cashflow && fixture.cashflow) {
      const range = fixture.cashflowRange ?? defaultCashflowRange(capturedAt);
      cashflowTotals = validateCashflow(fixture.cashflow, range);
    }
  } else {
    const captured = await captureFromChrome(args, capturedAt);
    accounts = captured.accounts;
    cashflowTotals = captured.cashflowTotals;
  }

  const { parseSnapshot, classify, LIABILITY_CLASSES } = await loadEngine();
  const snapshot = parseSnapshot(toSnapshot(accounts, cashflowTotals, capturedAt));

  const { dailyPath, latestPath } = writeSnapshot(snapshot);
  printSummary(snapshot, dailyPath, latestPath, classify, LIABILITY_CLASSES);
}

// --- CLI ---------------------------------------------------------------

function parseArgs(argv) {
  const args = { headed: false, cashflow: false, fromFile: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--headed') args.headed = true;
    else if (arg === '--cashflow') args.cashflow = true;
    else if (arg === '--from-file') args.fromFile = argv[++i];
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new SyncError(`Unknown argument: ${arg}. Run with --help for usage.`);
  }
  if (args.fromFile && !existsSync(args.fromFile)) {
    throw new SyncError(`--from-file ${args.fromFile} does not exist.`);
  }
  return args;
}

function printHelp() {
  console.log(`Usage: npm run monarch:sync -- [options]

  --headed           Force a visible Chrome window. The first run does this
                      automatically so you can log in; later runs are
                      headless unless you pass this.
  --cashflow         Also pull the last three full months of income/expense
                      totals, the way the server's refresh does.
  --from-file FILE   Skip the browser entirely. FILE is a JSON fixture:
                        { "accounts": [ ...GetAccounts rows... ],
                          "cashflow": { "summary": [...] } | null,
                          "cashflowRange": { "startDate", "endDate" } }
                      Runs the exact same validate/normalize/write path as a
                      live capture, minus the network — for testing without
                      a live Monarch login.

Credentials are never read, stored, or typed by this script. Everything it
writes stays on this machine, under:
  ${monarchDir()}
`);
}

// --- browser capture -----------------------------------------------------

async function captureFromChrome(args, capturedAt) {
  const executablePath = requireChrome();
  const { context, page } = await ensureLoggedIn(executablePath, args.headed);
  try {
    const csrftoken = await getCookie(context, 'csrftoken');
    if (!csrftoken) throw sessionExpiredError();
    const headers = { ...HEADERS, 'X-Csrftoken': csrftoken };

    const accountsEnvelope = await graphqlFetch(page, {
      operationName: 'GetAccounts',
      query: GET_ACCOUNTS,
      variables: {},
      headers,
    });
    checkEnvelope(accountsEnvelope);
    const accounts = validateAccounts(accountsEnvelope.body.data);

    let cashflowTotals = null;
    if (args.cashflow) {
      const range = defaultCashflowRange(capturedAt);
      const cashflowEnvelope = await graphqlFetch(page, {
        operationName: 'Web_GetCashFlowPage',
        query: GET_CASHFLOW,
        variables: {
          filters: { search: '', categories: [], accounts: [], tags: [], ...range },
        },
        headers,
      });
      checkEnvelope(cashflowEnvelope);
      cashflowTotals = validateCashflow(cashflowEnvelope.body.data, range);
    }

    return { accounts, cashflowTotals };
  } finally {
    await context.close();
  }
}

async function graphqlFetch(page, { operationName, query, variables, headers }) {
  return page.evaluate(
    async ({ url, operationName, query, variables, headers }) => {
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ operationName, query, variables }),
      });
      let body = null;
      try {
        body = await response.json();
      } catch {
        // A non-JSON body is handled by the caller (status won't be 2xx).
      }
      return { status: response.status, body };
    },
    { url: GRAPHQL_URL, operationName, query, variables, headers },
  );
}

function checkEnvelope({ status, body }) {
  if (status === 401 || status === 403) throw sessionExpiredError();
  const errors = body?.errors;
  if (Array.isArray(errors) && errors.length) {
    const message = errors.map((e) => e.message).filter(Boolean).join('; ');
    if (AUTH_ERROR.test(message)) throw sessionExpiredError();
    throw schemaErrorFromMessage(message);
  }
  if (!body?.data) throw schemaErrorFromMessage('response had no data');
}

// --- login -----------------------------------------------------------------

async function launch(executablePath, headless) {
  return chromium.launchPersistentContext(profileDir(), {
    executablePath,
    headless,
    viewport: null,
  });
}

async function firstPage(context) {
  return context.pages()[0] ?? context.newPage();
}

async function getCookie(context, name) {
  const cookies = await context.cookies();
  return cookies.find((c) => c.name === name)?.value ?? null;
}

/**
 * Headless first, since that is the common case once a session exists. Only
 * reopens visibly — and only then starts the login wait — when there is no
 * `session_id` cookie yet.
 */
async function ensureLoggedIn(executablePath, forceHeaded) {
  let headed = forceHeaded;
  let context = await launch(executablePath, !headed);
  let page = await firstPage(context);
  await page.goto(MONARCH_URL, { waitUntil: 'domcontentloaded' });

  let sessionId = await getCookie(context, 'session_id');
  if (sessionId) return { context, page };

  if (!headed) {
    console.log('Not logged in yet — reopening Chrome so you can log in by hand...');
    await context.close();
    headed = true;
    context = await launch(executablePath, false);
    page = await firstPage(context);
    await page.goto(MONARCH_URL, { waitUntil: 'domcontentloaded' });
  }

  console.log(
    [
      '',
      'Log into Monarch in the Chrome window that just opened — MFA included.',
      'This script never sees, reads, prompts for, or stores your credentials;',
      'it only waits for the session cookie Monarch sets once you are in.',
      `Waiting up to ${Math.round(LOGIN_TIMEOUT_MS / 60_000)} minutes...`,
      '',
    ].join('\n'),
  );

  sessionId = await waitForLogin(context);
  if (!sessionId) {
    await context.close();
    throw new SyncError(
      'Timed out waiting for login. Run "npm run monarch:sync -- --headed" again when you have time to log in.',
    );
  }
  return { context, page };
}

async function waitForLogin(context) {
  const start = Date.now();
  let lastReminder = start;
  while (Date.now() - start < LOGIN_TIMEOUT_MS) {
    const sessionId = await getCookie(context, 'session_id');
    if (sessionId) return sessionId;
    if (Date.now() - lastReminder > LOGIN_REMINDER_MS) {
      const remainingMin = Math.max(1, Math.round((LOGIN_TIMEOUT_MS - (Date.now() - start)) / 60_000));
      console.log(`Still waiting for login... (${remainingMin} minute${remainingMin === 1 ? '' : 's'} left)`);
      lastReminder = Date.now();
    }
    await sleep(2000);
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireChrome() {
  if (!existsSync(CHROME_PATH)) {
    throw new SyncError(
      `Could not find Chrome at "${CHROME_PATH}". Install Google Chrome, or point NORTHSTAR_CHROME_PATH at its executable.`,
    );
  }
  return CHROME_PATH;
}

// --- validation, shared between the live path and --from-file --------------

function validateAccounts(data) {
  const parsed = accountsResponse.safeParse(data);
  if (!parsed.success) throw schemaError(parsed.error);
  return parsed.data.accounts;
}

/** Mirrors `MonarchClient.getCashflow` — null when Monarch has no aggregate,
 *  rather than a zero that would look like a real, empty quarter. */
function validateCashflow(data, range) {
  const parsed = cashflowResponse.safeParse(data);
  if (!parsed.success) throw schemaError(parsed.error);
  const totals = parsed.data.summary[0]?.summary;
  if (!totals || totals.sumIncome == null || totals.sumExpense == null) return null;
  return {
    income: totals.sumIncome,
    expenses: totals.sumExpense,
    months: monthsBetween(range.startDate, range.endDate),
  };
}

function schemaError(zodError) {
  const path = zodError.issues?.[0]?.path?.join('.') || 'root';
  return schemaErrorFromMessage(`did not match the expected shape (${path})`);
}

function schemaErrorFromMessage(message) {
  return new SyncError(
    `Monarch's response ${message}. Monarch's API is private and unversioned — recapture the query ` +
      'from DevTools and update packages/server/src/monarch/queries.ts.',
  );
}

function sessionExpiredError() {
  return new SyncError(
    'Monarch rejected the session. Run "npm run monarch:sync -- --headed" and log in again.',
  );
}

// --- engine (validated snapshot shape) --------------------------------------

async function loadEngine() {
  // Two modules, not one — `classify` (account → Northstar class) lives in
  // `monarch.ts`, `LIABILITY_CLASSES` in `accountTypes.ts`, and
  // `printSummary` below needs both to classify an account the same way the
  // app does (docs/W3-REVIEW.md: it used to sort by balance SIGN instead,
  // which misreported a credit card as a +$2,300 ASSET whenever Monarch's
  // own `displayBalance` for that account happened to be non-negative).
  const [monarch, accountTypes] = await Promise.all([
    import('../packages/engine/src/monarch.ts'),
    import('../packages/engine/src/accountTypes.ts'),
  ]);
  return { ...monarch, ...accountTypes };
}

// --- filesystem --------------------------------------------------------------

function ensureDirs() {
  for (const dir of [monarchDir(), profileDir(), snapshotsDir()]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      chmodSync(dir, 0o700);
    } catch {
      // Best-effort — some filesystems (e.g. exFAT) don't support unix modes.
    }
  }
}

function readJSON(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (e) {
    throw new SyncError(`Could not read ${filePath}: ${e.message}`);
  }
}

function writeSnapshot(snapshot) {
  const dir = snapshotsDir();
  const date = snapshot.capturedAt;
  let filename = `${date}.json`;
  if (existsSync(path.join(dir, filename))) {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    filename = `${date}-${hh}${mm}.json`;
  }
  const dailyPath = path.join(dir, filename);
  const latestPath = path.join(dir, 'latest.json');
  const body = `${JSON.stringify(snapshot, null, 2)}\n`;
  writeFileSync(dailyPath, body, { mode: 0o600 });
  writeFileSync(latestPath, body, { mode: 0o600 });
  return { dailyPath, latestPath };
}

function printSummary(snapshot, dailyPath, latestPath, classify, LIABILITY_CLASSES) {
  const { assets, liabilities, netWorth, count } = summarizeBalances(snapshot, classify, LIABILITY_CLASSES);

  console.log(
    [
      '',
      `Captured ${snapshot.capturedAt} · ${count} account${count === 1 ? '' : 's'}`,
      `  assets       ${usd(assets)}`,
      `  liabilities  ${usd(liabilities)}`,
      `  net worth    ${usd(netWorth)}`,
      '',
      `Wrote ${dailyPath}`,
      `  and ${latestPath}`,
      '',
    ].join('\n'),
  );
}

function usd(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

main().catch((err) => {
  if (err instanceof SyncError) {
    console.error(`\n${err.message}\n`);
  } else {
    console.error('\nmonarch:sync failed unexpectedly:');
    console.error(err);
  }
  process.exitCode = 1;
});
