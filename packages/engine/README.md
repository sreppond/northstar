# @northstar/engine

The financial projection engine. Pure TypeScript: no React, no DOM, no I/O, no
clock. Same plan in, same result out — which is what lets the browser re-run a
whole projection on every keystroke and a server produce identical numbers.

Design rationale lives in [`docs/PLAN.md`](../../docs/PLAN.md).

## Use

```ts
import { runPlan, deflate } from '@northstar/engine';

const result = runPlan(plan);
const inTodaysDollars = deflate(result, plan.settings.inflationRate);
```

## Layout

| File | What it holds |
|---|---|
| `types.ts` | `Plan`, `Account`, `PlanEvent`, `PriorityRule`, `PlanResult` |
| `run.ts` | `runPlan` — the year loop, in the order fixed by PLAN.md §4.3 |
| `accounts.ts` | growth rates, schedules, monthly-stepped amortization |
| `tax.ts` | effective withdrawal rate, gross-up |
| `priority.ts` | the allocation and withdrawal waterfalls |
| `inflation.ts` | presentation-time deflation to today's dollars |
| `events/` | one module per event kind, plus the registry |

## Conventions

- Balances are **positive magnitudes**; `isLiability` distinguishes debts.
  Net worth = assets − liabilities.
- Rates are **percentages** (`6.5` means 6.5%), never decimals.
- The engine runs in **nominal dollars**. `deflate()` converts at render time;
  never run the simulation in real dollars or something gets double-deflated.
- Growth applies to the **closing** balance, so a contribution made in year Y
  first earns in Y+1.
- Every `LineItem` carries `sourceEventId`. That provenance is what lets the
  Cash Flow tab break out a row per event — it cannot be retrofitted.

## Adding an event kind

One new module in `events/` exporting an `EventModule`, plus one line in
`events/index.ts`. Nothing in the year loop changes; if it does, the
compile/simulate split has been broken.

## Commands

```bash
npm test                      # from the repo root
npm run test:watch            # from this package
npx tsx examples/demo.ts      # print a worked 12-year projection
```
