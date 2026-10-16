import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  AnimatePresence,
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  usePresence,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from 'motion/react';
import { X } from 'lucide-react';
import { releaseVelocity, resistedOffset, shouldDismiss, type PointerSample } from './sheetMath';
import './sheet.css';

/**
 * The popout shell (docs/REDESIGN-V5.md §3.6): account details, slice
 * drill-downs, the person sheet, What-if. A right-side panel on desktop, a
 * bottom sheet under 768px. It replaces the drawer chrome only; form bodies
 * move over unchanged.
 *
 * One motion value, `pos`, is the whole sheet. It is the offset along the
 * dismiss axis (0 open, `travel` closed), and the translate, the panel's
 * opacity, the backdrop blur and the scrim are all derived from it. That is
 * what makes it interruptible (apple-design §3): a drag, a spring and a
 * re-open all just move `pos`, always starting from where it is now, with
 * its velocity carried through. Enter and exit are the same path run in
 * opposite directions (§7).
 */

export interface SheetProps {
  open: boolean;
  onClose(): void;
  /** The sheet's name: the default header and the dialog's accessible name. */
  title: ReactNode;
  /** Replaces the default title in the header (the × stays). The slot for a
      shared-element `layoutId` morph from a row's label and value. */
  header?: ReactNode;
  children: ReactNode;
  /** Pinned under the scrolling body, e.g. Save / Cancel. */
  footer?: ReactNode;
  /** Desktop width; defaults to `min(600px, 100vw)`. Ignored on phones. */
  width?: number | string;
  /** The id of the element that names the dialog, when `header` supplies a
      heading of its own. Defaults to the built-in title. */
  labelledBy?: string;
}

const DEFAULT_WIDTH = 'min(600px, 100vw)';
/** Extra travel past the panel's own size, so its shadow is off-screen when
    closed. */
const SHADOW_ALLOWANCE = 48;
/** Below this the sheet is a bottom sheet (§3.6). `useBreakpoint`'s `phone`
    is 640px, a different breakpoint, so this reads the media query itself. */
const PHONE_QUERY = '(max-width: 767.98px)';
const BLUR_PX = 20;
const SPRING = { type: 'spring', bounce: 0, duration: 0.38 } as const;
const FADE = { duration: 0.2, ease: 'easeOut' } as const;
/** Pointer travel before a press becomes a drag, and the direction test that
    separates it from a scroll (§10 of the skill: hysteresis ~10px). */
const DRAG_THRESHOLD = 8;

/* --- shared stack ----------------------------------------------------------
   A sheet opened from a sheet pushes the parent back (§3.6). Module-level so
   sibling `Sheet`s see each other without a provider, and so the rail and
   page are made `inert` once for the whole stack. Same idiom as Sidebar.tsx's
   mobile sheet: no hand-rolled trap for the page, just `inert` on what the
   sheet floats over. */

let stack: string[] = [];
const stackListeners = new Set<() => void>();
const BACKGROUND = '.ns-main, .ns-rail, .ns-topbar';

function setStack(next: string[]) {
  stack = next;
  for (const el of document.querySelectorAll(BACKGROUND)) {
    if (next.length > 0) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }
  stackListeners.forEach((l) => l());
}
const subscribeStack = (l: () => void) => {
  stackListeners.add(l);
  return () => {
    stackListeners.delete(l);
  };
};
const getStack = () => stack;

/* Safari/WKWebView don't focus a button on click, so `activeElement` would be
   `<body>` and focus could never return to the trigger. Remember the last
   thing pressed instead. */
let lastPressed: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (e) => {
      lastPressed = (e.target as Element | null)?.closest<HTMLElement>('button, a, [role="button"], [tabindex]') ?? null;
    },
    true,
  );
}

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (l) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', l);
      return () => mq.removeEventListener('change', l);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function Sheet(props: SheetProps) {
  const { open } = props;
  const id = useId();
  const current = useSyncExternalStore(subscribeStack, getStack, getStack);
  const trigger = useRef<HTMLElement | null>(null);

  // Layout effect, not passive: the layer below moves focus into the sheet in
  // a passive effect, so the trigger has to be read before that happens.
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    trigger.current =
      active instanceof HTMLElement && active !== document.body ? active : lastPressed;
    setStack([...stack, id]);
    return () => {
      setStack(stack.filter((x) => x !== id));
      const t = trigger.current;
      // A frame later: when this was a child sheet, its parent only becomes
      // focusable again (no longer `inert`) after React re-renders.
      requestAnimationFrame(() => {
        if (t?.isConnected) t.focus({ preventScroll: true });
      });
    };
  }, [open, id]);

  // Portalled into `.ns` rather than <body>: the page's tokens, focus ring
  // and reduced-motion rules are all scoped there, and it is a sibling of
  // `.ns-main`/the rail, so making those `inert` doesn't disable the sheet.
  const root = document.querySelector('.ns') ?? document.body;
  return createPortal(
    <AnimatePresence>
      {open && (
        <SheetLayer
          key="layer"
          {...props}
          depth={Math.max(0, current.indexOf(id))}
          // Not in the stack yet (the first render, before the layout effect
          // pushes it) counts as top: otherwise the panel would mount `inert`
          // and refuse its own focus.
          isTop={!current.includes(id) || current[current.length - 1] === id}
        />
      )}
    </AnimatePresence>,
    root,
  );
}

