/**
 * The historical counterpart to the forward-looking projection: what net
 * worth actually was, as of a given date, distinct from what the plan
 * projects it to be. Nothing computes this — it is purely user-entered,
 * meant for backfilling an old statement or logging today's real balance.
 *
 * Lives outside `@northstar/engine` on purpose: `runPlan` never reads it,
 * so it has no business in the engine package.
 */
export interface ProgressPoint {
  id: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  netWorth: number;
  assets: number;
  liabilities: number;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function newProgressId(): string {
  return `pp-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyProgressPoint(): ProgressPoint {
  return { id: newProgressId(), date: todayISO(), netWorth: 0, assets: 0, liabilities: 0 };
}

export interface ProgressSummary {
  sortedAscending: ProgressPoint[];
  sortedDescending: ProgressPoint[];
  latest: ProgressPoint | undefined;
  allTimeChange: number;
}

export function summarizeProgress(points: ProgressPoint[]): ProgressSummary {
  const sortedAscending = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const sortedDescending = [...sortedAscending].reverse();
  const latest = sortedDescending[0];
  const earliest = sortedAscending[0];
  const allTimeChange = latest && earliest ? latest.netWorth - earliest.netWorth : 0;
  return { sortedAscending, sortedDescending, latest, allTimeChange };
}
