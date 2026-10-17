import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { axisMoney, money } from '../format';
import { ChartReadout, type ReadoutItem } from './ChartReadout';
import { rangeWindow, type RangeKey } from './range';
import {
  areaPath,
  linePath,
  pickXTicks,
  stackSeries,
  tightCeilingMoney,
  yTicks,
} from './seriesMath';
import type { ChartBand, ChartMarker, ChartSeries, DangerBand, ReadoutSpec } from './types';
import { useScrub } from './useScrub';
import { usePrefersReducedMotion, useReveal, useSpringValues } from './useSpring';
import './charts.css';

/**
 * The one time-series chart (docs/REDESIGN-V5.md §3.2): lines, areas, stacked
 * areas and columns on a measured-px SVG, with the scrub, pin, readout,
 * danger band, draw-in and range springs the plan asks of every chart.
 * MiniChart is a thin wrapper over this, which is how every existing chart in
 * the app gains scrub without a page being touched.
 *
 * Coordinates: the viewBox is the measured pixel width (as MiniChart's was),
 * so text renders 1:1 at every width. The x- and y-domain are the ANIMATED
 * values from `useSpringValues`; every path and tick is positioned from
 * those, which is what lets a range change slide instead of jump.
 */

const LEFT = 56;
const RIGHT_MARGIN = 8;
/** Right plot edge when `endLabels` is on — leaves room for the label column
    (docs/REDESIGN-V3.md "direct end labels instead of a legend"). */
const RIGHT_LABELED_MARGIN = 130;
/** Headroom above the plot for the pin's year chip. */
const TOP = 26;
const BOTTOM_MARGIN = 40;
const END_LABEL_GAP = 20;
/** A band's label sits under the x-axis ticks, where the data can't cover it. */
const BAND_LABEL_DY = 36;
const MIN_Y_TICK_GAP_PX = 40;
/** Few enough points that each deserves a dot (§3.2: "≤ 6 points"). */
const DOT_THRESHOLD = 6;
/** First render only, before the container reports its real width. */
const FALLBACK_WIDTH = 640;
/** The glow copy is a blurred second path; past this many lines it is noise. */
const MAX_GLOWING_LINES = 4;

export interface TimeSeriesChartProps {
  years: number[];
  series: ChartSeries[];
  /** Stack every series bottom to top (areas, or columns). */
  stacked?: boolean;
  /** Which window to show; omitted = all years (§3.4). */
  range?: RangeKey;
  /** "Today" in `years` — range windows count from here and its x-tick reads
      "Today". Defaults to the first year (without the label). */
  todayYear?: number;
  height?: number;
  /** The pinned year. Controlled when `onFocusYear` is passed (§4.1). */
  focusYear?: number | null;
  onFocusYear?(year: number | null): void;
  onHoverYear?(year: number | null): void;
  /** Header above the chart; `false` when the page renders its own. */
  readout?: ReadoutSpec | false;
  danger?: DangerBand;
  /** Called with `'all'` by the "Runs dry YEAR →" chip when the band is off-window. */
  onRequestRange?(range: RangeKey): void;
  markers?: ChartMarker[];
  /** Labelled background stretches of the x-axis (a child's life stages). */
  bands?: ChartBand[];
  /** A draft preview: a dashed ink line, never a new hue. */
  ghost?: ChartSeries;
  yFormat?(value: number): string;
  /** Tick text for the x-axis; default the bare year. */
  formatX?(year: number): string;
  /** Replays the draw-in when this changes (a different account, say), in
      addition to the series ids changing. */
  drawKey?: string;
  drawIn?: boolean;
  ariaLabel: string;

  // --- carried over from MiniChart so the wrapper loses nothing ----------
  /** A small dot + name at each line's end instead of a legend. */
  endLabels?: boolean;
  /** A lighter band from this x to the right edge (Retirement's "beyond horizon"). */
  bandFrom?: number;
  bandLabel?: string;
  /** A second line under the x-tick at the plan's stub first year. */
  stubYear?: { year: number; label: string };
  /** A dashed vertical rule at an x value (the year a page is looking at). */
  markYear?: number;
}

