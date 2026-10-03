# Importing from Monarch

Northstar reads real balances out of [Monarch Money][monarch] through
[`robcerda/monarch-mcp-server`][server]. This is what that does and does not
mean.

## It is not a live connection, and it cannot be

The two halves cannot reach each other, for three independent reasons:

1. **Northstar is a static bundle.** It deploys to GitHub Pages and keeps
   everything in `localStorage`. There is no server to hold a session
   (docs/PLAN.md §9 Phase 2 — Postgres, tRPC, auth — is the next milestone,
   not a shipped one).
2. **The MCP server speaks stdio.** It is a Python process that talks over
   stdin/stdout to a local MCP client. It exposes no HTTP endpoint, and a
   browser tab cannot spawn a subprocess.
3. **Monarch's API is not CORS-open**, and its session token lives in your
   system keyring specifically so it never reaches a client bundle. Making the
   browser call Monarch directly would mean shipping that token to the page.

So the paste flow below is a **capture and paste**, not a socket. It takes
about fifteen seconds and can be repeated as often as you like. The desktop
app closes that gap a different way — not a live connection either, but a
local script that drives an actual logged-in browser (below).

## The monthly drop-in (desktop app, local only)

The owner's own loop, and the one `docs/ROADMAP-10.md` Track B was built for:
scrape Monarch with a real Chrome roughly monthly, no forms, no MCP server,
no server at all.

**1. `npm run monarch:sync`.** First run only: it opens Chrome, headed,
pointed at `https://app.monarch.com`, and waits — with a generous timeout —
for you to log in by hand, MFA included. **The script never reads, prompts
for, types, or stores your credentials.** All it ever waits for is the
`session_id` cookie Monarch itself sets once you're in. That session then
lives in a persistent, local-only Chrome profile
(`~/Library/Application Support/com.northstar.planner/monarch/profile`), so
every run after the first is headless and takes a few seconds — pass
`--headed` any time you want to watch, or if a run reports the session
expired.

Once logged in, it calls Monarch's own GraphQL API **from inside that logged-in
page** (`page.evaluate` running `fetch(..., { credentials: 'include' })`) —
the same query documents and header conventions
`packages/server/src/monarch/{queries,client}.ts` use, reused rather than
duplicated. Add `--cashflow` to also pull the last three full months of
income/expense totals, the way `docs/BACKEND.md`'s server refresh does.

**2. It writes a snapshot to disk, not to the app.** Validated with the same
`parseSnapshot` this whole document is about, then written to
`~/Library/Application Support/com.northstar.planner/monarch/snapshots/`:
`<YYYY-MM-DD>.json` (or `<YYYY-MM-DD>-HHMM.json` if you run it twice in one
day) plus `latest.json`. The terminal prints the account count, total
assets/liabilities, and the exact path.

