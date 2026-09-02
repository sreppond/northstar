import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NAV_ITEMS } from './Sidebar';
import { usePlanner } from './PlannerContext';

/**
 * The ⌘K command palette (docs/REDESIGN.md §3.2, §4.5;
 * docs/DESIGN-DIRECTION.md "Dark mode and ⌘K"). Absorbs bits of chrome that
 * otherwise each need their own real estate: page navigation (now real
 * routes, pushed via `useNavigate` — `NAV_ITEMS` is the same list
 * `Sidebar.tsx` renders, so the two can never drift), the Compare-plan
 * picker, the year-window pager, and the scenario switcher (which it reopens
 * as the existing `PlanSwitcher` overlay rather than reimplementing a plan
 * list inline).
 *
 * Deliberately has NO open/close animation — the one motion-table row marked
 * "None, deliberately" in DESIGN-DIRECTION.md, because it is
 * keyboard-initiated and used constantly, so instant is what feels right, not
 * a missed opportunity for delight. Escape and an outside click both close
 * it, the same disclosure idiom `HeaderMenu.tsx`/`PlanSwitcher.tsx` already use.
 */

interface Command {
  id: string;
  label: string;
  hint?: string;
  run(): void;
}

export function CommandPalette({ onClose }: { onClose(): void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    plans,
    stored,
    plan,
    updateSettings,
    windowLabel,
    clampedStart,
    maxStart,
    pageEarlier,
    pageLater,
    setSidebarOpen,
  } = usePlanner();

  const compareToPlanId = plan.settings.compareToPlanId;
  const canPageEarlier = clampedStart > 0;
  const canPageLater = clampedStart < maxStart;

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const out: Command[] = NAV_ITEMS.map((item) => ({
      id: `page-${item.to}`,
      label: `Go to ${item.label}`,
      hint: location.pathname === item.to ? 'Current' : undefined,
      run: () => navigate(item.to),
    }));

    out.push({
      id: 'compare-none',
      label: 'Compare: None',
      hint: compareToPlanId === undefined ? 'Current' : undefined,
      run: () => updateSettings(stored.id, { compareToPlanId: undefined }),
    });
    for (const p of plans) {
      if (p.id === stored.id) continue;
      out.push({
        id: `compare-${p.id}`,
        label: `Compare with ${p.name}`,
        hint: compareToPlanId === p.id ? 'Current' : undefined,
        run: () => updateSettings(stored.id, { compareToPlanId: p.id }),
      });
    }

    if (canPageEarlier) out.push({ id: 'page-earlier', label: `Earlier years (before ${windowLabel})`, run: pageEarlier });
    if (canPageLater) out.push({ id: 'page-later', label: `Later years (after ${windowLabel})`, run: pageLater });

    out.push({ id: 'switch-plan', label: 'Switch or manage plans…', run: () => setSidebarOpen(true) });

    return out;
  }, [
    location.pathname,
    navigate,
    plans,
    stored.id,
    compareToPlanId,
    updateSettings,
    windowLabel,
    canPageEarlier,
    canPageLater,
    pageEarlier,
    pageLater,
    setSidebarOpen,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => setActiveIndex(0), [query]);
  useEffect(() => inputRef.current?.focus(), []);

  // Same idiom as HeaderMenu.tsx / PlanSwitcher.tsx: Escape and a mousedown
  // outside the panel both close it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [onClose]);

  const execute = (cmd: Command) => {
    cmd.run();
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) execute(cmd);
    }
  };

  return (
    <div className="ns-palette-scrim">
      <div
        className="ns-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        ref={root}
      >
        <input
          ref={inputRef}
          className="ns-palette-input"
          placeholder="Jump to a page, compare a plan, page years…"
          aria-label="Command palette search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="ns-palette-list" role="listbox">
          {filtered.length === 0 && <div className="ns-palette-empty">No matching commands.</div>}
          {filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              className={`ns-palette-item${i === activeIndex ? ' ns-palette-item-active' : ''}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => execute(cmd)}
            >
              <span>{cmd.label}</span>
              {cmd.hint && <span className="ns-palette-hint">{cmd.hint}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
