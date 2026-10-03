import { useEffect, useRef, useState } from 'react';

/**
 * Feedback toasts with Undo (docs/ROADMAP-10.md C6). A tiny module-level
 * pub/sub bus — `toast()` is called from wherever a commit lands (mostly
 * `store/planStore.ts`'s mutators), with no dependency on where `<ToastRegion
 * />` happens to be mounted (once, near the top of `App.tsx`). Same shape as
 * `ShortcutSheet.tsx`'s open/close bus, and for the same reason: the caller
 * (the store) has no React tree to reach into.
 *
 * Deliberately hand-rolled rather than a library (the task's own
 * constraint) — the surface here is small: at most 3 stacked, auto-dismiss,
 * pause on hover/focus, one optional action.
 */

export interface ToastAction {
  label: string;
  onClick(): void;
}

export interface ToastOptions {
  action?: ToastAction;
  /** ms before auto-dismiss. Defaults to ~5s (the spec's "about 5s"); an
   *  instructional toast with no undo (e.g. the Monarch how-to) can ask for
   *  longer since there's more to read and nothing to act on quickly. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: string;
  message: string;
}

const MAX_TOASTS = 3;
let toasts: ToastItem[] = [];
const listeners = new Set<(items: ToastItem[]) => void>();

function emit() {
  for (const l of listeners) l(toasts);
}

/** The exported API every commit site calls: `toast('Updated Taxable investments', { action: { label: 'Undo', onClick: undo } })`. */
export function toast(message: string, options: ToastOptions = {}): string {
  const id = `toast-${Math.random().toString(36).slice(2, 10)}`;
  toasts = [...toasts, { id, message, ...options }].slice(-MAX_TOASTS);
  emit();
  return id;
}

export function dismissToast(id: string): void {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

function useToasts(): ToastItem[] {
  const [items, setItems] = useState(toasts);
  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);
  return items;
}

const DEFAULT_DURATION = 5000;

/** Mounted once (`App.tsx`), inside the `.ns` tree so the global
 *  `prefers-reduced-motion` override in `planner.css` (`.ns *` → 1ms
 *  transitions) reaches the entrance transition below for free. */
export function ToastRegion() {
  const items = useToasts();

  return (
    <div className="ns-toast-region" role="status" aria-live="polite">
      {items.map((item) => (
        <ToastCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  const duration = item.duration ?? DEFAULT_DURATION;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // Two rAFs, not one: mounting already-`.ns-toast-in` would skip the
    // transition (the browser paints the "entered" state on the very first
    // frame). One extra frame guarantees the initial (offset) state paints
    // first.
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, []);

  const arm = () => {
    clear();
    timerRef.current = setTimeout(() => dismissToast(item.id), duration);
  };
  const clear = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => {
    arm();
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  return (
    <div
      className={`ns-toast${entered ? ' ns-toast-in' : ''}`}
      onMouseEnter={clear}
      onMouseLeave={arm}
      onFocus={clear}
      onBlur={arm}
    >
      <span className="ns-toast-message">{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="ns-toast-action"
          onClick={() => {
            item.action?.onClick();
            dismissToast(item.id);
          }}
        >
          {item.action.label}
        </button>
      )}
      <button
        type="button"
        className="ns-toast-dismiss"
        aria-label="Dismiss"
        onClick={() => dismissToast(item.id)}
      >
        ×
      </button>
    </div>
  );
}
