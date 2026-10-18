import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Detail } from './detail';

/**
 * The dark detail popover.
 *
 * Positioned `fixed` from the trigger's bounding box, and portalled to
 * `document.body`. `fixed` alone escapes the plan card's `overflow: hidden`,
 * but not a stacking context: the balance sheet pins its label column with
 * `position: sticky; z-index: 1`, and that traps the card's own z-index inside
 * the row. Rows further down the table then painted straight over it. The
 * portal lifts the card out of every ancestor context.
 *
 * The anchor rect is captured on mouse-enter rather than measured in a layout
 * effect. Measuring after paint meant re-running whenever the (freshly built)
 * `detail` object changed identity, which is every parent render — and the
 * card drifted away from its trigger. Capturing once on open is both simpler
 * and stable.
 */

export type HoverSide = 'top' | 'bottom';

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
}

export function HoverCard({
  detail,
  content,
  children,
  side = 'bottom',
  disabled,
  id,
}: {
  /** The structured title/sections shape an event, account or plan card
      renders. Omit this and pass `content` instead for freeform copy — a caller passing neither renders an empty card,
      which no current caller does. */
  detail?: Detail;
  /** Freeform popover content, taking priority over `detail` when both are
      given (no caller currently passes both). For an explainer that is one or
      two plain sentences rather than a field list. */
  content?: ReactNode;
  children: ReactNode;
  side?: HoverSide;
  disabled?: boolean;
  /** Sets the popover's own DOM `id` so a trigger element can point
      `aria-describedby` at it. Every
      existing caller omits this and gets no id, unchanged. */
  id?: string;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);

  const open = () => {
    const r = anchor.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width });
  };
  const close = () => setRect(null);

  // Esc closes an open card regardless of how it got focus/hover — keyboard-focus popovers
  // need it (docs/ROADMAP-10.md C3), and dismissing an event/account card
  // early with Esc was never a loss.
  useEffect(() => {
    if (!rect) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rect]);

  return (
    <span
      ref={anchor}
      className="ns-hovercard-anchor"
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
    >
      {children}
      {rect &&
        !disabled &&
        createPortal(<Card detail={detail} content={content} rect={rect} side={side} id={id} />, document.body)}
    </span>
  );
}

function Card({
  detail,
  content,
  rect,
  side,
  id,
}: {
  detail?: Detail;
  content?: ReactNode;
  rect: Rect;
  side: HoverSide;
  id?: string;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);

  // Only the vertical flip needs the card's own height; horizontal centring is
  // pure CSS via translateX(-50%), so there is nothing to measure for it.
  useLayoutEffect(() => {
    const height = card.current?.offsetHeight ?? 0;
    if (side === 'bottom') setFlip(rect.bottom + 10 + height > window.innerHeight - 8);
    else setFlip(rect.top - 10 - height < 8);
  }, [rect, side]);

  const below = side === 'bottom' ? !flip : flip;
  const centre = rect.left + rect.width / 2;

  return (
    <div
      ref={card}
      id={id}
      className="ns-hovercard"
      role="tooltip"
      style={{
        left: centre,
        ...(below
          ? { top: rect.bottom + 10 }
          : { bottom: window.innerHeight - rect.top + 10 }),
      }}
    >
      {content ?? (detail && (
        <>
          <div className="ns-hovercard-title">{detail.title}</div>
          {detail.sections.map((section, i) => (
            <div key={i} className="ns-hovercard-section">
              {section.heading && <div className="ns-hovercard-heading">{section.heading}</div>}
              {section.rows.map((row) => (
                <div key={row.label} className="ns-hovercard-row">
                  <span className="ns-hovercard-label">{row.label}</span>
                  <span className="ns-hovercard-value ns-num">{row.value}</span>
                </div>
              ))}
            </div>
          ))}
        </>
      ))}
    </div>
  );
}
