import { useCallback, useEffect, useState } from 'react';
import type { MonarchSnapshot } from '@northstar/engine';
import { fetchLatestSnapshot } from './monarchLocal';

const LAST_APPLIED_KEY = 'northstar:monarch:lastApplied';

/**
 * "Is there a fresher local Monarch snapshot than the one already applied?"
 * (docs/ROADMAP-10.md Track B). This is the drop-in half of the loop: the
 * owner runs `npm run monarch:sync` in a terminal roughly monthly, and this
 * hook is how the app itself notices without anyone pasting anything.
 *
 * It polls nothing — a snapshot only ever changes when the sync script
 * writes one, which cannot happen while the app is the foreground window. So
 * it checks once on mount and again on window focus: the moment the owner is
 * most likely to have just run the sync in another window and switched back.
 *
 * "New" means the snapshot's `capturedAt` is strictly newer than the last
 * date the owner actually applied (persisted in localStorage, so it survives
 * a reload) — not merely newer than the last time this hook happened to look.
 *
 * The UI that surfaces this (a banner/chip on Overview, ROADMAP-10.md's
 * Track C4) is a later wave; this hook is written now, fully working and
 * ready for that banner to call — `markApplied` is the piece it will need,
 * and it should only ever be called once the owner has actually reviewed and
 * saved a snapshot's diff (`ImportDrawer`'s `onImport`), never merely to
 * dismiss the hint.
 */
export function useLocalMonarch() {
  const [snapshot, setSnapshot] = useState<MonarchSnapshot | null>(null);
  const [lastAppliedAt, setLastAppliedAt] = useState<string | null>(readLastApplied);

  const check = useCallback(async () => {
    setSnapshot(await fetchLatestSnapshot());
  }, []);

  useEffect(() => {
    void check();
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [check]);

  const markApplied = useCallback((capturedAt: string) => {
    writeLastApplied(capturedAt);
    setLastAppliedAt(capturedAt);
  }, []);

  /** Undoes a `markApplied` call (docs/W3-REVIEW.md #8) — restores whatever
   *  `lastAppliedAt` was immediately before that import, `null` included, so
   *  Undo after an import brings the "Review" banner back exactly as it was. */
  const resetApplied = useCallback((capturedAt: string | null) => {
    if (capturedAt) {
      writeLastApplied(capturedAt);
    } else {
      clearLastApplied();
    }
    setLastAppliedAt(capturedAt);
  }, []);

  const isNew = Boolean(snapshot && (!lastAppliedAt || snapshot.capturedAt > lastAppliedAt));

  return { snapshot, isNew, lastAppliedAt, markApplied, resetApplied, refresh: check };
}

function readLastApplied(): string | null {
  try {
    return localStorage.getItem(LAST_APPLIED_KEY);
  } catch {
    return null;
  }
}

function writeLastApplied(capturedAt: string): void {
  try {
    localStorage.setItem(LAST_APPLIED_KEY, capturedAt);
  } catch {
    // Private browsing or a full quota — losing this is survivable, the
    // freshness check just re-offers the same snapshot next launch.
  }
}

function clearLastApplied(): void {
  try {
    localStorage.removeItem(LAST_APPLIED_KEY);
  } catch {
    // Same as above — not fatal either way.
  }
}
