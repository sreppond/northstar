import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Detail } from './detail';

/**
 * The dark detail popover.
 *
 * Positioned `fixed` from the trigger's bounding box so it escapes the plan
 * card's `overflow: hidden` without a portal.
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
  children,
  side = 'bottom',
  disabled,
}: {
  detail: Detail;
  children: ReactNode;
  side?: HoverSide;
  disabled?: boolean;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);

  const open = () => {
    const r = anchor.current?.getBoundingClientRect();
    if (r) setRect({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width });
  };

  return (
    <span
      ref={anchor}
      className="ns-hovercard-anchor"
      onMouseEnter={open}
      onMouseLeave={() => setRect(null)}
      onFocus={open}
      onBlur={() => setRect(null)}
    >
      {children}
      {rect && !disabled && <Card detail={detail} rect={rect} side={side} />}
    </span>
  );
}

function Card({ detail, rect, side }: { detail: Detail; rect: Rect; side: HoverSide }) {
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
      className="ns-hovercard"
      role="tooltip"
      style={{
        left: centre,
        ...(below
          ? { top: rect.bottom + 10 }
          : { bottom: window.innerHeight - rect.top + 10 }),
      }}
    >
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
    </div>
  );
}
