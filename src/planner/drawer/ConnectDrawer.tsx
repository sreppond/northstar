import { useEffect, useState } from 'react';
import { ApiError, api, type MonarchStatus } from '../../api/client';

/**
 * Connecting Northstar to Monarch.
 *
 * The instructions are the feature. Monarch has no personal API key to issue,
 * and its login is gated behind Cloudflare for anything that is not a browser,
 * so the only durable way in is the session your own browser already holds.
 * That is a strange thing to ask someone to fetch, which is why this is a
 * numbered walkthrough rather than a lone input box.
 *
 * The cookie is posted once and never comes back: the server verifies it
 * against Monarch, seals it, and from then on the page only ever sees status.
 */
interface Props {
  status: MonarchStatus | null;
  onConnected(): Promise<void> | void;
  onCancel(): void;
}

export function ConnectDrawer({ status, onConnected, onCancel }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  const reconnecting = Boolean(status?.connected);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await api.connectMonarch(value.trim());
      setValue('');
      await onConnected();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not connect.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api.disconnectMonarch();
      await onConnected();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="ns-scrim" onClick={() => !busy && onCancel()} />
      <aside className="ns-drawer" role="dialog" aria-modal="true" aria-label="Connect to Monarch">
        <header className="ns-drawer-head">
          <div className="ns-drawer-title">
            {reconnecting ? 'Reconnect to Monarch' : 'Connect to Monarch'}
          </div>
          <button type="button" className="ns-btn-ghost" onClick={onCancel} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="ns-drawer-body">
          {status?.needsReconnect && (
            <p className="ns-connect-warn">
              Monarch rejected the saved session. Browser sessions expire — paste a fresh one and
              refreshing will start working again.
            </p>
          )}

          <div className="ns-section">
            <div className="ns-section-title">Why a cookie, and not a password</div>
            <p className="ns-drawer-hint">
              Monarch has no personal API key, and it blocks non-browser logins behind a CAPTCHA. The
              session your browser is already holding is the way in. Northstar encrypts it before
              storing it and never sends it back to this page.
            </p>
          </div>

          <div className="ns-section">
            <div className="ns-section-title">Getting it</div>
            <ol className="ns-steps">
              <li>
                Sign in to <code>app.monarch.com</code> in Chrome or Firefox.
              </li>
              <li>
                Open DevTools with <kbd>F12</kbd> and pick the <b>Network</b> tab.
              </li>
              <li>Reload the page, then click any request named <code>graphql</code>.</li>
              <li>
                Scroll to <b>Request Headers</b> and find the line starting <code>cookie:</code>.
              </li>
              <li>Copy its entire value — it is long — and paste it below.</li>
            </ol>
          </div>

          <div className="ns-section">
            <div className="ns-section-title">Paste</div>
            <textarea
              className="ns-input ns-import-paste"
              rows={5}
              spellCheck={false}
              autoFocus
              value={value}
              placeholder="session_id=…; csrftoken=…"
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="ns-field-hint">
              It must contain both <code>session_id</code> and <code>csrftoken</code>. Northstar
              checks it against Monarch before saving, so a bad paste fails here rather than a week
              from now.
            </p>
            {error && <p className="ns-auth-error">{error}</p>}
          </div>

          {status?.connected && (
            <div className="ns-section">
              <div className="ns-section-title">Currently connected</div>
              <p className="ns-drawer-hint">
                Connected{' '}
                {status.connectedAt ? new Date(status.connectedAt).toLocaleDateString() : 'earlier'}.
                Disconnecting deletes the stored session; your captured balances stay.
              </p>
              <button type="button" className="ns-btn" disabled={busy} onClick={() => void disconnect()}>
                Disconnect
              </button>
            </div>
          )}
        </div>

        <footer className="ns-drawer-foot">
          <div className="ns-drawer-foot-right">
            <button type="button" className="ns-btn" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="ns-btn ns-btn-primary"
              disabled={busy || value.trim().length === 0}
              onClick={() => void connect()}
            >
              {busy ? 'Checking with Monarch…' : 'Connect'}
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}
