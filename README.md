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

React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, Motion, Lucide icons.
