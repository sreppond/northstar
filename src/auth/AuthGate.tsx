import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type AuthStatus } from '../api/client';
import { startServerSync } from '../planner/store/serverSync';

/**
 * The gate in front of the planner.
 *
 * Three states, decided by the server rather than guessed at: no password set
 * yet (first run), password set but not signed in, and signed in. Asking the
 * server on mount is what makes a shared link or a bookmarked deep URL land on
 * the right screen instead of flashing the planner and then bouncing.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.authStatus());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Plans sync only once authenticated, and only once per sign-in.
   *
   * Kicking this off at module load instead looks fine on a cold start — the
   * request 401s, is swallowed, and the app falls back to localStorage — but
   * signing in afterwards does not remount the module, so the retry never
   * happens and that whole session silently never reaches the server.
   */
  useEffect(() => {
    if (!status?.authenticated || synced) return;
    setSynced(true);
    void startServerSync();
  }, [status?.authenticated, synced]);

  if (error) {
    return (
      <Shell title="Northstar">
        <p className="ns-auth-error">{error}</p>
        <button type="button" className="ns-btn" onClick={() => void refresh()}>
          Try again
        </button>
      </Shell>
    );
  }

  // Nothing at all until the server answers. A flash of the login form for a
  // user who is already signed in reads as having been logged out.
  if (!status) return null;

  if (!status.authenticated) {
    return <PasswordScreen mode={status.configured ? 'login' : 'setup'} onDone={refresh} />;
  }

  return <>{children}</>;
}

function PasswordScreen({ mode, onDone }: { mode: 'login' | 'setup'; onDone(): Promise<void> }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSetup = mode === 'setup';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (isSetup && password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      if (isSetup) await api.setup(password);
      else await api.login(password);
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong.');
      setPassword('');
      setConfirm('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title={isSetup ? 'Set a password' : 'Northstar'}>
      <p className="ns-auth-blurb">
        {isSetup
          ? 'This server has no password yet. Choose one — it is the only thing between anyone on this network and your balances.'
          : 'Sign in to open your forecast.'}
      </p>

      <form className="ns-auth-form" onSubmit={submit}>
        <label className="ns-field">
          <span className="ns-field-label">Password</span>
          <input
            className="ns-input"
            type="password"
            autoFocus
            autoComplete={isSetup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {isSetup && (
            <span className="ns-field-hint">
              At least 12 characters. Length beats punctuation — a passphrase is ideal.
            </span>
          )}
        </label>

        {isSetup && (
          <label className="ns-field">
            <span className="ns-field-label">Confirm password</span>
            <input
              className="ns-input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        )}

        {error && <p className="ns-auth-error">{error}</p>}

        <button
          type="submit"
          className="ns-btn ns-btn-primary ns-auth-submit"
          disabled={busy || password.length === 0}
        >
          {busy ? 'Working…' : isSetup ? 'Set password' : 'Sign in'}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ns ns-auth-page">
      <div className="ns-auth-card">
        <div className="ns-auth-title">{title}</div>
        {children}
      </div>
    </div>
  );
}
