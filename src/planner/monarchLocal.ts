/**
 * Local-only discovery of Monarch snapshots (docs/ROADMAP-10.md Track B).
 *
 * Two runtimes, one contract. The packaged desktop app reads snapshots
 * through Tauri commands (`src-tauri/src/lib.rs`); a plain browser tab
 * running against `vite dev` reads the same files through a dev-only Vite
 * middleware (`scripts/vite-monarch-plugin.ts`). Neither exists in a
 * production browser build (the GitHub Pages bundle) — there is no server
 * there to expose this on, and every function here degrades to "nothing
 * found" rather than throwing, the same way `useMonarch`'s server calls
 * degrade to "no backend" when the Docker server isn't running.
 *
 * The one thing this module never does is talk to Monarch. Everything it
 * reads is a JSON file `scripts/monarch-sync.mjs` already wrote to this
 * machine's disk — it only ever reads THAT.
 */
import { invoke, isTauri as runningInTauri } from '@tauri-apps/api/core';
import type { MonarchSnapshot, Plan } from '@northstar/engine';
import { parseSnapshot } from '@northstar/engine';

export interface SnapshotListEntry {
  file: string;
  capturedAt: string;
}

/** True when this code is running inside the packaged Tauri app rather than
 *  a plain browser tab. Wrapped in a try/catch because the check itself
 *  touches a global (`window.__TAURI_INTERNALS__`) that a very old webview
 *  or a test environment might not have. */
export function isTauri(): boolean {
  try {
    return runningInTauri();
  } catch {
    return false;
  }
}

/**
 * The most recent local snapshot, or `null` when there is none yet — or no
 * local backend to ask at all, which is the normal state for a production
 * browser build. Never throws: a snapshot file that fails to parse or fails
 * `parseSnapshot`'s validation is treated the same as no snapshot, since
 * there is nothing a caller could usefully do differently either way.
 */
export async function fetchLatestSnapshot(): Promise<MonarchSnapshot | null> {
  const raw = await fetchLatestRaw();
  if (!raw) return null;
  try {
    return parseSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function fetchLatestRaw(): Promise<string | null> {
  if (isTauri()) {
    try {
      return (await invoke<string | null>('monarch_latest_snapshot')) ?? null;
    } catch {
      return null;
    }
  }
  try {
    const response = await fetch('/__local/monarch/latest');
    return response.ok ? await response.text() : null;
  } catch {
    // No dev server, or the route isn't there (a production `vite preview`,
    // for instance) — same as "nothing found".
    return null;
  }
}

/** Every local snapshot on disk, newest first. Empty wherever there is no
 *  local backend to ask (see `fetchLatestSnapshot`). */
export async function listSnapshots(): Promise<SnapshotListEntry[]> {
  if (isTauri()) {
    try {
      const list = await invoke<SnapshotListEntry[]>('monarch_list_snapshots');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  try {
    const response = await fetch('/__local/monarch/list');
    if (!response.ok) return [];
    const list = (await response.json()) as unknown;
    return Array.isArray(list) ? (list as SnapshotListEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * A durable copy of every plan, written outside `localStorage` — a webview's
 * storage is a browser cache, not a backup. Tauri-only, and a deliberate
 * no-op everywhere else: a plain browser tab has no filesystem of its own to
 * write to, and that is not an error, just a mode this feature doesn't apply
 * in. Fire-and-forget, the same as `serverSync.ts`'s push to the server —
 * callers should never await this to know whether a plan save succeeded.
 */
export async function backupPlans(plans: Plan[]): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('write_plans_backup', { json: JSON.stringify(plans) });
  } catch {
    // A failed backup must never surface as a broken save — by the time this
    // runs, the primary write (localStorage) has already succeeded.
  }
}
