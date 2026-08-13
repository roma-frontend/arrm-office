'use client';

import { useMemo } from 'react';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Chart theming — one source of truth for every Recharts surface in the app.
 *
 * Why literal hex here rather than `var(--chart-1)`: Recharts passes `fill` and
 * `stroke` straight through to SVG *presentation attributes*, and `var()` is only
 * valid inside CSS declarations — not in an XML attribute value. `fill="var(--x)"`
 * silently renders black. So the values below deliberately mirror the tokens in
 * src/styles/tokens.css; if a token changes, change its twin here.
 *
 * This replaces an identical eight-line block that was copy-pasted into nine
 * components, each with slightly drifted values (axis ticks at 0.6 opacity in
 * some files, 0.8 in others) and a tooltip surface — #0f172a — that matched no
 * theme colour at all.
 */

/** Categorical series colours. Ordered by how often a series is the primary one. */
const PALETTE_LIGHT = [
  '#2563eb', // chart-1  brand
  '#10b981', // chart-2  emerald
  '#f59e0b', // chart-3  amber
  '#8b5cf6', // chart-4  violet
  '#06b6d4', // chart-5  cyan
  '#ec4899', // chart-6  pink
  '#f43f5e', // chart-7  rose
  '#64748b', // chart-8  slate
] as const;

const PALETTE_DARK = [
  '#608ffa',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
  '#22d3ee',
  '#f472b6',
  '#fb7185',
  '#94a3b8',
] as const;

/** Status series — leave requests, approvals, SLA. Semantic, not categorical. */
const STATUS_LIGHT = {
  success: '#059669',
  warning: '#f59e0b',
  danger: '#ef4444',
  brand: '#2563eb',
  info: '#06b6d4',
  accentAlt: '#ec4899',
} as const;

const STATUS_DARK = {
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  brand: '#608ffa',
  info: '#22d3ee',
  accentAlt: '#f472b6',
} as const;

/** Semantic series colours. Keyed by role, so a "rejected" line is the same red
 *  as a destructive badge. */
export type ChartStatusColors = Record<keyof typeof STATUS_LIGHT, string>;

export interface ChartTheme {
  isDark: boolean;
  /** Categorical palette; index with `i % palette.length`. */
  palette: readonly string[];
  /** Semantic series colours. */
  status: ChartStatusColors;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipColor: string;
  tooltipShadow: string;
  /** Legend / label text. */
  textColor: string;
  gridStroke: string;
  axisTickFill: string;
  /** Bar/area hover band. Must be a literal — Recharts writes it to an SVG
   *  attribute, where `var()` is not valid. */
  hoverFill: string;
  /** Drop-in `contentStyle` for `<Tooltip>`. */
  tooltipStyle: React.CSSProperties;
  /** Spread onto `<Tooltip {...tooltipProps} />` for the full treatment. */
  tooltipProps: {
    contentStyle: React.CSSProperties;
    itemStyle: React.CSSProperties;
    labelStyle: React.CSSProperties;
  };
}

/**
 * Pure resolver behind {@link useChartTheme}. Exported so tests and non-React
 * call sites can assert against the real values instead of re-hard-coding them —
 * a duplicated literal in a test is how a palette silently drifts out of sync.
 */
export function getChartTheme(isDark: boolean): ChartTheme {
  // Mirrors --surface-2, --border-default, --text-1/2/3 and --elev-3 for the
  // current theme. A tooltip sits above the card it describes, so it takes
  // surface-2 rather than surface-1.
  const tooltipBg = isDark ? '#0d1e38' : '#ffffff';
  const tooltipBorder = isDark ? '#1a3460' : '#c7d9f5';
  const tooltipColor = isDark ? '#e8f0fe' : '#0c1a2e';
  const tooltipShadow = isDark
    ? '0 10px 15px rgb(0 0 0 / 60%)'
    : '0 10px 15px rgb(37 99 235 / 10%), 0 4px 6px rgb(0 0 0 / 4%)';
  const textColor = isDark ? '#bdd4fa' : '#1e3a6e';
  const gridStroke = isDark ? 'rgb(255 255 255 / 8%)' : 'rgb(37 99 235 / 10%)';
  const axisTickFill = isDark ? '#7ab3f5' : '#3d6196';
  const hoverFill = isDark ? 'rgb(255 255 255 / 5%)' : 'rgb(37 99 235 / 5%)';

  const tooltipStyle: React.CSSProperties = {
    backgroundColor: tooltipBg,
    border: `1px solid ${tooltipBorder}`,
    // --radius-panel; a chart tooltip is a floating panel, not a card.
    borderRadius: 18,
    color: tooltipColor,
    boxShadow: tooltipShadow,
    padding: '10px 12px',
    fontSize: 13,
  };

  return {
    isDark,
    palette: isDark ? PALETTE_DARK : PALETTE_LIGHT,
    status: isDark ? STATUS_DARK : STATUS_LIGHT,
    tooltipBg,
    tooltipBorder,
    tooltipColor,
    tooltipShadow,
    textColor,
    gridStroke,
    axisTickFill,
    hoverFill,
    tooltipStyle,
    tooltipProps: {
      contentStyle: tooltipStyle,
      itemStyle: { color: tooltipColor, fontWeight: 500 },
      labelStyle: { color: tooltipColor, fontWeight: 600, fontSize: 13, marginBottom: 4 },
    },
  };
}

export function useChartTheme(): ChartTheme {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return useMemo(() => getChartTheme(isDark), [isDark]);
}

export { PALETTE_LIGHT as CHART_PALETTE_LIGHT, PALETTE_DARK as CHART_PALETTE_DARK };
