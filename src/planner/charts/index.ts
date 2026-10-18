/**
 * The v5 chart kit (docs/REDESIGN-V5.md §3). Import from here, not from the
 * individual files, so the kit can reorganise inside without touching pages.
 */
export { TimeSeriesChart } from './TimeSeriesChart';
export type { TimeSeriesChartProps } from './TimeSeriesChart';
export { ChartReadout } from './ChartReadout';
export type { ChartReadoutProps, ReadoutItem } from './ChartReadout';
export { RangePicker } from './RangePicker';
export { DonutChart } from './DonutChart';
export type { DonutChartProps, DonutSegment } from './DonutChart';
export { useScrub } from './useScrub';
export type { ScrubState, UseScrubOptions } from './useScrub';
export { RANGE_KEYS, availableRanges, effectiveRange, rangeLabel, rangeWindow } from './range';
export type { RangeKey } from './range';
export type { ChartBand, ChartMarker, ChartSeries, DangerBand, ReadoutSpec } from './types';
