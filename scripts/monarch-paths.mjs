/**
 * Where local Monarch data lives on this machine (docs/ROADMAP-10.md Track B).
 *
 * One directory, shared by three consumers that otherwise never talk to each
 * other: `monarch-sync.mjs` (writes it), the Tauri commands in
 * `src-tauri/src/lib.rs` (read it via `app.path().app_data_dir()`, which
 * resolves to the same `com.northstar.planner` folder on macOS), and
 * `vite-monarch-plugin.ts` (reads it for a plain browser dev tab). Keeping
 * the path logic in one place is what keeps those three from drifting apart.
 *
 * `NORTHSTAR_DATA_DIR` overrides the base directory entirely — used by tests
 * so they never touch the real app-data folder on the machine running them.
 */
import { homedir } from 'node:os';
import path from 'node:path';

const APP_IDENTIFIER = 'com.northstar.planner';

/** The app's own data directory — everything Northstar keeps outside `localStorage`. */
export function appDataDir() {
  const override = process.env.NORTHSTAR_DATA_DIR;
  if (override) return path.resolve(override);
  return path.join(homedir(), 'Library', 'Application Support', APP_IDENTIFIER);
}

export function monarchDir() {
  return path.join(appDataDir(), 'monarch');
}

/** The persistent, logged-in Chrome profile `monarch-sync.mjs` reuses run to run. */
export function profileDir() {
  return path.join(monarchDir(), 'profile');
}

/** Where every dated capture, plus `latest.json`, gets written. */
export function snapshotsDir() {
  return path.join(monarchDir(), 'snapshots');
}
