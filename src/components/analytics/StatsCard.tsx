'use client';

import { useTranslation } from 'react-i18next';
import { LucideIcon } from 'lucide-react';
import { motion } from '@/lib/cssMotion';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

const colorMap = {
  blue: { bg: 'bg-blue-500/20 dark:bg-blue-500/30', icon: 'text-blue-600 dark:text-blue-400' },
  green: { bg: 'bg-green-500/20 dark:bg-green-500/30', icon: 'text-green-600 dark:text-green-400' },
  yellow: {
    bg: 'bg-yellow-500/20 dark:bg-yellow-500/30',
    icon: 'text-yellow-600 dark:text-yellow-400',
  },
  red: { bg: 'bg-red-500/20 dark:bg-red-500/30', icon: 'text-red-600 dark:text-red-400' },
  purple: {
    bg: 'bg-purple-500/20 dark:bg-purple-500/30',
    icon: 'text-purple-600 dark:text-purple-400',
  },
};

export function StatsCard({ title, value, icon: Icon, trend, color = 'blue' }: StatsCardProps) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.02 }}
      transition={{ duration: 0.2 }}
      className="bg-(--background-subtle) rounded-2xl p-3 sm:p-4 shadow-lg border border-(--border) relative overflow-hidden"
    >
      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-(--text-muted) mb-1">{title}</p>
            <p className="text-lg sm:text-2xl md:text-3xl font-bold text-(--text-primary)">
              {value}
            </p>

            {trend && (
              <div className="flex items-center gap-1 mt-2">
                <span
                  className={`text-sm font-medium ${trend.isPositive ? 'text-emerald-500' : 'text-rose-500'}`}
                >
                  {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
                </span>
                <span className="text-xs text-(--text-muted)">{t('analytics.vsLastMonth')}</span>
              </div>
            )}
          </div>

          <div className={`p-3 rounded-xl ${colorMap[color].bg}`}>
            <Icon className={`w-5 h-5 ${colorMap[color].icon}`} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
