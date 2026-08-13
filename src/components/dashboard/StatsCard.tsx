'use client';

import React, { useEffect, useRef, useState, memo } from 'react';
import Link from 'next/link';
import { motion } from '@/lib/cssMotion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: number | string;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'cyan';
  prefix?: string;
  suffix?: string;
  index?: number;
  /** One line of context under the number — a share, a total, a qualifier. */
  hint?: string;
  /** Makes the whole tile a link to the screen the number belongs to. */
  href?: string;
  /** Recent history for a bare sparkline; skipped when it says nothing. */
  trend?: number[];
}

/**
 * Metric colours, resolved from design tokens rather than literal hex.
 *
 * Two things this fixes. The values were hard-coded (`#2563eb`, `#10b981`, …),
 * so the tiles were the one part of the dashboard that ignored the theme and
 * kept light-mode colours in dark mode. And `purple` was mapped to `#0ea5e9` —
 * sky blue — which is why the "on leave now" tile never looked purple.
 *
 * `accent` is consumed as an inline `background`/`stroke`, so it must resolve to
 * a colour value; `icon` is a utility pair for the chip.
 */
const colorMap: Record<StatsCardProps['color'], { accent: string; icon: string; border: string }> =
  {
    blue: {
      accent: 'var(--brand)',
      icon: 'bg-(--brand-quiet) text-(--brand-text)',
      border: 'border-(--border-subtle)',
    },
    green: {
      accent: 'var(--success-solid)',
      icon: 'bg-(--success-quiet) text-(--success-text)',
      border: 'border-(--border-subtle)',
    },
    yellow: {
      accent: 'var(--warning-solid)',
      icon: 'bg-(--warning-quiet) text-(--warning-text)',
      border: 'border-(--border-subtle)',
    },
    red: {
      accent: 'var(--danger-solid)',
      icon: 'bg-(--danger-quiet) text-(--danger-text)',
      border: 'border-(--border-subtle)',
    },
    purple: {
      accent: 'var(--purple)',
      icon: 'bg-(--purple-quiet) text-(--purple-text)',
      border: 'border-(--border-subtle)',
    },
    cyan: {
      accent: 'var(--cyan-500)',
      icon: 'bg-(--brand-quiet) text-(--brand-text)',
      border: 'border-(--border-subtle)',
    },
  };

/**
 * A sparkline drawn as a single path, no library and no axes.
 *
 * The point is the shape of the last few months, not the values — those are read
 * from the number above it.
 */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  // A flat line carries no information and would read as a decorative rule.
  if (max === min) return null;

  const width = 64;
  const height = 22;
  const step = width / (points.length - 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = height - ((p - min) / (max - min)) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-hidden="true"
      className="shrink-0 opacity-70"
    >
      <path
        d={path}
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function useCountUp(target: number, duration = 1500) {
  const [count, setCount] = useState(0);
  const raf = useRef<number | null>(null);
  const start = useRef<number | null>(null);

  useEffect(() => {
    start.current = null;
    const step = (timestamp: number) => {
      if (!start.current) start.current = timestamp;
      const elapsed = timestamp - start.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (progress < 1) {
        raf.current = requestAnimationFrame(step);
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, duration]);

  return count;
}

export const StatsCard = memo(
  function StatsCard({
    title,
    value,
    change,
    changeLabel,
    icon,
    color,
    prefix = '',
    suffix = '',
    index = 0,
    hint,
    href,
    trend,
  }: StatsCardProps) {
    const colors = colorMap[color];
    const numericValue = typeof value === 'number' ? value : 0;
    const animatedValue = useCountUp(numericValue);
    const isPositive = (change ?? 0) >= 0;

    /**
     * The tile used to be washed in its own colour: four of them side by side
     * fought each other and none of the numbers stood out. The surface is now the
     * ordinary card, and the colour is spent where it identifies the metric —
     * the icon and a hairline along the top edge.
     */
    const body = (
      <>
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 opacity-60"
          style={{ background: colors.accent }}
        />

        <div className="relative flex items-start justify-between gap-3">
          <p className="text-[10px] sm:text-[11px] font-semibold text-(--text-muted) uppercase tracking-wider leading-tight">
            {title}
          </p>
          <div
            className={cn(
              'w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0',
              colors.icon,
            )}
          >
            {icon}
          </div>
        </div>

        <div className="relative mt-2 flex items-end justify-between gap-2">
          <div className="flex items-baseline gap-0.5 sm:gap-1 min-w-0">
            {prefix && (
              <span className="text-lg sm:text-xl font-semibold text-(--text-primary)">
                {prefix}
              </span>
            )}
            <span className="text-2xl sm:text-3xl font-semibold text-(--text-primary) tabular-nums leading-none tracking-tight">
              {typeof value === 'number' ? animatedValue.toLocaleString() : value}
            </span>
            {suffix && (
              <span className="text-lg sm:text-xl font-semibold text-(--text-primary)">
                {suffix}
              </span>
            )}
          </div>

          {trend && trend.length > 1 && <Sparkline points={trend} color={colors.accent} />}
        </div>

        {(change !== undefined || hint) && (
          <div className="relative mt-2 flex items-center gap-2 flex-wrap">
            {change !== undefined && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-medium',
                  isPositive ? 'text-(--success-text)' : 'text-(--danger-text)',
                )}
              >
                {isPositive ? (
                  <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                ) : (
                  <TrendingDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                )}
                {isPositive ? '+' : ''}
                {change}%
              </span>
            )}
            {changeLabel && (
              <span className="text-[11px] text-(--text-muted) hidden sm:inline">
                {changeLabel}
              </span>
            )}
            {hint && <span className="text-[11px] text-(--text-muted) truncate">{hint}</span>}
          </div>
        )}
      </>
    );

    const shell = cn(
      'relative overflow-hidden rounded-card border p-3 sm:p-4 shadow-sm bg-(--card)',
      'transition-[box-shadow,border-color] duration-140 ease-spark',
      colors.border,
      href && 'cursor-pointer hover:shadow-md hover:border-(--border-strong)',
      href && 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
    );

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.1, ease: 'easeOut' }}
        // No hover lift. Nudging a tile upward shifts the optical baseline of a
        // whole row of them, which makes a dense grid feel unstable; the shadow
        // step on `shell` carries the affordance instead.
        className={href ? undefined : shell}
      >
        {href ? (
          // A number with nowhere to go is a dead end: the tile leads to the
          // screen where the number can be acted on.
          <Link href={href} className={cn(shell, 'block')}>
            {body}
          </Link>
        ) : (
          body
        )}
      </motion.div>
    );
  },
  (prev, next) => {
    // Custom comparison: only re-render if props actually changed
    return (
      prev.title === next.title &&
      prev.value === next.value &&
      prev.change === next.change &&
      prev.changeLabel === next.changeLabel &&
      prev.color === next.color &&
      prev.prefix === next.prefix &&
      prev.suffix === next.suffix &&
      prev.index === next.index &&
      prev.hint === next.hint &&
      prev.href === next.href &&
      prev.trend === next.trend
    );
  },
);
