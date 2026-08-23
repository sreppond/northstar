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

So the flow is a **capture and paste**, not a socket. It takes about fifteen
seconds and can be repeated as often as you like. When Phase 2 lands, the
server can hold the session and run this same mapper on a schedule — the
mapping code does not change, only what calls it.

## The loop

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
| `src/planner/drawer/ImportDrawer.tsx` | The diff, the question queue, the paste box. |
| `scripts/monarch-capture.mjs` | Raw MCP output → snapshot. |

[monarch]: https://www.monarchmoney.com
[server]: https://github.com/robcerda/monarch-mcp-server
