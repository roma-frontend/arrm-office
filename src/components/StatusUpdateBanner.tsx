'use client';

import React from 'react';
import { useStatusUpdate } from '@/context/StatusUpdateContext';
import { X, CheckCircle2, Clock, Phone, Zap, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const statusConfig: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    bg: string;
    border: string;
    title: string;
    subtitle: string;
    iconColor: string;
    type: 'success' | 'warning' | 'info' | 'error' | 'neutral';
  }
> = {
  available: {
    icon: CheckCircle2,
    bg: 'bg-slate-900/5 dark:from-green-950/30 dark:to-emerald-950/30',
    border: 'border-emerald-500/20 dark:border-green-800/50',
    title: 'text-primary-text',
    subtitle: 'text-primary-text/80',
    iconColor: 'text-emerald-600 dark:text-green-400',
    type: 'success',
  },
  in_meeting: {
    icon: Clock,
    bg: 'bg-slate-900/5 dark:from-yellow-950/30 dark:to-amber-950/30',
    border: 'border-amber-500/25 dark:border-yellow-800/50',
    title: 'text-primary-text',
    subtitle: 'text-primary-text/80',
    iconColor: 'text-amber-600 dark:text-yellow-400',
    type: 'warning',
  },
  in_call: {
    icon: Phone,
    bg: 'bg-slate-900/5 dark:from-blue-950/30 dark:to-sky-950/30',
    border: 'border-sky-500/25 dark:border-blue-800/50',
    title: 'text-primary-text',
    subtitle: 'text-primary-text/80',
    iconColor: 'text-sky-600 dark:text-blue-400',
    type: 'info',
  },
  out_of_office: {
    icon: AlertTriangle,
    bg: 'bg-slate-900/5 dark:from-orange-950/30 dark:to-amber-950/30',
    border: 'border-orange-500/25 dark:border-orange-800/50',
    title: 'text-primary-text',
    subtitle: 'text-primary-text/80',
    iconColor: 'text-orange-600 dark:text-orange-400',
    type: 'warning',
  },
  busy: {
    icon: Zap,
    bg: 'bg-slate-900/5 dark:from-red-950/30 dark:to-red-950/30',
    border: 'border-rose-500/25 dark:border-red-800/50',
    title: 'text-primary-text',
    subtitle: 'text-primary-text/80',
    iconColor: 'text-rose-600 dark:text-red-400',
    type: 'error',
  },
};

const defaultConfig = statusConfig.available;

export function StatusUpdateBanner() {
  const { notification, hideNotification } = useStatusUpdate();
  const { t } = useTranslation();

  if (!notification) return null;

  const config = statusConfig[notification.statusKey] || defaultConfig;
  if (!config) return null;
  const Icon = config.icon;
  const hint = t(`status.${notification.statusKey}.notification`, '');

  return (
    <div className={`w-full ${config.bg} border-b ${config.border} shadow-sm dark:bg-linear-to-r`}>
      <div className="max-w-full mx-auto px-4 py-3 flex items-start justify-between gap-3">
        {/* Left: Icon and Message */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="shrink-0 mt-0.5">
            <Icon className={`w-5 h-5 ${config.iconColor}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold ${config.title} truncate`}>
              {t('status.updated', 'Status Updated')} — {notification.statusLabel}
            </p>
            {hint && (
              <p className={`text-xs mt-0.5 ${config.subtitle} leading-relaxed font-medium`}>
                {hint}
              </p>
            )}
          </div>
        </div>

        {/* Right: Close Button */}
        <button
          onClick={hideNotification}
          className={`shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${config.subtitle}`}
          aria-label={t('common.close', 'Close')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
