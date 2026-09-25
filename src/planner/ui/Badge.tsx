import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'in' | 'out' | 'accent';

/** Small mono uppercase tag — status words ("SPREAD", "SYNCED"), not figures.
    For a signed money/percent figure use `DeltaTag` instead. */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`ns-ui-badge ns-ui-badge-${tone}`}>{children}</span>;
}
