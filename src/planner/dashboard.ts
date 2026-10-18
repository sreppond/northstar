/**
 * The Monarch header status, as plain language (docs/REDESIGN-V3.md #1).
 * Pure presentation math, unit tested in `dashboard.test.ts`. The Overview
 * dashboard this file once served is gone (v5 replaced it with Net Worth);
 * only the Monarch chip derivation survives.
 */
import type { MonarchStatus } from '../api/client';

// --- Monarch status chip ----------------------------------------------------

export interface MonarchHeaderStatus {
  /** The text shown in the header's status chip — "Manual balances",
      "Monarch · synced 2h ago", etc. */
  text: string;
  /** The one action worth surfacing next to it, if any — folded in from what
      used to be a standalone banner. Absent when there is nothing to do
      (connected and fresh). */
  action?: { label: string; kind: 'connect' | 'refresh' };
}

/**
 * Plain language rather than a date. "12 days" is a judgement you can act on;
 * "captured 2026-08-11" makes you do the arithmetic yourself.
 */
export function describeAge(days: number | null): string {
  if (days === null) return 'unknown age';
  if (days === 0) return 'synced today';
  if (days === 1) return 'synced a day ago';
  if (days < 14) return `synced ${days} days ago`;
  if (days < 60) return `synced ${Math.round(days / 7)} weeks ago`;
  return `synced ${Math.round(days / 30)} months ago`;
}

/** No backend (a static build) and no manual connection both read the same:
    there is simply nothing Monarch to report, so the plan is running on
    whatever balances were typed in. */
export function monarchHeaderStatus(status: MonarchStatus | null): MonarchHeaderStatus {
  if (!status || !status.connected) {
    return { text: 'Manual balances', action: status ? { label: 'Connect', kind: 'connect' } : undefined };
  }
  if (status.needsReconnect) {
    return { text: 'Monarch · reconnect needed', action: { label: 'Reconnect', kind: 'connect' } };
  }
  if (!status.lastCapturedAt) {
    return { text: 'Monarch · not synced yet', action: { label: 'Pull balances', kind: 'refresh' } };
  }
  if (status.stale) {
    return {
      text: `Monarch · ${describeAge(status.ageDays)}`,
      action: { label: 'Refresh', kind: 'refresh' },
    };
  }
  // Current. Offer the refresh without nagging about it.
  return { text: `Monarch · ${describeAge(status.ageDays)}`, action: { label: 'Refresh', kind: 'refresh' } };
}
