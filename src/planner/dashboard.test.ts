import { describe, expect, it } from 'vitest';
import type { MonarchStatus } from '../api/client';
import { describeAge, monarchHeaderStatus } from './dashboard';

// --- Monarch header status ----------------------------------------------------

function monarch(over: Partial<MonarchStatus> = {}): MonarchStatus {
  return {
    connected: true,
    needsReconnect: false,
    connectedAt: null,
    lastCapturedAt: '2026-08-01',
    lastSource: 'live',
    netWorth: 100_000,
    ageDays: 2,
    stale: false,
    stalenessDays: 30,
    snapshotCount: 4,
    ...over,
  };
}

describe('monarchHeaderStatus', () => {
  it('reads as manual balances with no backend at all', () => {
    expect(monarchHeaderStatus(null)).toEqual({ text: 'Manual balances', action: undefined });
  });

  it('offers Connect when there is a backend but no connection yet', () => {
    const status = monarchHeaderStatus(monarch({ connected: false }));
    expect(status.text).toBe('Manual balances');
    expect(status.action).toEqual({ label: 'Connect', kind: 'connect' });
  });

  it('asks to reconnect when the session died', () => {
    const status = monarchHeaderStatus(monarch({ needsReconnect: true }));
    expect(status.action).toEqual({ label: 'Reconnect', kind: 'connect' });
  });

  it('offers a refresh, without alarm, once connected and current', () => {
    const status = monarchHeaderStatus(monarch());
    expect(status.text).toContain('Monarch');
    expect(status.action).toEqual({ label: 'Refresh', kind: 'refresh' });
  });
});

describe('describeAge', () => {
  it('reads today/yesterday/days/weeks/months in increasingly rounded terms', () => {
    expect(describeAge(0)).toBe('synced today');
    expect(describeAge(1)).toBe('synced a day ago');
    expect(describeAge(5)).toBe('synced 5 days ago');
    expect(describeAge(21)).toBe('synced 3 weeks ago');
    expect(describeAge(90)).toBe('synced 3 months ago');
    expect(describeAge(null)).toBe('unknown age');
  });
});
