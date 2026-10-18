import type { ReactNode } from 'react';
import { AnimatedFigure } from '../AnimatedFigure';
import { useThrottledValue } from './useSpring';
import './charts.css';

/**
 * The header above a hero chart (docs/REDESIGN-V5.md §3.3): a label, the big
 * number for the active year, and "YEAR · ages". It replaces the stat strip
 * and the tooltip — the chart's readout IS the tooltip (§1 principle 2).
 *
 * Presentational on purpose: TimeSeriesChart feeds it hover -> pin -> default
 * year, but a page that owns its own readout (`readout: false`) can render
 * this directly from `onHoverYear` + the app-wide focus year.
 */

export interface ReadoutItem {
  id: string;
  label: string;
  color: string;
  value: string;
  dashed?: boolean;
}

export interface ChartReadoutProps {
  label: ReactNode;
  /** Plain-text label for the screen-reader announcement (when `label` is a menu). */
  labelText?: string;
  /** The primary value, already formatted. */
  value: string;
  /** "2036" or whatever the x-axis calls this point. */
  yearLabel: string;
  /** "Spencer 40 · Sarah 40". */
  ages?: string;
  /** The other series as small `●label value` items. */
  secondary?: ReadoutItem[];
  /** The active year is short (§4.2). Never colour alone: glyph + word. */
  short?: boolean;
  /** "$88.7K", shown after "Short" when the shortfall is known. */
  shortAmount?: string;
  /** Unit suffix after the Short amount: `/yr` (default) or `/mo`
      (V5-REVIEW-1 F10). A page shows ONE unit; the pill must say which, since
      a hero "Short $67K" next to a donut's "Short $5.6K a month" read as two
      different shortfalls. */
  shortUnit?: string;
  size?: 'hero' | 'compact';
  /** Right-hand slot: RangePicker, What-if. */
  actions?: ReactNode;
}

export function ChartReadout({
  label,
  labelText,
  value,
  yearLabel,
  ages,
  secondary = [],
  short = false,
  shortAmount,
  shortUnit = '/yr',
  size = 'hero',
  actions,
}: ChartReadoutProps) {
  // Announce through a throttled copy: a scrub across 65 years should read
  // out a handful of values, not 65 (§3.3).
  const announcement = [
    `${yearLabel}${ages ? `, ${ages}` : ''}`,
    `${labelText ?? (typeof label === 'string' ? label : 'Value')} ${value}`,
    short ? `Short ${shortAmount ? `${shortAmount} ${shortUnit === '/mo' ? 'a month' : 'a year'}` : ''}`.trim() : '',
  ]
    .filter(Boolean)
    .join('. ');
  const spoken = useThrottledValue(announcement, 700);

  const pill = short ? (
    <span className="ns-readout-short">
      <span aria-hidden="true">✗</span> Short{shortAmount ? ` ${shortAmount}${shortUnit}` : ''}
    </span>
  ) : null;

  return (
    <div className={`ns-readout ns-readout-${size}`}>
      <div className="ns-readout-main">
        <div className="ns-readout-label">{label}</div>
        <div className="ns-readout-valuerow">
          <AnimatedFigure className="ns-readout-value" value={value} />
          {size === 'hero' && pill}
        </div>
        <div className="ns-readout-sub">
          <span className="ns-readout-year">{yearLabel}</span>
          {ages && <span className="ns-readout-ages"> · {ages}</span>}
          {size === 'compact' && pill}
        </div>
        {secondary.length > 0 && (
          <ul className="ns-readout-secondary">
            {secondary.map((s) => (
              <li key={s.id}>
                <span
                  className={`ns-readout-swatch${s.dashed ? ' ns-readout-swatch-dashed' : ''}`}
                  style={{ ['--swatch' as string]: s.color }}
                  aria-hidden="true"
                />
                <span className="ns-readout-seclabel">{s.label}</span>
                <span className="ns-readout-secvalue">{s.value}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {actions && <div className="ns-readout-actions">{actions}</div>}
      <span className="ns-ch-sr" aria-live="polite" aria-atomic="true">
        {spoken}
      </span>
    </div>
  );
}
