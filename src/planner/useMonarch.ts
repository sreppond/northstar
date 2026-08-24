import { useCallback, useEffect, useState } from 'react';
import type { MonarchSnapshot } from '@northstar/engine';
import { ApiError, api, type MonarchStatus } from '../api/client';

/**
 * The Monarch connection, as the planner sees it.
 *
 * Status is fetched once on mount — that is the "if it's been a while" check.
 * It deliberately does not poll: nothing about a snapshot's age changes between
 * renders, and a timer here would mean a background request every few seconds
 * for a number that moves once a day.
 */
export function useMonarch() {
  const [status, setStatus] = useState<MonarchStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [fetched, setFetched] = useState<MonarchSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api.monarchStatus());
    } catch {
      // Running without a backend (the Pages build) is a supported mode, not a
      // failure: the banner simply never appears and the paste path still works.
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.refreshMonarch();
      setFetched(result.snapshot);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.needsReconnect) {
        // The session died. Send them straight to the fix rather than showing
        // an error they cannot act on.
        await load();
        setConnecting(true);
      } else {
        setError(e instanceof Error ? e.message : 'Refresh failed.');
      }
    } finally {
      setBusy(false);
    }
  }, [load]);

  const afterConnect = useCallback(async () => {
    setConnecting(false);
    await load();
    // Connecting is only ever a means to getting data, so pull immediately
    // rather than making them press a second button.
    await refresh();
  }, [load, refresh]);

  const signOut = useCallback(async () => {
    await api.logout();
    window.location.reload();
  }, []);

  return {
    status,
    busy,
    error,
    connecting,
    fetched,
    openConnect: () => setConnecting(true),
    closeConnect: () => setConnecting(false),
    afterConnect,
    clearFetched: () => setFetched(null),
    refresh,
    reload: load,
    signOut,
  };
}
