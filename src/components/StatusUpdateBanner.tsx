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
    bg: 'var(--success-quiet)',
    border: 'border-(--success-outline)',
    title: 'text-(--success-text)',
    subtitle: 'text-(--success-text)',
    iconColor: 'text-(--success-text)',
    type: 'success',
  },
  in_meeting: {
    icon: Clock,
    bg: 'var(--warning-quiet)',
    border: 'border-(--warning-outline)',
    title: 'text-(--warning-text)',
    subtitle: 'text-(--warning-text)',
    iconColor: 'text-(--warning-text)',
    type: 'warning',
  },
  in_call: {
    icon: Phone,
    bg: 'var(--brand-quiet)',
    border: 'border-(--brand-outline)',
    title: 'text-(--brand-text)',
    subtitle: 'text-(--brand-text)',
    iconColor: 'text-(--brand-text)',
    type: 'info',
  },
  out_of_office: {
    icon: AlertTriangle,
    bg: 'var(--warning-quiet)',
    border: 'border-(--warning-outline)',
    title: 'text-(--warning-text)',
    subtitle: 'text-(--warning-text)',
    iconColor: 'text-(--warning-text)',
    type: 'warning',
  },
  busy: {
    icon: Zap,
    bg: 'var(--danger-quiet)',
    border: 'border-(--danger-outline)',
    title: 'text-(--danger-text)',
    subtitle: 'text-(--danger-text)',
    iconColor: 'text-(--danger-text)',
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
    <div className={`w-full ${config.border} border-b`} style={{ background: config.bg }}>
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