interface Resolved {
  id: string;
  s: ChartSeries;
  kind: 'line' | 'area' | 'column';
  /** What is drawn: the stacked top when stacking, else the raw values. */
  tops: number[];
  /** The area/column lower edge, if not zero. */
  bases?: number[];
  flatOpacity?: number;
  lineWidth: number;
}

function resolveSeries(series: ChartSeries[], stacked: boolean): Resolved[] {
  // An `overlay` series sits outside the stack (Budget's after-tax line over
  // its spending columns), so only the rest are stacked.
  const stackIdx = stacked ? series.flatMap((s, i) => (s.overlay ? [] : [i])) : [];
  const stack = stacked ? stackSeries(stackIdx.map((i) => series[i].values)) : null;
  return series.map((s, i) => {
    const slot = stack ? stackIdx.indexOf(i) : -1;
    const inStack = slot >= 0;
    let kind = s.kind ?? (s.fill ? 'area' : 'line');
    if (inStack && kind === 'line') kind = 'area';
    return {
      id: s.id ?? s.label,
      s,
      kind,
      tops: stack && inStack ? stack.tops[slot] : s.values,
      bases: stack && inStack ? stack.bases[slot] : s.fillTo,
      // A stacked chart's bands ARE the data: solid, not a wash.
      flatOpacity: s.fillOpacity ?? (inStack && kind === 'area' ? 0.85 : undefined),
      lineWidth: s.lineWidth ?? (inStack ? 1.5 : 2),
    };
  });
}

/** Smallest positive gap between consecutive years: the width of one slot. */
function minStep(years: number[]): number {
  let step = Infinity;
  for (let i = 1; i < years.length; i++) {
    const d = years[i] - years[i - 1];
    if (d > 1e-9 && d < step) step = d;
  }
  return Number.isFinite(step) ? step : 1;
}

