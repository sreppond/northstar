import { useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Info, type LucideProps } from 'lucide-react';
import { takeRowOrigin, type RowOrigin } from './rowMorph';

/**
 * The account sheet's header: icon, name, and an (i) for what the account type
 * is (V5-REVIEW-1 F22 moved that paragraph behind it).
 *
 * V5-REVIEW-1 F25, the row to header hand-off. `layoutId` on the row's icon
 * and label and on this header was the first choice, and I judged it unfit from
 * how the sheet moves (reasoned from motion's projection model, not run side
 * by side with this one):
 *  - the sheet slides in on a CSS `translate` driven by its own motion value,
 *    not by a projected layout, so the header is measured while the panel is
 *    still parked off-screen and the morph's endpoint is stale for the whole
 *    flight;
 *  - the panel is also `opacity: 0 -> 1` over the first half of that slide, so
 *    a morphing child is invisible for exactly the stretch where the motion
 *    would read;
 *  - the row stays mounted under the scrim, so `layoutId` would fade the row's
 *    own icon and label as it hands over, and play the whole thing in reverse
 *    (header unmounting at the end of its exit, off-screen) on close.
 * So this is a FLIP by hand. `rowMorph` records where the row's icon and label
 * were at the click; here, on mount, the header measures where it will REST (its
 * current box minus the panel's live translate), then flies a copy of the icon
 * and label from the row to that spot over the same spring the sheet uses,
 * above the panel. The real header is hidden until the copy lands, then takes
 * over on the same frame, so the handover can't be seen.
 */

/** The sheet's own spring (`ui/Sheet.tsx` SPRING): the copy lands as the panel settles. */
const SPRING = { type: 'spring', bounce: 0, duration: 0.38 } as const;
/** If the animation never reports completion (a hidden tab), show the header anyway. */
const FALLBACK_MS = 900;

interface Flight {
  origin: RowOrigin;
  /** Where the header's icon and title rest, in viewport px. */
  icon: { left: number; top: number; width: number; height: number };
  label: { left: number; top: number; width: number; height: number };
  title: string;
  fontSize: number;
}

/** The panel's live `translate` (the sheet slides on it), so a measured box can be put back at rest. */
function panelTranslate(panel: Element | null): [number, number] {
  if (!panel) return [0, 0];
  const raw = getComputedStyle(panel).translate;
  if (!raw || raw === 'none') return [0, 0];
  const [x, y] = raw.split(' ').map((v) => parseFloat(v) || 0);
  return [x ?? 0, y ?? 0];
}

export function AccountSheetHead({
  Icon,
  title,
  titleId,
  accountClass,
  about,
  aboutOpen,
  onToggleAbout,
}: {
  Icon: ComponentType<LucideProps>;
  title: string;
  titleId: string;
  accountClass: string;
  /** The account type's blurb; the (i) only shows when there is one. */
  about?: string;
  aboutOpen: boolean;
  onToggleAbout(): void;
}) {
  const reduce = useReducedMotion() ?? false;
  const iconRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [flight, setFlight] = useState<Flight | null>(null);

  // Once, on mount (a sheet that opens from a row is a fresh mount of this
  // header). Layout effect, so the real header is hidden before it paints.
  useLayoutEffect(() => {
    if (reduce) return;
    const origin = takeRowOrigin(accountClass);
    const iconEl = iconRef.current;
    const titleEl = titleRef.current;
    if (!origin || !iconEl || !titleEl) return;
    const [tx, ty] = panelTranslate(iconEl.closest('.ns-sheet'));
    const rest = (r: DOMRect) => ({ left: r.left - tx, top: r.top - ty, width: r.width, height: r.height });
    setFlight({
      origin,
      icon: rest(iconEl.getBoundingClientRect()),
      label: rest(titleEl.getBoundingClientRect()),
      title,
      fontSize: parseFloat(getComputedStyle(titleEl).fontSize) || 17,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const land = () => setFlight(null);

  return (
    <div className="ns-nw-sheet-head" data-morphing={flight ? 'true' : undefined}>
      <span ref={iconRef} className="ns-nw-sheet-icon">
        <Icon size={18} strokeWidth={2} aria-hidden />
      </span>
      <h2 ref={titleRef} id={titleId} className="ns-nw-sheet-title">
        {title}
      </h2>
      {about && (
        <button
          type="button"
          className="ns-nw-about"
          aria-expanded={aboutOpen}
          aria-label={`About ${title}`}
          onClick={onToggleAbout}
        >
          <Info size={15} strokeWidth={2} aria-hidden />
        </button>
      )}
      {flight && <Flyer flight={flight} Icon={Icon} onLand={land} />}
    </div>
  );
}

function Flyer({
  flight,
  Icon,
  onLand,
}: {
  flight: Flight;
  Icon: ComponentType<LucideProps>;
  onLand(): void;
}) {
  const { origin, icon, label, title, fontSize } = flight;

  useLayoutEffect(() => {
    const id = window.setTimeout(onLand, FALLBACK_MS);
    return () => window.clearTimeout(id);
  }, [onLand]);

  const root = document.querySelector('.ns') ?? document.body;
  const sameText = origin.text.trim() === title.trim();
  return createPortal(
    <div className="ns-morph-layer" aria-hidden="true">
      <motion.span
        className="ns-morph-icon"
        style={{ left: icon.left, top: icon.top, width: icon.width, height: icon.height }}
        initial={{ x: origin.icon.left - icon.left, y: origin.icon.top - icon.top, scale: origin.icon.width / icon.width }}
        animate={{ x: 0, y: 0, scale: 1 }}
        transition={SPRING}
        onAnimationComplete={onLand}
      >
        <Icon size={icon.width} strokeWidth={2} aria-hidden />
      </motion.span>
      <motion.span
        className="ns-morph-label"
        style={{ left: label.left, top: label.top, width: label.width, fontSize }}
        initial={{ x: origin.label.left - label.left, y: origin.label.top - label.top, scale: origin.fontSize / fontSize }}
        animate={{ x: 0, y: 0, scale: 1 }}
        transition={SPRING}
      >
        {/* The row says "Taxable investments", the header an account name: cross-fade the two while it flies. */}
        {!sameText && (
          <motion.span
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            {origin.text}
          </motion.span>
        )}
        <motion.span
          initial={{ opacity: sameText ? 1 : 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.16, delay: sameText ? 0 : 0.12, ease: 'easeOut' }}
        >
          {title}
        </motion.span>
      </motion.span>
    </div>,
    root,
  );
}
