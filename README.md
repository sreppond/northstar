# Northstar Forecast

A strategic growth & tax simulator: a high-fidelity compound growth calculator
with variable contribution phases, life-milestone timeline annotations, and
annual/monthly tax drag simulation across two account modes — taxable
brokerage and variable annuity.

Ported from an original Google AI Studio prototype.

## Run locally

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev
```

Then open http://localhost:3000.

## Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — production build to `dist/`
- `npm run build:pages` — production build for GitHub Pages (uses the `/northstar/` base path)
- `npm run preview` — preview the production build locally
- `npm run lint` — TypeScript type-check (`tsc --noEmit`)

## Running the full app (with the server)

Northstar can run as a static bundle (localStorage, no backend) or with its
own single-user server, which holds your plans and Monarch balances and can
pull fresh ones on demand:

```bash
cp .env.example .env
npm run generate-key          # paste the output into .env
docker compose up -d          # → http://127.0.0.1:4000
```

The first page load asks you to set a password. See
[`docs/BACKEND.md`](docs/BACKEND.md) for configuration, the security model, and
the API.

## Monarch import

Real balances can be read out of [Monarch Money][monarch] via
[`robcerda/monarch-mcp-server`][mcp] — capture, paste, review the diff, save:

```bash
node scripts/monarch-capture.mjs accounts.json [cashflow.json] > snap.json
```

An import writes balances and **nothing else**: every rate, tax assumption and
withdrawal rule stays as you set it. See
[`docs/MONARCH-IMPORT.md`](docs/MONARCH-IMPORT.md).

With the server running you do not need the capture step at all — connect once
and press Refresh. The server talks to Monarch's GraphQL API directly, which
returns account subtypes and interest rates the MCP tool drops, so it classifies
retirement accounts automatically instead of asking.

[monarch]: https://www.monarchmoney.com
[mcp]: https://github.com/robcerda/monarch-mcp-server

## Persistence

All inputs auto-save to the browser's `localStorage` and restore on your next
visit. You can also save named scenarios from the sidebar and reload or
delete them later — everything is stored locally in the browser, no backend.

## Deployment

Every push to `main` builds and deploys to GitHub Pages via
`.github/workflows/deploy.yml`. One-time setup: in the repo's
**Settings → Pages**, set "Source" to **GitHub Actions**. After that, the
site is live at `https://sreppond.github.io/northstar/`.

## Stack

React 19, TypeScript, Vite, Zustand on the front end; Fastify, SQLite
(better-sqlite3) and zod on the server; a dependency-free projection engine in
`packages/engine`.
