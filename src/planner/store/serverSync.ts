/**
 * Connecting the plan store to the backend.
 *
 * Called once at startup. Three things happen, in this order:
 *
 *  1. Ask the server what it has.
 *  2. If it has plans, they win — the server is the durable copy, and a browser
 *     that has been cleared or is new to this household should look like the
 *     account, not like a fresh install.
 *  3. If it has none but the browser does, push the local set up. That is the
 *     one-time migration off localStorage, and it happens without a prompt
 *     because there is nothing to decide: an empty server cannot be the more
 *     correct of the two.
 */
import type { Plan } from '@northstar/engine';
import { api } from '../../api/client';
import { enableServerSync, hydrateFromServer, usePlanStore } from './planStore';

/** Coalesces bursts of edits into one request. */
function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: T) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export async function startServerSync(): Promise<void> {
  let serverPlans: Plan[];
  try {
    serverPlans = (await api.listPlans()).plans;
  } catch {
    // No backend, or not signed in. The app works from localStorage alone.
    return;
  }

  const local = usePlanStore.getState().plans;

  if (serverPlans.length > 0) {
    hydrateFromServer(serverPlans);
  } else if (local.length > 0) {
    // A failure here is not worth surfacing: the next edit retries, and the
    // local copy is intact either way.
    await api.syncPlans(local).catch(() => undefined);
  }

  // Typing in a drawer fires a change per keystroke. Half a second is long
  // enough to collapse a burst and short enough that closing the laptop
  // straight after an edit still saves it.
  const push = debounce((plans: Plan[]) => {
    void api.syncPlans(plans).catch(() => undefined);
  }, 500);

  enableServerSync(push);
}
