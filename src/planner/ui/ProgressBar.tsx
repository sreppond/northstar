import { money } from '../format';

/**
 * A thin value/max bar — down-payment readiness, a goal's funded progress,
 * "locked vs. modeled" (docs/REDESIGN-V3.md "Goodcast"). `tone` picks which
 * chrome-neutral-adjacent fill to use; `marker` draws a secondary tick (e.g.
 * the target, when `value` is progress toward it) at its own position along
 * the same track.
 *
 * `label` names what this bar measures ("House down payment", a goal's
 * name) and becomes its accessible name (docs/REDESIGN-V3.md review M18) —
 * without one a screen reader announces an anonymous progressbar. `value`
 * can run past `max` (a goal funded beyond its target); `aria-valuenow` is
 * clamped to `max` since ARIA requires it never exceed `aria-valuemax`, and
 * `aria-valuetext` carries the real, unclamped figures as money rather than
 * a bare percentage.
 */
export function ProgressBar({
  value,
  max,
  tone = 'accent',
  marker,
  label,
}: {
  value: number;
  max: number;
  tone?: 'accent' | 'in' | 'out' | 'neutral';
  marker?: number;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const markerPct = marker !== undefined && max > 0 ? Math.min(100, Math.max(0, (marker / max) * 100)) : undefined;

  return (
    <div
      className={`ns-ui-progress ns-ui-progress-${tone}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-valuetext={`${money(value)} of ${money(max)}`}
      aria-label={label}
    >
      <div className="ns-ui-progress-track">
        <div className="ns-ui-progress-fill" style={{ width: `${pct}%` }} />
        {markerPct !== undefined && <div className="ns-ui-progress-marker" style={{ left: `${markerPct}%` }} />}
      </div>
    </div>
  );
}