**3. Open Northstar.** The app finds the new snapshot itself — a Tauri
command reads `latest.json` directly out of that same folder
(`src-tauri/src/lib.rs`'s `monarch_latest_snapshot`); a plain browser tab
running `npm run dev` gets the identical file over a dev-only route
(`scripts/vite-monarch-plugin.ts`, `GET /__local/monarch/latest`). Neither
path exists in a production browser build — there is no server there to ask.
`src/planner/monarchLocal.ts` is the one module that decides which of the two
to use, and `src/planner/useLocalMonarch.ts` is what notices a snapshot is
newer than the last one you applied.

**4. Review, same as a paste.** Opening Import from a local snapshot lands on
the identical diff a paste produces — `previewImport`/`applyImport` don't
know or care where a snapshot came from. Applying also sets the plan's
`asOfDate` to the snapshot's capture date and appends a Progress point (net
worth, assets, liabilities, all read from the snapshot's own totals) — so a
monthly sync is what turns into the actual-vs-plan history on Progress,
automatically, with no separate step.

You can also drag a snapshot JSON file straight onto the Import drawer, or
pick it with a file browser — the same file `monarch:sync` just wrote, if
you'd rather not wait for the app to notice it itself.

**Resetting the session.** Delete the profile directory —
`~/Library/Application Support/com.northstar.planner/monarch/profile` — and
the next `npm run monarch:sync` behaves like a first run: headed, and
waiting for you to log in again. Nothing else is affected; your snapshots and
plans are untouched, because they live in sibling directories, not inside the
profile.

**The security posture, stated plainly.** Every plan and snapshot on this
machine stays on this machine — nothing here talks to any server but
Monarch's own, and only `monarch-sync.mjs` ever does that. The script never
sees a password, an OTP, or a TOTP code; Chrome's own login form handles all
of it, and the only thing the script reads back is a cookie the browser
already set. The app itself never calls Monarch — it only ever reads a JSON
file `monarch-sync.mjs` already wrote to disk.

## The paste loop (fallback, works without the desktop app)

**1. Capture.** In Claude Desktop or Claude Code with the Monarch MCP server
configured, run `get_accounts` — and `get_cashflow` if you want the spending
figures — and save each response to a file.

**2. Normalise.**

```bash
node scripts/monarch-capture.mjs accounts.json [cashflow.json] > snap.json
```

Account rows need no reshaping: `get_accounts` already emits
`id / name / type / balance / institution / is_active / is_hidden`, which is
exactly the snapshot's account shape. The script exists for `get_cashflow`,
whose nested aggregate shape has moved more than once, and to work out how many
months the totals cover — read a quarter as a month and the plan's income comes
out three times too large.

**3. Import.** Open Northstar → **Import**, paste, read the diff, save.

## What an import writes — and what it never touches

**It writes `initialBalance`. That is all.**

Monarch knows what you *have*. It does not know what you *expect*. Every
expected return, capital-gains rate, embedded-gain share, penalty age and
withdrawal rule in your plan is your modelling judgement, and an import leaves
all of it exactly as you set it. An import that "helpfully" reset `growthRate`
to some trailing return computed from your balance history would quietly
overwrite the entire point of the tool.

Two more rules fall out of the same principle:

- **Synthetic accounts are never touched.** A home and its mortgage created by
  a `buyAHome` event belong to that event and are rebuilt on every run. Writing
  today's balance onto one would put real money on a purchase that has not
  happened.
- **Cash flow is off by default.** If your salary is modelled as an `income`
  event so it can stop at retirement, adding `baselineIncome` on top of it
  counts the same money twice. The drawer always shows the figures; applying
  them is a deliberate checkbox.

## Two models of "an account"

Monarch has one row per linked institution. Northstar has one row per **asset
class** — one "Taxable investments" line, not three brokerages
(`packages/engine/src/accountTypes.ts`). The import folds the former into the
latter, and the drawer lists which real accounts rolled into each line so the
total is checkable.

Balances also change sign: Monarch signs debt negative, Northstar keeps
positive magnitudes and distinguishes debt with `isLiability`. The import takes
magnitudes.

## The subtype gap

`get_accounts` returns Monarch's `type` — `depository`, `brokerage`, `credit`,
`loan`, `real_estate` — but **not `subtype`**. Every other type maps cleanly.
`brokerage` does not: a 401(k), a Roth IRA and a taxable brokerage are all
`brokerage`, and nothing in the feed separates them.

That distinction is the one the engine's whole tax model turns on. Defaulting
to taxable would file a 401(k) somewhere taxed at capital-gains rates with no
penalty and no age gate — wrong in three directions at once, and invisible from
the moment it is imported.

So the import **refuses to guess**. Ambiguous accounts are held out of the diff
and asked about individually, and the answers are saved to
`settings.monarchOverrides`, keyed by Monarch account id, so a later capture
does not ask again. If a capture ever does carry `subtype`, it is used and the
question never appears.

The question list is deliberately computed from the capture alone, so it does
not reorder as it is filled in — a queue that shrinks under the pointer is how
a 401(k) ends up filed as taxable.

## The snapshot contract

Validated by zod at the door (`parseSnapshot`), because what arrives is pasted
text.

```jsonc
{
  "capturedAt": "2026-08-23",          // required; shown so a stale import is visible
  "accounts": [
    {
      "id": "170283",                  // required — the override key, so it must be stable
      "name": "Chase Total Checking",  // required
      "type": "depository",            // Monarch's type.name
      "subtype": "checking",           // optional; settles tax treatment when present
      "balance": 8412.55,              // negative for liabilities, as Monarch reports them
      "institution": "Chase",
      "is_active": true,               // false → skipped as closed
      "is_hidden": false,              // true  → skipped as hidden
      "interest_rate": 5.875,          // optional → Account.linkedInterestRate
      "planned_payment": 17531.16      // optional → Account.linkedPlannedPayment
    }
  ],
  "cashflow": { "income": 38400, "expenses": -22150, "months": 3 },  // optional
  "overrides": { "170290": "taxableInvestment" }                     // optional
}
```

`interest_rate` and `planned_payment` populate the `linked*` provenance fields
on `Account` — the real-world figure kept beside your own assumption rather
than merged into it. Monarch's `get_accounts` does not return rates today, so
on a plain capture they are simply absent. Nothing is invented to fill them.

## Where the code lives

| Path | What it is |
|---|---|
| `packages/engine/src/monarch.ts` | The contract, the classifier and the mapper. Pure — no I/O, no React. |
| `packages/engine/test/monarch.test.ts` | 29 tests, including that an import never mutates the plan it was given and that re-importing the same capture is a no-op. |
| `src/planner/drawer/ImportDrawer.tsx` | The diff, the question queue, the paste box, drag-and-drop/file-picker, and (on Save) the `asOfDate` + Progress-point write. |
| `scripts/monarch-capture.mjs` | Raw MCP output → snapshot (the paste loop). |
| `scripts/monarch-sync.mjs` | The monthly drop-in: drives real Chrome, waits for login, calls Monarch's GraphQL from inside the page, writes a snapshot. |
| `scripts/monarch-paths.mjs` | The one place the local data directory is computed — shared by the sync script and the dev route so they can't drift apart. |
| `scripts/ts-extension-loader.mjs` | Lets `monarch-sync.mjs` import `packages/engine`'s TypeScript source directly with no build step (see the comment at its top). |
| `scripts/vite-monarch-plugin.ts` | `vite dev`-only routes (`/__local/monarch/latest`, `/__local/monarch/list`) that mirror the Tauri commands for a plain browser tab. |
| `src-tauri/src/lib.rs` | `monarch_latest_snapshot`, `monarch_list_snapshots`, `write_plans_backup` — the packaged app's equivalent of the dev routes, plus the local plans backup. |
| `src/planner/monarchLocal.ts` | The one module that decides Tauri vs. dev-route vs. neither, and parses whatever it gets with `parseSnapshot`. |
| `src/planner/useLocalMonarch.ts` | "Is there a snapshot newer than the one I last applied?" — checked on launch and on window focus. |

[monarch]: https://www.monarchmoney.com
[server]: https://github.com/robcerda/monarch-mcp-server
