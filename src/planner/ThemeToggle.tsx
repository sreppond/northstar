import { useEffect, useState } from 'react';

/**
 * Light / dark, stamped as `data-theme` on <html>.
 *
 * Three states, not two: until someone chooses, nothing is stamped and the
 * media query in planner.css follows the OS. Choosing stamps, which is what
 * lets an explicit choice beat the OS in both directions. Stored so the
 * choice survives a reload, next to the plans themselves.
 */

const KEY = 'northstar:theme';
type Choice = 'light' | 'dark';

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function stored(): Choice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    // Private mode, or storage disabled. The OS setting is a fine fallback.
    return null;
  }
}

export function ThemeToggle() {
  // Starts at whatever is actually on screen, so the icon never lies on the
  // first frame — the un-stamped default is the OS, not light.
  const [theme, setTheme] = useState<Choice>(() => stored() ?? (systemPrefersDark() ? 'dark' : 'light'));
  const [chosen, setChosen] = useState<boolean>(() => stored() !== null);

  useEffect(() => {
    if (chosen) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [theme, chosen]);

  // While the choice is still "system", track the OS live rather than holding
  // the value read at mount.
  useEffect(() => {
    if (chosen) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [chosen]);

  const next = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="ns-theme"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => {
        setTheme(next);
        setChosen(true);
        try {
          localStorage.setItem(KEY, next);
        } catch {
          // Not being able to remember the choice is not a reason to refuse it.
        }
      }}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M4.3 4.3l1.6 1.6M18.1 18.1l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.3 19.7l1.6-1.6M18.1 5.9l1.6-1.6" strokeLinecap="round" />
    </svg>
  );
}
