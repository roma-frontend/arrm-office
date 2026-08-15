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
    bg: 'bg-(--surface-2) dark:bg-(--success-solid) dark:bg-(--success-solid)',
    border: 'border-(--success-outline) dark:border-(--success-outline)',
    title: 'text-primary-text',
    subtitle: 'text-primary-text/80',
    iconColor: 'text-(--success-text) dark:text-(--success-text)',
    type: 'success',
  },
  in_meeting: {
    icon: Clock,
    bg: 'bg-(--surface-2) dark:bg-(--warning-solid) dark:bg-(--warning-solid)',
    border: 'border-(--warning-outline) dark:border-(--warning-outline)',
    title: 'text-primary-text',
    subtitle: 'text-primary-text/80',
    iconColor: 'text-(--warning-text) dark:text-(--warning-text)',
    type: 'warning',
  },
  in_call: {
    icon: Phone,
    bg: 'bg-(--surface-2) dark:bg-(--brand) dark:bg-(--brand)',
    border: 'border-(--brand-outline) dark:border-(--brand-outline)',
    title: 'text-primary-text',
    subtitle: 'text-primary-text/80',
    iconColor: 'text-(--brand-text) dark:text-(--brand-text)',
    type: 'info',
  },
  out_of_office: {
    icon: AlertTriangle,
    bg: 'bg-(--surface-2) dark:bg-(--warning-solid) dark:bg-(--warning-solid)',
    border: 'border-(--warning-outline) dark:border-(--warning-outline)',
    title: 'text-primary-text',
    subtitle: 'text-primary-text/80',
    iconColor: 'text-(--warning-text) dark:text-(--warning-text)',
    type: 'warning',
  },
  busy: {
    icon: Zap,
    bg: 'bg-(--surface-2) dark:bg-(--danger-solid) dark:bg-(--danger-solid)',
    border: 'border-(--danger-outline) dark:border-(--danger-outline)',
    title: 'text-primary-text',
    subtitle: 'text-primary-text/80',
    iconColor: 'text-(--danger-text) dark:text-(--danger-text)',
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
