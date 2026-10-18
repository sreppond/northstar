/**
 * The hand-off between something that opens the account sheet *for a reason*
 * and the form inside it (V5-REVIEW-2 N11).
 *
 * The plan-health alert's "Review" link opens the account sheet because one
 * setting ("Available to spend") strands the money. The sheet used to open at
 * its top, with that control below the fold and nothing pointing at it. The
 * link now asks for the field by name; the form claims the request on mount,
 * scrolls the field to the middle, focuses it and flashes a ring around it.
 *
 * Module-level, like `rowMorph.ts`: the alert (in the shell) and the form (in
 * a sheet `App.tsx` mounts once) share no React tree, and one transient string
 * is not worth a context. A request that isn't claimed within a moment is
 * dropped, so a stale one can't steer a sheet opened some other way later.
 */

export type AccountFocusField = 'withdrawalTiming';

/** A claim comes in the same task or a frame or two later; this is the slack. */
const FRESH_MS = 600;

let pending: { field: AccountFocusField; at: number } | null = null;
/** React's dev double-mount runs the claiming effect twice in one tick; the second run gets the same answer. */
let claimed: { field: AccountFocusField; at: number } | null = null;

/** Ask the next account sheet to open on `field`. Call before `setAccountDraft`. */
export function requestAccountFocus(field: AccountFocusField): void {
  pending = { field, at: performance.now() };
}

/** Claim the request, if there is a fresh one. Each request is claimed once (bar that double-mount). */
export function takeAccountFocus(): AccountFocusField | null {
  const now = performance.now();
  const request = pending;
  pending = null;
  if (request && now - request.at <= FRESH_MS) {
    claimed = { field: request.field, at: now };
    return request.field;
  }
  return claimed && now - claimed.at < 50 ? claimed.field : null;
}
