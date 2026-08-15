'use client';

import React, { useEffect, useState } from 'react';
import { useNow } from '@/hooks/useNow';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useTranslation } from 'react-i18next';
import { Clock, X } from 'lucide-react';

export function MaintenanceBanner() {
  const { user } = useAuthStore();
  const { t, i18n } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const [countdown, setCountdown] = useState('');

  const organizationId = user?.organizationId;

  const maintenance = useQuery(
    api.admin.getMaintenanceMode,
    organizationId ? { organizationId: organizationId as Id<'organizations'> } : 'skip',
  );
  const now = useNow();

  // Countdown timer
  useEffect(() => {
    if (!maintenance?.isActive) return;

    const tick = () => {
      const now = Date.now();
      const startTime = maintenance.startTime;

      // If maintenance hasn't started yet — countdown to start
      if (now < startTime) {
        const remaining = startTime - now;
        setCountdown(formatRemaining(remaining));
        return;
      }

      // If maintenance is active — countdown to end
      const endTime =
        maintenance.endTime ||
        startTime +
          (maintenance.estimatedDuration ? parseDuration(maintenance.estimatedDuration) : 3600000);

      if (now >= endTime) {
        setCountdown('');
        return;
      }

      const remaining = endTime - now;
      setCountdown(formatRemaining(remaining));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [
    maintenance?.isActive,
    maintenance?.startTime,
    maintenance?.endTime,
    maintenance?.estimatedDuration,
  ]);

  // Don't show if no maintenance, dismissed, or user is superadmin (they manage it)
  if (!maintenance?.isActive || dismissed) return null;

  const hasStarted = now >= maintenance.startTime;

  // If already started and user is not superadmin — MaintenanceScreen handles it
  if (hasStarted && user?.role !== 'superadmin') return null;

  const icon = maintenance.icon || '🔧';
  const title = maintenance.title || t('maintenance.title');

  // Build localized message
  const status = hasStarted
    ? t('maintenance.bannerInProgress')
    : countdown
      ? t('maintenance.bannerStartsIn', { time: countdown })
      : t('maintenance.bannerStartsSoon');

  const message = `${icon} ${title} — ${status}`;
  const detail = maintenance.message || '';

  // Locale-aware date formatting
  const locale = i18n.language === 'hy' ? 'hy-AM' : i18n.language === 'ru' ? 'ru-RU' : 'en-US';
  const startFormatted = new Date(maintenance.startTime).toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="w-full animate-in fade-in duration-300">
      <div
        className="border-b"
        style={{
          backgroundColor: 'var(--maintenance-banner-bg, #fef3c7)',
          borderColor: 'var(--maintenance-banner-border, #fde68a)',
        }}
      >
        <div className="max-w-400 mx-auto px-3 sm:px-4 py-2.5 flex items-center gap-3">
          {/* Content */}
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-semibold truncate"
              style={{ color: 'var(--maintenance-banner-text, var(--warning-text))' }}
            >
              {message}
            </p>
            <div
              className="flex items-center gap-3 text-xs mt-0.5"
              style={{ color: 'var(--maintenance-banner-text-secondary, var(--warning-solid))' }}
            >
              {detail && <span className="truncate">{detail}</span>}
              <span className="flex items-center gap-1 shrink-0">
                <Clock className="w-3 h-3" />
                {startFormatted}
              </span>
              {maintenance.estimatedDuration && (
                <span className="shrink-0">~ {maintenance.estimatedDuration}</span>
              )}
            </div>
          </div>

          {/* Countdown badge */}
          {countdown && (
            <div
              className="shrink-0 px-2.5 py-1 rounded-full border"
              style={{
                backgroundColor: 'var(--maintenance-badge-bg, #fde68a)',
                borderColor: 'var(--maintenance-badge-border, #f59e0b)',
              }}
            >
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color: 'var(--maintenance-banner-text, var(--warning-text))' }}
              >
                {countdown}
              </span>
            </div>
          )}

          {/* Dismiss */}
          <button
            onClick={() => setDismissed(true)}
            className="shrink-0 p-1 rounded-full transition-colors"
            style={{
              backgroundColor: 'transparent',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
            aria-label="Dismiss maintenance notice"
          >
            <X
              className="w-4 h-4"
              style={{ color: 'var(--maintenance-banner-text, var(--warning-text))' }}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRemaining(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function parseDuration(duration: string): number {
  const match = duration.match(/(\d+)/);
  const amount = match ? parseInt(match[1] || '1') : 1;
  if (duration.includes('hour') || duration.includes('час')) return amount * 3600000;
  if (duration.includes('minute') || duration.includes('мин')) return amount * 60000;
  return amount * 3600000;
}