export function TimeSeriesChart({
  years,
  series,
  stacked = false,
  range = 'all',
  todayYear,
  height = 280,
  focusYear,
  onFocusYear,
  onHoverYear,
  readout,
  danger,
  onRequestRange,
  markers,
  bands,
  ghost,
  yFormat = axisMoney,
  formatX = String,
  drawKey,
  drawIn = true,
  ariaLabel,
  endLabels = false,
  bandFrom,
  bandLabel,
  stubYear,
  markYear,
}: TimeSeriesChartProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduced = usePrefersReducedMotion();

  // --- measured width ------------------------------------------------------
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    if (el.clientWidth > 0) setWidth(el.clientWidth);
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const resolved = useMemo(() => resolveSeries(series, stacked), [series, stacked]);
  const opening = todayYear ?? years[0] ?? 0;

  // --- window and target domains ------------------------------------------
  const win = useMemo(() => rangeWindow(years, opening, range), [years, opening, range]);
  const visIdx = useMemo(
    () => years.map((y, i) => i).filter((i) => years[i] >= win.from - 1e-9 && years[i] <= win.to + 1e-9),
    [years, win],
  );
  const visYears = useMemo(() => visIdx.map((i) => years[i]), [visIdx, years]);

  const hasColumns = resolved.some((r) => r.kind === 'column');
  const step = useMemo(() => minStep(years), [years]);
  // Columns are centred on their year, so the domain needs half a slot of
  // air at each end or the first and last bar hang over the axis.
  const colPad = hasColumns ? step / 2 : 0;
  const targetX0 = win.from - colPad;
  const targetX1 = win.to + colPad;

  const [targetY0, targetY1] = useMemo(() => {
    let min = 0;
    let max = 0;
    const take = (v: number | undefined) => {
      if (v === undefined || !Number.isFinite(v)) return;
      if (v < min) min = v;
      if (v > max) max = v;
    };
    for (const i of visIdx) {
      for (const r of resolved) {
        take(r.tops[i]);
        take(r.bases?.[i]);
      }
      take(ghost?.values[i]);
    }
    return [min, max > min ? max : min + 1] as const;
  }, [visIdx, resolved, ghost]);

  const identityKey = `${drawKey ?? ''}|${stacked ? 's' : 'p'}|${resolved.map((r) => `${r.id}:${r.kind}`).join(',')}`;
  const prevIdentity = useRef(identityKey);
  const identityChanged = prevIdentity.current !== identityKey;
  useEffect(() => {
    prevIdentity.current = identityKey;
  }, [identityKey]);

  const xSpanT = targetX1 - targetX0 || 1;
  const ySpanT = targetY1 - targetY0 || 1;
  const [x0, x1, y0, y1] = useSpringValues([targetX0, targetX1, targetY0, targetY1], {
    response: 0.4,
    dampingRatio: 1,
    eps: [xSpanT * 5e-4, xSpanT * 5e-4, ySpanT * 5e-4, ySpanT * 5e-4],
    // A new series has no use for the old series' domain; the range spring
    // is for the SAME data seen through a different window.
    snap: reduced || identityChanged,
  });

  const reveal = useReveal(`${identityKey}|${uid}`, drawIn && !reduced);

  // --- layout --------------------------------------------------------------
  const L = LEFT;
  const R = width - (endLabels ? RIGHT_LABELED_MARGIN : RIGHT_MARGIN);
  const B = height - BOTTOM_MARGIN;
  const xSpan = x1 - x0 || 1;
  const ySpan = y1 - y0 || 1;
  const xFor = (year: number) => L + ((year - x0) / xSpan) * (R - L);
  const yFor = (v: number) => B - ((v - y0) / ySpan) * (B - TOP);
  const xForTarget = (year: number) => L + ((year - targetX0) / xSpanT) * (R - L);
  const yForTarget = (v: number) => B - ((v - targetY0) / ySpanT) * (B - TOP);

  // --- scrub ---------------------------------------------------------------
  const scrub = useScrub({
    years: visYears,
    domain: [x0, x1],
    plot: { left: L, right: R },
    focusYear,
    onFocusYear,
    onHoverYear,
  });
  const { activeYear, hoverYear, pinnedYear } = scrub;

  // --- geometry ------------------------------------------------------------
  const geo = useMemo(() => {
    const xs = years.map(xFor);
    const yBase = yFor(0);
    return resolved.map((r) => {
      const topYs = r.tops.map((v) => (Number.isFinite(v) ? yFor(v) : NaN));
      const baseYs = years.map((_, i) => {
        const b = r.bases?.[i];
        return b !== undefined && Number.isFinite(b) ? yFor(b) : yBase;
      });
      const hasLine = r.kind !== 'column' && r.lineWidth !== 0;
      return {
        r,
        topYs,
        baseYs,
        line: hasLine ? linePath(xs, topYs, r.s.stepAt) : '',
        area: r.kind === 'area' || (r.kind === 'line' && r.s.fill) ? areaPath(xs, topYs, baseYs, r.s.stepAt) : '',
      };
    });
    // xFor/yFor close over the animated domain and layout; list their inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, years, x0, x1, y0, y1, L, R, B]);

  const ghostGeo = useMemo(() => {
    if (!ghost) return null;
    const xs = years.map(xFor);
    const ys = ghost.values.map((v) => (Number.isFinite(v) ? yFor(v) : NaN));
    return { ys, d: linePath(xs, ys, ghost.stepAt) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost, years, x0, x1, y0, y1, L, R, B]);

  // --- axes ----------------------------------------------------------------
  // Decide WHICH ticks exist from the target window (stable while it
  // springs), and only POSITION them from the animated one.
  const ticks = useMemo(() => {
    const out: { value: number; ceiling: boolean }[] = [];
    for (const value of yTicks(targetY0, targetY1)) {
      const prev = out[out.length - 1];
      if (prev && Math.abs(yForTarget(prev.value) - yForTarget(value)) < MIN_Y_TICK_GAP_PX) out.pop();
      out.push({ value, ceiling: value !== 0 && Math.abs(value - targetY1) < 1e-6 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetY0, targetY1, height]);

  const xTickIdx = useMemo(
    () =>
      pickXTicks(
        visYears.map((y) => ({ x: xForTarget(y), label: formatX(y) })),
        R - L,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visYears, targetX0, targetX1, R, L, formatX],
  );

  const zeroY = yFor(0);
  const showZero = targetY0 < 0 && targetY1 > 0;

  // --- the readout ---------------------------------------------------------
  const spec = readout === false ? null : (readout ?? {});
  const readoutYear = activeYear ?? (visYears.length ? visYears[visYears.length - 1] : null);
  const readoutIdx = readoutYear === null ? -1 : years.indexOf(readoutYear);
  const fmt = spec?.format ?? money;

  let readoutNode = null;
  if (spec && readoutIdx >= 0) {
    const primaryRes = stacked && !spec.primaryId
      ? null
      : (resolved.find((r) => r.id === spec.primaryId) ??
        resolved.find((r) => r.kind === 'area') ??
        resolved[0]);
    const rawAt = (r: Resolved) => r.s.values[readoutIdx];
    const total = stacked
      ? resolved.reduce((a, r) => a + (!r.s.overlay && Number.isFinite(rawAt(r)) ? rawAt(r) : 0), 0)
      : NaN;
    const primaryValue = primaryRes ? rawAt(primaryRes) : total;

    const secondary: ReadoutItem[] = [];
    if (!spec.hideSecondary) {
      for (const r of resolved) {
        if (r === primaryRes) continue;
        const v = rawAt(r);
        if (!Number.isFinite(v)) continue;
        secondary.push({ id: r.id, label: r.s.label, color: r.s.color, value: fmt(v), dashed: r.s.dashed });
      }
      if (ghost && Number.isFinite(ghost.values[readoutIdx])) {
        secondary.push({
          id: '__ghost',
          label: ghost.label,
          color: 'var(--ink)',
          value: fmt(ghost.values[readoutIdx]),
          dashed: true,
        });
      }
    }

    const dTo = danger ? (danger.to ?? Infinity) : 0;
    const isShort = !!danger && readoutYear! >= danger.from - 1e-9 && readoutYear! <= dTo + 1e-9;
    const shortAmt = isShort ? danger!.shortFor?.(readoutYear!) : undefined;
    const label = spec.label ?? (primaryRes ? primaryRes.s.label : 'Total');
    readoutNode = (
      <ChartReadout
        label={label}
        labelText={typeof label === 'string' ? label : primaryRes?.s.label}
        value={Number.isFinite(primaryValue) ? fmt(primaryValue) : '–'}
        yearLabel={formatX(readoutYear!)}
        ages={spec.agesFor?.(readoutYear!)}
        secondary={secondary}
        short={isShort}
        shortAmount={shortAmt !== undefined && shortAmt > 0 ? money(shortAmt) : undefined}
        size={spec.size ?? 'hero'}
        actions={spec.actions}
      />
    );
  }

  // --- danger, markers, chips ---------------------------------------------
  const lastYear = years[years.length - 1];
  const dFrom = danger?.from ?? 0;
  const dTo = danger ? (danger.to ?? lastYear) : 0;
  const dangerIn = !!danger && dTo >= win.from - 1e-9 && dFrom <= win.to + 1e-9;
  const dangerOffRight = !!danger && dFrom > win.to + 1e-9;
  const dangerLeft = danger ? Math.max(L, xFor(dFrom - step / 2)) : 0;
  const dangerRight = danger ? Math.min(R, xFor(dTo + step / 2)) : 0;
  const dangerLabel = danger ? `${danger.label ?? 'Runs dry'}` : '';
  // The chip is HTML, so its width isn't known here; estimate it from its
  // text. Full wording when it fits inside the band, just the year on a
  // narrower one (a phone, a one-year band), nothing when even that won't.
  const chipWidth = (text: string) => 26 + text.length * 6.4;
  let dangerChip: { text: string; left: number } | null = null;
  if (dangerIn) {
    const room = R - (dangerLeft + 4) - 2;
    const full = `${dangerLabel} · ${formatX(dFrom)}`;
    const short = formatX(dFrom);
    const text = chipWidth(full) <= room ? full : short;
    const w = chipWidth(text);
    if (dangerRight - dangerLeft > 24 && w <= R - L) {
      // Keep it inside the plot even when the band starts near the right edge.
      dangerChip = { text, left: Math.min(dangerLeft + 4, R - w - 2) };
    }
  }

  const markerLabel =
    activeYear === null || !markers ? null : markers.filter((m) => Math.abs(m.year - activeYear) < 0.5);
  const markerChipW = markerLabel ? chipWidth(markerLabel.map((m) => m.label).join(' · ')) : 0;

  // --- column geometry -----------------------------------------------------
  const colGeo = geo.filter((g) => g.r.kind === 'column');
  const pxPerYear = (R - L) / xSpan;
  const slot = pxPerYear * step;
  const colCount = stacked ? 1 : Math.max(1, colGeo.length);
  const groupW = Math.min(slot * 0.72, 48 * colCount);
  const barW = groupW / colCount;

  const showAllDots = visIdx.length <= DOT_THRESHOLD;
  const activeIdx = activeYear === null ? -1 : years.indexOf(activeYear);

  let glowing = 0;
  const idGlow = `${uid}glow`;
  const idClip = `${uid}clip`;
  const idHatch = `${uid}hatch`;

  const plotFadeKey = reduced ? `${identityKey}|${range}` : 'live';
  const revealW = (R - L + 16) * reveal;

  if (years.length === 0) {
    return <div className="ns-tsc" style={{ height }} role="img" aria-label={ariaLabel} />;
  }

  return (
    <div className="ns-tsc">
      {readoutNode}
      <div className="ns-tsc-stage" ref={stageRef} style={{ height }}>
        <svg
          ref={scrub.svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="ns-tsc-svg"
          role="img"
          aria-label={`${ariaLabel}. Arrow keys step through the years.`}
          style={{ width: '100%', height, ...scrub.bind.style }}
          onPointerDown={scrub.bind.onPointerDown}
          onPointerMove={scrub.bind.onPointerMove}
          onPointerUp={scrub.bind.onPointerUp}
          onPointerCancel={scrub.bind.onPointerCancel}
          onPointerLeave={scrub.bind.onPointerLeave}
          onKeyDown={scrub.bind.onKeyDown}
          onBlur={scrub.bind.onBlur}
          tabIndex={scrub.bind.tabIndex}
        >
          <defs>
            {/* Region in user space: a horizontal line has a zero-height
                bounding box, and the default objectBoundingBox filter region
                would blur it to nothing. */}
            <filter id={idGlow} filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <feGaussianBlur stdDeviation={5} />
            </filter>
            <clipPath id={idClip}>
              <rect x={L - 8} y={0} width={Math.max(0, reveal >= 1 ? R - L + 16 : revealW)} height={height} />
            </clipPath>
            <pattern id={idHatch} patternUnits="userSpaceOnUse" width={7} height={7} patternTransform="rotate(45)">
              <rect width={7} height={7} className="ns-tsc-hatch-bg" />
              <line x1={0} y1={0} x2={0} y2={7} className="ns-tsc-hatch-line" />
            </pattern>
            {geo.map(({ r }, i) =>
              r.flatOpacity === undefined && (r.kind === 'area' || r.s.fill) ? (
                <linearGradient key={r.id} id={`${uid}g${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: r.s.color, stopOpacity: 0.28 }} />
                  <stop offset="100%" style={{ stopColor: r.s.color, stopOpacity: 0 }} />
                </linearGradient>
              ) : null,
            )}
          </defs>

          {/* Axes and grid sit outside the draw-in clip: only the data draws in. */}
          {bandFrom !== undefined && xFor(bandFrom) < R && (
            <rect
              x={Math.max(L, xFor(bandFrom))}
              y={TOP}
              width={Math.max(0, R - Math.max(L, xFor(bandFrom)))}
              height={B - TOP}
              className="ns-mini-band"
            />
          )}

          {bands?.map((b, i) => {
            const bx0 = Math.max(L, xFor(b.from));
            const bx1 = Math.min(R, xFor(b.to));
            if (bx1 - bx0 < 2) return null;
            return (
              <g key={`band-${i}`}>
                <rect x={bx0} y={TOP} width={bx1 - bx0} height={B - TOP} className={`ns-tsc-band ns-tsc-band-${i % 2}`} />
                {bx1 - bx0 > b.label.length * 6.2 + 12 && (
                  <text x={bx0 + 8} y={B + BAND_LABEL_DY} className="ns-tsc-band-label">
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}

          {ticks.map((t) => {
            const y = yFor(t.value);
            if (y < TOP - 1 || y > B + 1) return null;
            return (
              <g key={t.value}>
                <line x1={L} x2={R} y1={y} y2={y} className="ns-tsc-grid" />
                <text x={L - 8} y={y} className="ns-mini-axis" textAnchor="end" dy="0.32em">
                  {t.ceiling && yFormat === axisMoney ? tightCeilingMoney(t.value) : yFormat(t.value)}
                </text>
              </g>
            );
          })}

          {showZero && <line x1={L} x2={R} y1={zeroY} y2={zeroY} className="ns-mini-zero" />}

          {markYear !== undefined && markYear >= x0 && markYear <= x1 && (
            <line x1={xFor(markYear)} x2={xFor(markYear)} y1={TOP} y2={B} className="ns-mini-mark" />
          )}

          {xTickIdx.map((vi) => {
            const y = visYears[vi];
            const x = xFor(y);
            if (x < L - 1 || x > R + 1) return null;
            const label = todayYear !== undefined && y === todayYear ? 'Today' : formatX(y);
            const anchor = vi === 0 ? 'start' : vi === visYears.length - 1 ? 'end' : 'middle';
            return (
              <text key={y} x={x} y={B + 20} className="ns-mini-axis" textAnchor={anchor}>
                {label}
                {stubYear && y === stubYear.year && (
                  <tspan x={x} dy="1.15em" className="ns-mini-axis-sub">
                    {stubYear.label}
                  </tspan>
                )}
              </text>
            );
          })}

          <g key={plotFadeKey} className={reduced ? 'ns-tsc-fade' : undefined}>
            <g clipPath={`url(#${idClip})`}>
              {dangerIn && dangerRight > dangerLeft && (
                <rect
                  x={dangerLeft}
                  y={TOP}
                  width={dangerRight - dangerLeft}
                  height={B - TOP}
                  fill={`url(#${idHatch})`}
                />
              )}

              {geo.map(({ r, area }, i) =>
                area ? (
                  <path
                    key={`a-${r.id}`}
                    d={area}
                    stroke="none"
                    fill={r.flatOpacity === undefined ? `url(#${uid}g${i})` : r.s.color}
                    fillOpacity={r.flatOpacity === undefined ? undefined : r.flatOpacity}
                  />
                ) : null,
              )}

              {colGeo.map((g, j) =>
                years.map((yr, i) => {
                  const top = g.r.tops[i];
                  if (!Number.isFinite(top)) return null;
                  const x = xFor(yr);
                  // Only bars that overlap the plot: the draw-in clip is 8px wider than
                  // the plot, so a bar starting just past the edge would show a sliver.
                  if (x + groupW / 2 <= L || x - groupW / 2 >= R) return null;
                  const base = g.r.bases?.[i] ?? 0;
                  const yTop = yFor(top);
                  const yBot = yFor(base);
                  const bx = stacked ? x - groupW / 2 : x - groupW / 2 + j * barW;
                  const w = Math.max(1, barW - (stacked ? 0 : 2));
                  const hgt = Math.abs(yBot - yTop);
                  if (hgt < 0.5) return null;
                  const rad = Math.min(3, w / 2, hgt);
                  const up = top >= base;
                  const y1p = Math.min(yTop, yBot);
                  const y2p = y1p + hgt;
                  const d = up
                    ? `M${bx},${y2p}V${y1p + rad}Q${bx},${y1p} ${bx + rad},${y1p}H${bx + w - rad}Q${bx + w},${y1p} ${bx + w},${y1p + rad}V${y2p}Z`
                    : `M${bx},${y1p}V${y2p - rad}Q${bx},${y2p} ${bx + rad},${y2p}H${bx + w - rad}Q${bx + w},${y2p} ${bx + w},${y2p - rad}V${y1p}Z`;
                  const dim = activeYear !== null && activeIdx !== i;
                  return (
                    <path
                      key={`${g.r.id}-${i}`}
                      d={d}
                      fill={g.r.s.color}
                      className="ns-tsc-col"
                      style={{ opacity: dim ? 0.55 : 1 }}
                    />
                  );
                }),
              )}

              {/* The glow is a blurred COPY under the line: a filter on the
                  line itself would blur the 2px stroke into the glow. */}
              {geo.map(({ r, line }) => {
                if (!line || r.s.dashed || stacked || glowing >= MAX_GLOWING_LINES) return null;
                glowing++;
                return (
                  <path
                    key={`g-${r.id}`}
                    d={line}
                    fill="none"
                    stroke={r.s.color}
                    strokeWidth={6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.35}
                    filter={`url(#${idGlow})`}
                  />
                );
              })}

              {geo.map(({ r, line }) =>
                line ? (
                  <path
                    key={`l-${r.id}`}
                    d={line}
                    fill="none"
                    stroke={r.s.color}
                    strokeWidth={r.lineWidth}
                    strokeDasharray={r.s.dashed ? '5 4' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ) : null,
              )}

              {ghostGeo?.d && <path d={ghostGeo.d} fill="none" className="ns-tsc-ghost" />}

              {geo.map(({ r, topYs, line }) =>
                line && (r.s.dots || showAllDots)
                  ? visIdx.map((i) =>
                      Number.isFinite(topYs[i]) ? (
                        <circle key={`d-${r.id}-${i}`} cx={xFor(years[i])} cy={topYs[i]} r={3.5} fill={r.s.color} />
                      ) : null,
                    )
                  : null,
              )}

              {markers?.map((m, i) => {
                if (m.year < x0 - 1e-9 || m.year > x1 + 1e-9) return null;
                return (
                  <line
                    key={`m-${i}`}
                    x1={xFor(m.year)}
                    x2={xFor(m.year)}
                    y1={B}
                    y2={B - 8}
                    className={`ns-tsc-marker ns-tsc-marker-${m.tone}`}
                  />
                );
              })}
            </g>

            {/* The pin and cursor are outside the clip so a point at the very
                edge keeps its whole halo. */}
            {pinnedYear !== null && xFor(pinnedYear) >= L - 1 && xFor(pinnedYear) <= R + 1 && (
              <line x1={xFor(pinnedYear)} x2={xFor(pinnedYear)} y1={TOP - 4} y2={B} className="ns-tsc-pin" />
            )}
            {hoverYear !== null && hoverYear !== pinnedYear && (
              <line x1={xFor(hoverYear)} x2={xFor(hoverYear)} y1={TOP} y2={B} className="ns-tsc-cursor" />
            )}

            {activeIdx >= 0 &&
              geo.map(({ r, topYs, line, area }) => {
                if (r.kind === 'column' || (!line && !area)) return null;
                const cy = topYs[activeIdx];
                if (!Number.isFinite(cy)) return null;
                const cx = xFor(years[activeIdx]);
                return (
                  <g key={`ad-${r.id}`} className="ns-tsc-active">
                    <circle cx={cx} cy={cy} r={11} fill={r.s.color} opacity={0.18} />
                    <circle cx={cx} cy={cy} r={5} fill={r.s.color} className="ns-tsc-active-dot" />
                  </g>
                );
              })}
            {activeIdx >= 0 && ghostGeo && Number.isFinite(ghostGeo.ys[activeIdx]) && (
              <circle
                cx={xFor(years[activeIdx])}
                cy={ghostGeo.ys[activeIdx]}
                r={4}
                className="ns-tsc-ghost-dot"
              />
            )}
          </g>

          {endLabels && (
            <EndLabels
              items={geo.filter((g) => g.line || g.area)}
              years={years}
              visIdx={visIdx}
              xFor={xFor}
              rightEdge={R}
            />
          )}

          {bandFrom !== undefined && bandLabel && R - xFor(bandFrom) > 100 && (
            <g>
              <rect
                x={xFor(bandFrom) + 2}
                y={TOP + 2}
                width={bandLabel.length * 5.9 + 10}
                height={13}
                rx={2}
                className="ns-mini-band-label-chip"
              />
              <text x={xFor(bandFrom) + 7} y={TOP + 10} className="ns-mini-band-label">
                {bandLabel}
              </text>
            </g>
          )}
        </svg>

        {/* Chips are HTML, not SVG text: they size to their words, and the
            off-window one is a real button. The layer ignores the pointer so
            the scrub underneath still works; only buttons opt back in. */}
        <div className="ns-tsc-overlay">
          {pinnedYear !== null && xFor(pinnedYear) >= L && xFor(pinnedYear) <= R && (
            <span
              className="ns-tsc-chip ns-tsc-chip-pin"
              style={{ left: Math.min(Math.max(xFor(pinnedYear), L + 20), width - 24), top: 2 }}
            >
              {formatX(pinnedYear)}
            </span>
          )}
          {dangerIn && dangerChip && (
            <span
              className="ns-tsc-chip ns-tsc-chip-danger"
              style={{ left: dangerChip.left, top: TOP + 6 }}
            >
              <span aria-hidden="true">✗</span> {dangerChip.text}
            </span>
          )}
          {dangerOffRight && (
            <button
              type="button"
              className="ns-tsc-chip ns-tsc-chip-danger ns-tsc-chip-btn"
              style={{ right: width - R + 4, top: TOP + 6 }}
              onClick={() => onRequestRange?.('all')}
            >
              <span aria-hidden="true">✗</span> {dangerLabel} {formatX(dFrom)} →
            </button>
          )}
          {markerLabel && markerLabel.length > 0 && (
            <span
              className="ns-tsc-chip ns-tsc-chip-marker"
              style={{
                left: Math.min(Math.max(xFor(markerLabel[0].year), L + markerChipW / 2), R - markerChipW / 2),
                top: B - 38,
              }}
            >
              {markerLabel.map((m) => m.label).join(' · ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Direct end labels — a small colour dot (identity) beside plain-ink text
 * (the name), never the series colour on the text itself (dataviz: "text
 * wears text tokens"). Sorted by y and pushed apart by `END_LABEL_GAP` so
 * two lines finishing close together never collide; the dot stays at the
 * line's true end and only the text baseline moves. Moved here unchanged
 * from MiniChart, which the kit now draws.
 */
function EndLabels({
  items,
  years,
  visIdx,
  xFor,
  rightEdge,
}: {
  items: { r: Resolved; topYs: number[] }[];
  years: number[];
  visIdx: number[];
  xFor(year: number): number;
  rightEdge: number;
}) {
  const placed = items
    .map(({ r, topYs }) => {
      let idx = -1;
      for (let k = visIdx.length - 1; k >= 0; k--) {
        if (Number.isFinite(topYs[visIdx[k]])) {
          idx = visIdx[k];
          break;
        }
      }
      const rawX = idx >= 0 ? xFor(years[idx]) : rightEdge;
      const rawY = idx >= 0 ? topYs[idx] : 0;
      return { r, rawX, rawY, labelY: rawY };
    })
    .sort((a, b) => a.rawY - b.rawY);
  for (let i = 1; i < placed.length; i++) {
    if (placed[i].labelY - placed[i - 1].labelY < END_LABEL_GAP) {
      placed[i].labelY = placed[i - 1].labelY + END_LABEL_GAP;
    }
  }
  return (
    <>
      {placed.map(({ r, rawX, rawY, labelY }) => (
        <g key={r.id}>
          {(Math.abs(labelY - rawY) > 1 || Math.abs(rawX - rightEdge) > 1) && (
            <line x1={rawX + 4} x2={rightEdge + 12} y1={rawY} y2={labelY} className="ns-mini-endlabel-lead" />
          )}
          <circle cx={rawX + 4} cy={rawY} r={2.5} fill={r.s.color} />
          <text x={rightEdge + 16} y={labelY} className="ns-mini-endlabel" dy="0.32em">
            {r.s.label}
          </text>
        </g>
      ))}
    </>
  );
}
