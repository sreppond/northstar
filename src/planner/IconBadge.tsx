import type { EventKind } from '@northstar/engine';
import { labelFor, toneFor, type EventTone } from './presentation';
import { EVENT_ICON } from './domainIcons';

/**
 * The icon-badge vocabulary (docs/BORROW.md-style port of Northstar v2's
 * `IconBadge.tsx`): the same tone-coloured badge shape the 3-letter codes
 * (`ns-code`) already used, now carrying a glyph instead of text. The label
 * moves to `title` rather than disappearing — this is still a hover-first
 * app (`docs/NEXT.md`'s "hover shows the assumptions" rule).
 */
export function IconBadge({ kind, tone }: { kind: EventKind; tone?: EventTone }) {
  const Icon = EVENT_ICON[kind];
  const resolvedTone = tone ?? toneFor(kind);
  return (
    <span className={`ns-code ns-code-${resolvedTone} ns-icon-badge`} title={labelFor(kind)}>
      <Icon size={12} strokeWidth={2.25} aria-hidden />
    </span>
  );
}
