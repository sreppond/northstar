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

Real balances can be read out of [Monarch Money][monarch] three ways, all
covered in [`docs/MONARCH-IMPORT.md`](docs/MONARCH-IMPORT.md):

- **The desktop app, monthly, local-only:** `npm run monarch:sync` drives a
  real Chrome against a persistent local profile — headed the first time so
  you log in by hand (no credentials ever touch the script), headless after
  that. It writes a snapshot to disk; the app notices it itself and opens the
  same review drawer. Nothing but Monarch is ever called, and nothing leaves
  this machine.
- **The server:** connect once and press Refresh — it talks to Monarch's
  GraphQL API directly, which returns account subtypes and interest rates the
  MCP tool drops, so it classifies retirement accounts automatically instead
  of asking.
- **Capture and paste**, via [`robcerda/monarch-mcp-server`][mcp], the
  fallback that needs neither the desktop app nor the server:

```bash
node scripts/monarch-capture.mjs accounts.json [cashflow.json] > snap.json
```

Whichever path produced it, an import writes balances and **nothing else**:
every rate, tax assumption and withdrawal rule stays as you set it.

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
