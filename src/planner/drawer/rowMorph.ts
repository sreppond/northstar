/**
 * The hand-off between a row and the account sheet it opens (V5-REVIEW-1 F25).
 *
 * Spencer's brief was "smooth animation to a popout": the row's icon and name
 * should lift off the row and land as the sheet's header. A `layoutId` morph
 * can't do that here (see `AccountSheetHead`), so it is a FLIP done by hand:
 * the row notes where its icon and label are on screen at the moment of the
 * click, and the sheet header, on mount, picks that up and flies a copy from
 * there to where the header will rest.
 *
 * Module-level, like `Sheet`'s `lastPressed`: the row and the connected sheet
 * (mounted once by `App.tsx`) share no React tree or prop, and a context for
 * one transient rectangle would be heavier than this. A request that isn't
 * claimed within a moment is dropped, so a stale row can't animate a sheet
 * opened some other way later.
 */

export interface RowOrigin {
  accountClass: string;
  /** Viewport rectangles at click time. */
  icon: DOMRect;
  label: DOMRect;
  /** The row's label text, and its font size so the flight can scale it. */
  text: string;
  fontSize: number;
  at: number;
}

/** A click is claimed by the sheet in the same task or the next frame or two; this is the slack. */
const FRESH_MS = 600;

let pending: RowOrigin | null = null;

/**
 * Note a row about to open an account sheet. The row marks its icon and label
 * with `data-morph="icon"` and `data-morph="label"`. A row without both leaves
 * nothing behind, and the sheet just enters as it normally does.
 */
export function rememberRow(row: Element | null, accountClass: string): void {
  pending = null;
  if (!row) return;
  const icon = row.querySelector('[data-morph="icon"]');
  const label = row.querySelector('[data-morph="label"]');
  if (!icon || !label) return;
  pending = {
    accountClass,
    icon: icon.getBoundingClientRect(),
    label: label.getBoundingClientRect(),
    text: label.textContent ?? '',
    fontSize: parseFloat(getComputedStyle(label).fontSize) || 14,
    at: performance.now(),
  };
}

/** The sheet claims the origin (once). Undefined when there is none, or it is stale or for another class. */
export function takeRowOrigin(accountClass: string): RowOrigin | undefined {
  const origin = pending;
  pending = null;
  if (!origin || origin.accountClass !== accountClass) return undefined;
  if (performance.now() - origin.at > FRESH_MS) return undefined;
  return origin;
}
