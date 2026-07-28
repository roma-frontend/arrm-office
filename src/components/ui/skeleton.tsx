'use client';

import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'none';
}

export function Skeleton({
  className,
  variant = 'rectangular',
  width,
  height,
  animation = 'pulse',
}: SkeletonProps) {
  const shapeClasses = {
    text: 'rounded-sm',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-md',
  };

  const animationClass = animation === 'pulse' ? 'shimmer' : '';

  const style: React.CSSProperties = {
    width: width ? (typeof width === 'number' ? `${width}px` : width) : '100%',
    height: height ? (typeof height === 'number' ? `${height}px` : height) : '1rem',
    backgroundColor: 'var(--background-subtle)',
  };

  return (
    <div
      className={cn('bg-white/5', shapeClasses[variant], animationClass, className)}
      style={style}
    />
  );
}

// Common skeleton patterns
export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          height="0.75rem"
          width={i === lines - 1 ? '75%' : '100%'}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('p-4 space-y-3 rounded-xl border border-(--border) bg-(--card)', className)}>
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" />
        </div>
      </div>
      <SkeletonText lines={2} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <table className={cn('w-full', className)}>
      <thead>
        <tr className="border-b border-(--border)">
          <th className="text-left px-6 py-3">
            <Skeleton variant="text" width="60%" height="0.75rem" />
          </th>
          <th className="text-left px-4 py-3">
            <Skeleton variant="text" width="60%" height="0.75rem" />
          </th>
          <th className="text-left px-4 py-3 hidden md:table-cell">
            <Skeleton variant="text" width="60%" height="0.75rem" />
          </th>
          <th className="text-left px-4 py-3 hidden sm:table-cell">
            <Skeleton variant="text" width="60%" height="0.75rem" />
          </th>
          <th className="text-left px-4 py-3 hidden lg:table-cell">
            <Skeleton variant="text" width="60%" height="0.75rem" />
          </th>
          <th className="text-left px-4 py-3">
            <Skeleton variant="text" width="60%" height="0.75rem" />
          </th>
          <th className="text-left px-4 py-3">
            <Skeleton variant="text" width="60%" height="0.75rem" />
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-(--border)">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <tr key={rowIdx} style={{ height: '3.25rem' }}>
            <td className="px-6 py-3">
              <div className="space-y-1">
                <Skeleton variant="text" width="80%" height="0.875rem" />
                <Skeleton variant="text" width="50%" height="0.75rem" />
              </div>
            </td>
            <td className="px-4 py-3">
              <Skeleton variant="text" width="60%" height="1.5rem" />
            </td>
            <td className="px-4 py-3 hidden md:table-cell">
              <Skeleton variant="text" width="70%" height="0.875rem" />
            </td>
            <td className="px-4 py-3 hidden sm:table-cell">
              <Skeleton variant="text" width="40%" height="1rem" />
            </td>
            <td className="px-4 py-3 hidden lg:table-cell">
              <Skeleton variant="text" width="90%" height="0.875rem" />
            </td>
            <td className="px-4 py-3">
              <Skeleton variant="text" width="50%" height="1.5rem" />
            </td>
            <td className="px-4 py-3">
              <Skeleton variant="text" width="2rem" height="2rem" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
