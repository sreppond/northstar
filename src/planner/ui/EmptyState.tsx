import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * A centered, generous-but-not-huge empty state — Annuity with no account
 * yet, Progress before its first logged point, Compare with nothing to
 * compare against (docs/REDESIGN-V3.md page targets). `action` is left as a
 * plain `ReactNode` rather than a single button prop so a page can render
 * more than one (e.g. a primary "Add" plus a secondary "Learn more").
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ns-ui-empty">
      <div className="ns-ui-empty-icon">
        <Icon size={22} strokeWidth={1.6} aria-hidden />
      </div>
      <div className="ns-ui-empty-title">{title}</div>
      {body && <p className="ns-ui-empty-body">{body}</p>}
      {action && <div className="ns-ui-empty-action">{action}</div>}
    </div>
  );
}
