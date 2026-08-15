/**
 * StatCard - Reusable stat card component
 * Small, focused, memoized for performance
 */

'use client';

import React, { memo } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  gradientFrom?: string;
  gradientTo?: string;
  iconBgColor?: string;
}

export const StatCard = memo(function StatCard({
  label,
  value,
  icon: Icon,
  gradientFrom = 'var(--purple)',
  gradientTo = 'var(--purple-text)',
  iconBgColor = 'var(--purple-quiet)',
}: StatCardProps) {
  return (
    <Card className="drivers-card-hover relative overflow-hidden border-(--border)">
      <div className="drivers-stats-shimmer absolute inset-0 pointer-events-none" />
      <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
        <h3 className="text-sm font-medium text-(--text-muted)">{label}</h3>
        <div className="p-2 rounded-lg" style={{ background: iconBgColor }}>
          <Icon className="w-4 h-4" style={{ color: gradientFrom }} />
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div
          className="text-2xl font-bold"
          style={{
            background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
});
