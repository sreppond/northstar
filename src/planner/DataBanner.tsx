import type { MonarchStatus } from '../api/client';

/**
 * The freshness line.
 *
 * This is the whole point of having a server: the app can say how old your
 * balances are without you having to remember. It appears only when there is
 * something to act on — connected and current, it says nothing at all, because
 * a banner that is always there stops being read.
 */
interface Props {
  status: MonarchStatus | null;
  busy: boolean;
  onConnect(): void;
  onRefresh(): void;
}

export function DataBanner({ status, busy, onConnect, onRefresh }: Props) {
  if (!status) return null;

  if (!status.connected) {
    return (
      <Banner
        tone="prompt"
        message="Northstar is not connected to Monarch yet, so these balances are whatever you typed in."
        action="Connect"
        busy={busy}
        onAction={onConnect}
      />
    );
  }

  if (status.needsReconnect) {
    return (
      <Banner
        tone="alarm"
        message="Monarch signed the saved session out. Reconnect to start refreshing again."
        action="Reconnect"
        busy={busy}
        onAction={onConnect}
      />
    );
  }

  if (!status.lastCapturedAt) {
    return (
      <Banner
        tone="prompt"
        message="Connected to Monarch, but nothing has been pulled in yet."
        action="Pull balances"
        busy={busy}
        onAction={onRefresh}
      />
    );
  }

  if (status.stale) {
    return (
      <Banner
        tone="alarm"
        message={`Your balances are ${describeAge(status.ageDays)} old.`}
        action="Refresh from Monarch"
        busy={busy}
        onAction={onRefresh}
      />
    );
  }

  // Current. Offer the refresh without nagging about it.
  return (
    <Banner
      tone="quiet"
      message={`Balances from Monarch, ${describeAge(status.ageDays)} old.`}
      action="Refresh"
      busy={busy}
      onAction={onRefresh}
    />
  );
}

function Banner({
  tone,
  message,
  action,
  busy,
  onAction,
}: {
  tone: 'quiet' | 'prompt' | 'alarm';
  message: string;
  action: string;
  busy: boolean;
  onAction(): void;
}) {
  return (
    <div className={`ns-data-banner ns-data-${tone}`}>
      <span className="ns-data-message">{message}</span>
      <button type="button" className="ns-btn-ghost ns-data-action" disabled={busy} onClick={onAction}>
        {busy ? 'Working…' : action}
      </button>
    </div>
  );
}

/**
 * Plain language rather than a date. "12 days" is a judgement you can act on;
 * "captured 2026-08-11" makes you do the arithmetic yourself.
 */
function describeAge(days: number | null): string {
  if (days === null) return 'unknown';
  if (days === 0) return 'less than a day';
  if (days === 1) return 'a day';
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}
