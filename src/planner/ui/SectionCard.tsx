import type { ReactNode } from 'react';

/**
 * A card with a header row (title, optional eyebrow-style meta, optional
 * actions) and a body. The primary chart/table on a page as well as every
 * secondary card reach for this rather than hand-rolling `.ns-card` +
 * a title row per page.
 *
 * `flush` drops the body's own padding for content that wants to run
 * full-bleed to the card's edges (a table, a chart) — the header keeps its
 * padding either way.
 *
 * `divider` controls the hairline under the header (docs/REDESIGN-V3.md
 * review S6): every `SectionCard` used to draw one unconditionally, which
 * reads heavier than the references want for a chart card whose title sits
 * right above the plot. Defaults to `true` — the current look — so this is
 * opt-out, not opt-in; a chart card passes `divider={false}`.
 */
export function SectionCard({
  title,
  meta,
  actions,
  flush,
  divider = true,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  flush?: boolean;
  divider?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="ns-card ns-ui-section">
      <header className={`ns-ui-section-head${divider ? '' : ' ns-ui-section-head-flat'}`}>
        <div className="ns-ui-section-head-main">
          <h2 className="ns-ui-section-title">{title}</h2>
          {meta && <span className="ns-ui-section-meta">{meta}</span>}
        </div>
        {actions && <div className="ns-ui-section-actions">{actions}</div>}
      </header>
      <div className={`ns-ui-section-body${flush ? ' ns-ui-section-body-flush' : ''}`}>{children}</div>
    </section>
  );
}
