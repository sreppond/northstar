import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Per-plan dismissed alerts (docs/REDESIGN-V5.md §4.3, R2).
 *
 * An alert is hidden by `${id}:${signature}`, not by id alone. The signature
 * is whatever makes this instance of the problem *this* problem (a plan
 * check's message, the "runs dry" year + shortfall), so editing the plan
 * into a different problem brings the alert back instead of staying buried
 * under a dismissal that was about something else.
 *
 * Persisted in `localStorage['ns-dismissed:' + planId]` as a JSON array.
 * Dismissals are a per-device nicety, not plan data: they never enter the
 * plan store, undo history or server sync. Every storage touch is wrapped in
 * try/catch (private windows, blocked site data and Tauri contexts throw),
 * and the in-memory copy below is the source of truth for the session, so a
 * throwing storage degrades to "hidden until reload" rather than an error.
 *
 * Alert ids must not contain ':' — `restore(id)` matches on the `id:` prefix.
 */

export const DISMISS_STORAGE_PREFIX = 'ns-dismissed:';

export function dismissalKey(id: string, signature: string): string {
  return `${id}:${signature}`;
}

/** Tolerant parse: anything that isn't a JSON array of strings is "nothing
    dismissed" (a corrupted or hand-edited value must not crash the shell). */
export function parseDismissed(raw: string | null | undefined): ReadonlySet<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

export function serializeDismissed(set: ReadonlySet<string>): string {
  return JSON.stringify([...set].sort());
}

/** The set with every entry for one alert id removed (all signatures), or
    emptied when no id is given. */
export function withoutAlert(set: ReadonlySet<string>, id?: string): ReadonlySet<string> {
  if (id === undefined) return new Set();
  const prefix = `${id}:`;
  return new Set([...set].filter((k) => !k.startsWith(prefix)));
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** A small external store: a per-plan in-memory set, mirrored to storage.
    Separate from React so it's testable, and so several components (an
    Alert on a page, the header menu's "Show hidden (n)") see one another's
    changes without a context provider. */
export function createDismissalStore(getStorage: () => StorageLike | undefined) {
  const sets = new Map<string, ReadonlySet<string>>();
  const listeners = new Map<string, Set<() => void>>();
  const EMPTY: ReadonlySet<string> = new Set();

  const storageKey = (planId: string) => DISMISS_STORAGE_PREFIX + planId;

  function read(planId: string): ReadonlySet<string> {
    const cached = sets.get(planId);
    if (cached) return cached;
    let raw: string | null = null;
    try {
      raw = getStorage()?.getItem(storageKey(planId)) ?? null;
    } catch {
      raw = null;
    }
    const parsed = parseDismissed(raw);
    sets.set(planId, parsed);
    return parsed;
  }

  function write(planId: string, next: ReadonlySet<string>) {
    sets.set(planId, next);
    try {
      const storage = getStorage();
      if (next.size === 0) storage?.removeItem(storageKey(planId));
      else storage?.setItem(storageKey(planId), serializeDismissed(next));
    } catch {
      /* memory copy still holds for this session */
    }
    listeners.get(planId)?.forEach((l) => l());
  }

  return {
    get: (planId: string) => (planId ? read(planId) : EMPTY),
    dismiss(planId: string, id: string, signature: string) {
      const current = read(planId);
      const key = dismissalKey(id, signature);
      if (current.has(key)) return;
      write(planId, new Set(current).add(key));
    },
    restore(planId: string, id?: string) {
      const current = read(planId);
      if (current.size === 0) return;
      write(planId, withoutAlert(current, id));
    },
    subscribe(planId: string, listener: () => void) {
      let set = listeners.get(planId);
      if (!set) listeners.set(planId, (set = new Set()));
      set.add(listener);
      return () => {
        set.delete(listener);
      };
    },
    /** Test seam: forget the in-memory copy so the next read hits storage. */
    reset: () => sets.clear(),
  };
}

const store = createDismissalStore(() => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined; // accessing `localStorage` itself can throw
  }
});

export interface Dismissals {
  /** True when this exact id + signature was dismissed. */
  isDismissed(id: string, signature: string): boolean;
  dismiss(id: string, signature: string): void;
  /** Un-hide one alert id (every signature), or everything when omitted. */
  restore(id?: string): void;
  /** How many dismissals are active, for "Show hidden alerts (n)". */
  hiddenCount: number;
}

export function useDismissals(planId: string): Dismissals {
  const subscribe = useCallback((l: () => void) => store.subscribe(planId, l), [planId]);
  const set = useSyncExternalStore(
    subscribe,
    () => store.get(planId),
    () => store.get(''),
  );

  return useMemo<Dismissals>(
    () => ({
      isDismissed: (id, signature) => set.has(dismissalKey(id, signature)),
      dismiss: (id, signature) => store.dismiss(planId, id, signature),
      restore: (id) => store.restore(planId, id),
      hiddenCount: set.size,
    }),
    [set, planId],
  );
}
