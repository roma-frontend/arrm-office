'use client';

import React from 'react';
import { motion } from '@/lib/cssMotion';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldAlert, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface SecurityStats {
  total: number;
  failed: number;
  blocked: number;
  highRisk: number;
  byMethod: Record<string, number>;
  suspicious: Array<{
    _id: string;
    _creationTime: number;
    createdAt: number;
    userId?: string;
    email?: string;
    method: string;
    success: boolean;
    riskScore?: number;
    blockedReason?: string;
    ip?: string;
    userAgent?: string;
  }>;
}

interface SecurityWidgetProps {
  securityStats: SecurityStats | undefined;
}

/**
 * Security Center — a compact status strip on the dashboard.
 *
 * One row: shield icon, threat level badge, and a path to the full
 * /superadmin/security center where the login counts and alerts live.
 * The dashboard shows the state; the detail page shows the numbers.
 */
export function SecurityWidget({ securityStats }: SecurityWidgetProps) {
  const { t } = useTranslation();
  const highRisk = securityStats?.highRisk ?? 0;
  const failed = securityStats?.failed ?? 0;

  const threat =
    highRisk >= 10
      ? {
          label: t('landingExtra.securityCritical'),
          bg: 'color-mix(in srgb, var(--destructive) 12%, transparent)',
          color: 'var(--destructive)',
          icon: ShieldAlert,
        }
      : highRisk >= 3
        ? {
            label: t('landingExtra.securityElevated'),
            bg: 'color-mix(in srgb, var(--warning) 12%, transparent)',
            color: 'var(--warning)',
            icon: ShieldAlert,
          }
        : {
            label:
              failed >= 20 ? t('landingExtra.securityModerate') : t('landingExtra.securityNormal'),
            bg: 'color-mix(in srgb, var(--success) 12%, transparent)',
            color: 'var(--success)',
            icon: ShieldCheck,
          };

  const Icon = threat.icon;

  return (
    <motion.div variants={itemVariants}>
      <Link href="/superadmin/security" className="group block">
        <div className="flex items-center gap-3 rounded-xl border border-(--border) px-4 py-2.5 transition-all duration-200 group-hover:border-(--primary)/35 group-hover:shadow-md">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: threat.bg, color: threat.color }}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 text-sm font-semibold text-(--text-primary)">
            {t('landingExtra.securityCenter')}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: threat.bg, color: threat.color }}
          >
            {threat.label}
          </span>
          <ChevronRight
            className="size-4 shrink-0 text-(--text-muted) transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
      </Link>
    </motion.div>
  );
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};
