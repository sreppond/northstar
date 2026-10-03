/**
 * The one keyboard-shortcut registry (docs/ROADMAP-10.md C6). Every global
 * shortcut — page jumps, add event, settings, undo/redo, the palette, and
 * the shortcut sheet itself — is decided in one place (`matchShortcut`) so
 * there is exactly one keydown listener and no two handlers can silently
 * double-fire the same key (which is what having ⌘Z wired in both
 * `PlannerContext.tsx` and here would do).
 *
 * `matchShortcut` and `isTypingTarget` are plain functions with no DOM
 * dependency beyond duck-typed shapes, so they're unit-testable without a
 * browser (this repo's vitest config runs in plain Node — see
 * `shortcuts.test.ts`). `useGlobalShortcuts` is the only piece that touches
 * `window`/`document`, and it's a thin dispatcher over the same function.
 */
import { useEffect, useRef } from 'react';
import { NAV_ITEMS } from './Sidebar';

/** The first 9 rail destinations, in rail order — ⌘1–⌘9. Reports (the 10th
 *  item) intentionally has no number shortcut; nine is the limit a human
 *  reads off a keyboard's top row without counting. */
const PAGE_SHORTCUTS = NAV_ITEMS.slice(0, 9);

export type ShortcutAction =
  | { type: 'navigate'; path: string }
  | { type: 'newEvent' }
  | { type: 'settings' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'palette' }
  | { type: 'help' };

export interface ShortcutHandlers {
  navigate(path: string): void;
  newEvent(): void;
  openSettings(): void;
  undo(): void;
  redo(): void;
  togglePalette(): void;
  openHelp(): void;
}

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey?: boolean;
}

/** A duck-typed activeElement check — no `instanceof HTMLElement`, so this
 *  runs the same under a real DOM and under a plain object in a test. */
export function isTypingTarget(el: unknown): boolean {
  if (!el || typeof el !== 'object') return false;
  const node = el as { tagName?: unknown; isContentEditable?: unknown };
  if (node.isContentEditable === true) return true;
  return node.tagName === 'INPUT' || node.tagName === 'TEXTAREA';
}

/** Real `navigator` in the browser; a fake one in tests. */
export function isMac(nav: Pick<Navigator, 'platform' | 'userAgent'> = navigator): boolean {
  return /Mac|iPod|iPhone|iPad/.test(nav.platform || nav.userAgent || '');
}

/**
 * Decides which shortcut (if any) a keydown matches — no side effects, no
 * typing/focus guard (that's `useGlobalShortcuts`'s job, since Esc/⌘K need
 * to bypass it and this function has no notion of "except").
 */
export function matchShortcut(e: KeyLike): ShortcutAction | null {
  if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    return { type: 'help' };
  }

  if (!(e.metaKey || e.ctrlKey)) return null;
  const key = e.key.toLowerCase();

  if (key >= '1' && key <= '9') {
    const item = PAGE_SHORTCUTS[Number(key) - 1];
    return item ? { type: 'navigate', path: item.to } : null;
  }
  if (key === 'n') return { type: 'newEvent' };
  if (key === ',') return { type: 'settings' };
  if (key === 'z') return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
  if (key === 'k') return { type: 'palette' };
  return null;
}

/**
 * Wires the registry to one `window` keydown listener. Handlers are kept in
 * a ref so callers don't need to memoize the object they pass in — the
 * listener itself is attached exactly once.
 */
export function useGlobalShortcuts(handlers: ShortcutHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const action = matchShortcut(e);
      if (!action) return;

      // Ignore shortcuts while typing, except Esc (not this registry's
      // concern — every dialog already closes on its own Escape listener)
      // and ⌘K, which needs to work from inside e.g. the palette's own
      // search field or any other text input in the app.
      if (isTypingTarget(document.activeElement) && action.type !== 'palette') return;

      e.preventDefault();
      switch (action.type) {
        case 'navigate':
          ref.current.navigate(action.path);
          break;
        case 'newEvent':
          ref.current.newEvent();
          break;
        case 'settings':
          ref.current.openSettings();
          break;
        case 'undo':
          ref.current.undo();
          break;
        case 'redo':
          ref.current.redo();
          break;
        case 'palette':
          ref.current.togglePalette();
          break;
        case 'help':
          ref.current.openHelp();
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

export interface ShortcutEntry {
  keys: string;
  label: string;
}

/** The mod key's display glyph — ⌘ on Mac, "Ctrl" everywhere else. */
function modLabel(): string {
  return isMac() ? '⌘' : 'Ctrl+';
}

/** Human list for the shortcut sheet (`ShortcutSheet.tsx`) and anywhere
 *  else that wants to print the current keymap — computed from the same
 *  `PAGE_SHORTCUTS`/registry `matchShortcut` reads, so it can't drift. */
export function shortcutList(): ShortcutEntry[] {
  const mod = modLabel();
  const shiftMod = isMac() ? '⇧⌘' : 'Ctrl+Shift+';
  return [
    ...PAGE_SHORTCUTS.map((item, i) => ({ keys: `${mod}${i + 1}`, label: item.label })),
    { keys: `${mod}N`, label: 'Add event' },
    { keys: `${mod},`, label: 'Settings' },
    { keys: `${mod}Z`, label: 'Undo' },
    { keys: `${shiftMod}Z`, label: 'Redo' },
    { keys: `${mod}K`, label: 'Command palette' },
    { keys: '?', label: 'Keyboard shortcuts' },
  ];
}
