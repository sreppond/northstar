import type { ReactNode } from 'react';

/**
 * Every page's header (docs/REDESIGN-V3.md "Target information
 * architecture"): a title, an optional mono meta line ("House Forecast · as
 * of Sep 2, 2026 · 2026–2046"), an optional right-aligned status chip
 * (Goodcast's "● Claude · nightly forecast" idea — a plan's Monarch sync
 * state, a run's completion), and optional actions (a primary button, a
 * segmented control).
 */
export function PageHeader({
  title,
  meta,
  status,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ns-page-header">
      <div className="ns-page-header-main">
        <h1 className="ns-page-title">{title}</h1>
        {meta && <p className="ns-page-meta ns-num">{meta}</p>}
      </div>
      {(status || actions) && (
        <div className="ns-page-header-side">
          {status && <div className="ns-page-status">{status}</div>}
          {actions && <div className="ns-page-actions">{actions}</div>}
        </div>
      )}
    </header>
  );
}
