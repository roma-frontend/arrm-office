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

/** Helpers: read design tokens from the computed :root so SVG attrs get literals. */
function readToken(name: string, fallback = ''): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v ? v.trim() : fallback;
  } catch {
    return fallback;
  }
}

function readChannel(name: string): string | null {
  const v = readToken(name);
  return v ? v : null;
}

/** Build palette by reading `--chart-1..8` tokens; fall back to sensible defaults. */
function resolvePalette(): readonly string[] {
  const fallback = [
    '#1e3a5f',
    '#0d7377',
    '#c2410c',
    '#059669',
    '#06b6d4',
    '#ec4899',
    '#f43f5e',
    '#64748b',
  ];
  return Array.from({ length: 8 }, (_, i) => readToken(`--chart-${i + 1}`, fallback[i])).slice(
    0,
    8,
  );
}

/** Resolve semantic status colours from tokens. */
function resolveStatus() {
  return {
    success: readToken('--success-solid', '#0d7377'),
    warning: readToken('--warning-solid', '#f59e0b'),
    danger: readToken('--danger-solid', '#ef4444'),
    brand: readToken('--brand', '#1e3a5f'),
    info: readToken('--cyan', '#06b6d4'),
    accentAlt: readToken('--pink-500', '#ec4899'),
  } as const;
}

/** Semantic series colours. Keyed by role, so a "rejected" line is the same red
 *  as a destructive badge. */
export type ChartStatusKey = 'success' | 'warning' | 'danger' | 'brand' | 'info' | 'accentAlt';
export type ChartStatusColors = Record<ChartStatusKey, string>;

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
  // Read tokens from the computed :root so values are literal strings usable
  // in SVG attributes (hex / rgb(...)). This avoids keeping literals in JS.
  const palette = resolvePalette();
  const status = resolveStatus();

  const tooltipBg = readToken('--surface-2', '#ffffff');
  const tooltipBorder = readToken('--border-default', '#c7d9f5');
  const tooltipColor = readToken('--text-1', '#0c1a2e');
  const tooltipShadow = readToken(
    '--elev-3',
    '0 10px 15px rgb(0 0 0 / 35%), 0 4px 6px rgb(0 0 0 / 4%)',
  );
  const textColor = readToken('--text-2', '#1e3a6e');
  const gridStroke = readToken('--chart-grid', 'rgb(37 99 235 / 10%)');
  const axisTickFill = readToken('--chart-axis', '#3d6196');

  // Build a hover fill from the brand channels when available, otherwise
  // fall back to a translucent brand-600 or a low-opacity white on dark.
  const brandCh = readChannel('--brand-600-ch');
  const hoverFill = brandCh
    ? `rgb(${brandCh} / 5%)`
    : readToken('--brand-quiet', 'rgb(37 99 235 / 5%)');

  const tooltipStyle: React.CSSProperties = {
    backgroundColor: tooltipBg,
    border: `1px solid ${tooltipBorder}`,
    borderRadius: Number(readToken('--radius-panel', '18').replace('px', '')) || 18,
    color: tooltipColor,
    boxShadow: tooltipShadow,
    padding: '10px 12px',
    fontSize: 13,
  };

  return {
    isDark,
    palette,
    status,
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

const FALLBACK_PALETTE = [
  '#2563eb',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#f43f5e',
  '#64748b',
] as const;
export const CHART_PALETTE_LIGHT: readonly string[] =
  typeof window !== 'undefined' ? resolvePalette() : Array.from(FALLBACK_PALETTE);
export const CHART_PALETTE_DARK: readonly string[] = CHART_PALETTE_LIGHT;