const INTERACTIVE =
  'button, a[href], input, select, textarea, label, summary, [contenteditable="true"], [data-sheet-nodrag]';
const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** True when something between the press and the panel can scroll sideways, so
    a horizontal swipe there is that element's, not the sheet's. */
function scrollsHorizontally(from: Element, panel: Element): boolean {
  for (let el: Element | null = from; el && el !== panel; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === 'auto' || overflow === 'scroll') return true;
    }
  }
  return false;
}

function SheetLayer({
  onClose,
  title,
  header,
  children,
  footer,
  width,
  labelledBy,
  depth,
  isTop,
}: SheetProps & { depth: number; isTop: boolean }) {
  const titleId = useId();
  const phone = useMediaQuery(PHONE_QUERY);
  // Reduced motion (skill §14): no slide, no spring, no push-back; an opacity
  // cross-fade only. Reduced transparency: the CSS token goes solid, and the
  // inline blur below is simply not applied.
  const reduce = useReducedMotion() ?? false;
  const reduceTransparency = useMediaQuery('(prefers-reduced-transparency: reduce)');
  const [isPresent, safeToRemove] = usePresence();

  const panelRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Distance from open to fully closed. An estimate for the first frame, then
  // measured, so the spring covers the panel's real width.
  const travel = useRef(
    (phone ? window.innerHeight * 0.92 : Math.min(typeof width === 'number' ? width : 600, window.innerWidth)) +
      SHADOW_ALLOWANCE,
  );
  const pos = useMotionValue(travel.current);
  const anim = useRef<AnimationPlaybackControls | null>(null);
  /** Set by a drag release so the exit spring starts at the finger's speed. */
  const handoff = useRef<number | undefined>(undefined);

  const measure = useCallback(() => {
    const el = panelRef.current;
    if (!el) return;
    const size = phone ? el.offsetHeight : el.offsetWidth;
    if (size) travel.current = size + SHADOW_ALLOWANCE;
  }, [phone]);

  useLayoutEffect(() => {
    const before = travel.current;
    measure();
    // Still parked closed (the animation hasn't started): re-park at the
    // measured distance so the first frame is exactly off-screen.
    if (pos.get() === before) pos.set(travel.current);
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, pos]);

  const run = useCallback(
    (target: number, velocity?: number, onComplete?: () => void) => {
      anim.current?.stop();
      anim.current = animate(
        pos,
        target,
        reduce ? { ...FADE, onComplete } : { ...SPRING, velocity, onComplete },
      );
    },
    [pos, reduce],
  );

  // Enter and exit in one effect, so re-opening mid-exit (or closing
  // mid-enter) is just a new target for the same value, from where it is.
  useEffect(() => {
    if (isPresent) {
      run(0);
    } else {
      const v = handoff.current ?? pos.getVelocity();
      handoff.current = undefined;
      run(travel.current, v, safeToRemove ?? undefined);
    }
  }, [isPresent]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => anim.current?.stop(), []);

  // Derived from `pos`, so dragging fades the sheet exactly as closing does.
  const progress = useTransform(pos, (v) => 1 - Math.min(1, Math.max(0, v / travel.current)));
  const fade = useTransform(progress, [0, 0.45], [0, 1], { clamp: true });
  const blurPx = useTransform(progress, (p) => p * BLUR_PX);
  const blur = useMotionTemplate`blur(${blurPx}px) saturate(1.6)`;

  // Pushed back by a sheet opened over it: scale .96, dimmed further by that
  // child's own scrim (§3.6).
  const push = useMotionValue(0);
  // A child sheet is the same size as its parent, so scale alone would hide
  // the parent entirely. Shift it back along the dismiss axis too, so a
  // sliver still shows behind the child: the stack reads as layers (skill
  // §12). Animated directly rather than derived from `push`.
  const shift = useMotionValue(0);
  useEffect(() => {
    const to = isTop ? 0 : 1;
    const opts = reduce ? FADE : SPRING;
    const a = animate(push, to, opts);
    const b = animate(shift, to * (phone ? -48 : -56), opts);
    return () => {
      a.stop();
      b.stop();
    };
  }, [isTop, push, shift, phone, reduce]);
  const pushScale = useTransform(push, [0, 1], [1, 0.96]);
  // The CSS `translate` property composes with the `scale` transform and with
  // nothing else of ours, so the sheet's own offset and the push shift can be
  // summed in a calc() rather than in a derived value.
  const moveX = useMotionTemplate`calc(${pos}px + ${shift}px) 0px`;
  const moveY = useMotionTemplate`0px calc(${pos}px + ${shift}px)`;

  // Focus moves into the sheet (the trigger is restored by `Sheet`).
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  // Esc closes the top sheet only.
  useEffect(() => {
    if (!isTop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isTop]);

  // The scrim swallows wheel scrolls so the page behind (and its `inert`
  // content) doesn't drift under a modal. Native + non-passive: React's
  // synthetic wheel listener can't preventDefault.
  useEffect(() => {
    const el = scrimRef.current;
    if (!el) return;
    const stop = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  // Keep Tab inside the dialog. `inert` already removes the page and rail;
  // this wraps the edges so focus can't escape to toasts or browser chrome.
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const panel = panelRef.current;
    // React events bubble through portals: a stacked child's keystrokes reach
    // this handler too, and aren't ours to wrap.
    if (!panel || !panel.contains(e.target as Node)) return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /* --- drag to dismiss (skill §2, §5, §6, §9) -------------------------------
     Horizontal on desktop, vertical on a phone. Pointer capture keeps the
     gesture alive off the panel; the delta from where the drag *began* (not
     from the press) keeps it glued to the finger with no jump at the
     threshold, and starting from the live `pos` means grabbing a sheet that
     is still settling just picks it up. */
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    started: boolean;
    base: number;
    origin: number;
    samples: PointerSample[];
  } | null>(null);

  const axisOf = (e: { clientX: number; clientY: number }) => (phone ? e.clientY : e.clientX);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (reduce || !isTop || !isPresent) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as Element;
    const panel = e.currentTarget;
    if (!panel.contains(target) || target.closest(INTERACTIVE)) return; // a portalled child's press bubbles here
    const onHandle = Boolean(target.closest('[data-sheet-handle]'));
    // A phone's body scrolls vertically, so only the header drags it there.
    // On desktop, touch and pen can swipe from anywhere (unless the thing
    // under the finger scrolls sideways); a mouse drags from the header or
    // the panel's leading edge, so selecting text in the body never moves it.
    const eligible = phone
      ? onHandle
      : e.pointerType === 'mouse'
        ? onHandle || e.clientX - panel.getBoundingClientRect().left < 14
        : onHandle || !scrollsHorizontally(target, panel);
    if (!eligible) return;
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      started: false,
      base: 0,
      origin: 0,
      samples: [],
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.started) {
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      const along = phone ? dy : dx;
      const across = phone ? dx : dy;
      // Mostly sideways on a phone, or mostly vertical on desktop: that's a
      // scroll or a selection, not ours. Drop the gesture.
      if (Math.abs(along) <= Math.abs(across)) {
        drag.current = null;
        return;
      }
      anim.current?.stop();
      d.started = true;
      d.base = pos.get();
      d.origin = axisOf(e);
      e.currentTarget.setPointerCapture(e.pointerId);
      e.currentTarget.classList.add('ns-sheet-dragging');
    }
    const p = axisOf(e);
    pos.set(resistedOffset(d.base + (p - d.origin), travel.current));
    d.samples.push({ t: e.timeStamp, p });
    if (d.samples.length > 8) d.samples.shift();
  };

  const endDrag = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.started) return;
    e.currentTarget.classList.remove('ns-sheet-dragging');
    const v = e.type === 'pointercancel' ? 0 : releaseVelocity(d.samples, e.timeStamp);
    if (shouldDismiss(pos.get(), v, travel.current)) {
      // Close: the exit effect springs from here at the finger's speed.
      handoff.current = v;
      onCloseRef.current();
    } else {
      run(0, v);
    }
  };

  const labelAttrs = labelledBy
    ? { 'aria-labelledby': labelledBy }
    : header
      ? { 'aria-label': typeof title === 'string' ? title : 'Details' }
      : { 'aria-labelledby': titleId };

  const style = {
    ...(reduce ? {} : { translate: phone ? moveY : moveX }),
    scale: reduce ? 1 : pushScale,
    opacity: reduce ? progress : fade,
    ...(reduceTransparency ? {} : { backdropFilter: blur, WebkitBackdropFilter: blur }),
    ...(phone ? {} : { width: width ?? DEFAULT_WIDTH }),
  };

  return (
    <div
      className={`ns-sheet-layer${isPresent ? '' : ' ns-sheet-leaving'}`}
      // Each depth sits above the last, including the parent's panel, so a
      // child's scrim darkens the parent behind it.
      style={{ zIndex: 50 + depth * 2 }}
    >
      <motion.div
        ref={scrimRef}
        className="ns-sheet-scrim"
        style={{ opacity: progress }}
        onClick={() => isTop && onClose()}
        aria-hidden
      />
      <motion.aside
        ref={panelRef}
        className={`ns-sheet ${phone ? 'ns-sheet-bottom' : 'ns-sheet-side'}`}
        role="dialog"
        aria-modal="true"
        {...labelAttrs}
        tabIndex={-1}
        inert={!isTop}
        style={style}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <header className="ns-sheet-head" data-sheet-handle>
          {phone && <span className="ns-sheet-grabber" aria-hidden />}
          <div className="ns-sheet-headline">
            {header ?? (
              <h2 id={titleId} className="ns-sheet-title">
                {title}
              </h2>
            )}
          </div>
          <button type="button" className="ns-sheet-close" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={2} aria-hidden />
          </button>
        </header>
        <div className="ns-sheet-body">{children}</div>
        {footer && <footer className="ns-sheet-foot">{footer}</footer>}
      </motion.aside>
    </div>
  );
}
