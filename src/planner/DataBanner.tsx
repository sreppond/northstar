import type { MonarchStatus } from '../api/client';
import { monarchHeaderStatus } from './dashboard';

/**
 * The Monarch sync affordance, folded into the page header rather than a
 * standalone banner (docs/REDESIGN-V3.md #1: "The DataBanner connect/refresh
 * affordance should fold into the status chip or header rather than being a
 * separate banner — keep its behaviour: connect / refresh"). This used to be
 * a full-width message row that appeared or vanished depending on staleness;
 * it is now always exactly two things, both driven by `monarchHeaderStatus`
 * (`dashboard.ts`, where the plain-language derivation lives so it's covered
 * by `dashboard.test.ts`):
 *
 *  - `MonarchStatusText` — the words inside `PageHeader`'s status chip.
 *  - `MonarchHeaderAction` — the one action worth a button next to it, when
 *    there is one (absent once connected and current, same as before).
 */

export function MonarchStatusText({ status }: { status: MonarchStatus | null }) {
  return <>{monarchHeaderStatus(status).text}</>;
}

export function MonarchHeaderAction({
  status,
  busy,
  onConnect,
  onRefresh,
}: {
  status: MonarchStatus | null;
  busy: boolean;
  onConnect(): void;
  onRefresh(): void;
}) {
  const { action } = monarchHeaderStatus(status);
  if (!action) return null;
  return (
    <button
      type="button"
      className="ns-btn-ghost"
      disabled={busy}
      onClick={action.kind === 'connect' ? onConnect : onRefresh}
    >
      {busy ? 'Working…' : action.label}
    </button>
  );
}
