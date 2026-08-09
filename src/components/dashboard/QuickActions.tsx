/**
 * Quick Actions — Быстрые действия для Dashboard
 *
 * Позволяет сотрудникам выполнять частые действия в 1 клик
 * Адаптируется под роль пользователя
 */

'use client';

import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { motion } from '@/lib/cssMotion';
import type { LucideIcon } from 'lucide-react';
import {
  Plane,
  Fingerprint,
  MessageSquare,
  CheckCircle2,
  ShieldCheck,
  BarChart3,
  Users,
  Settings2,
  ArrowUpRight,
  Layers,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { SectionHeader } from '@/components/dashboard/SectionHeader';
import { useAuthUser } from '@/store/useAuthStore';

interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  description: string;
  /** Colour that marks the action; the surface stays neutral. */
  accent: string;
  role?: string[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.15 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
  },
};

export function QuickActions() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthUser();

  const actions = useMemo<QuickAction[]>(() => {
    const commonActions: QuickAction[] = [
      {
        id: 'leave-request',
        label: t('quickActions.leaveRequest'),
        icon: Plane,
        href: '/leaves',
        description: t('quickActions.leaveRequestDesc'),
        accent: '#2563eb',
      },
      {
        id: 'check-in',
        label: t('quickActions.checkIn'),
        icon: Fingerprint,
        href: '/attendance',
        description: t('quickActions.checkInDesc'),
        accent: '#10b981',
      },
      {
        id: 'chat',
        label: t('quickActions.chat'),
        icon: MessageSquare,
        href: '/chat',
        description: t('quickActions.chatDesc'),
        accent: '#8b5cf6',
      },
      {
        id: 'tasks',
        label: t('quickActions.tasks'),
        icon: CheckCircle2,
        href: '/tasks',
        description: t('quickActions.tasksDesc'),
        accent: '#f59e0b',
      },
    ];

    const managerActions: QuickAction[] = [
      {
        id: 'strategy',
        label: t('quickActions.strategy') || 'Strategy',
        icon: Layers,
        href: '/strategy',
        description: t('quickActions.strategyDesc') || 'OKR cascade',
        accent: '#a855f7',
        role: ['admin', 'supervisor', 'superadmin'],
      },
      {
        id: 'approvals',
        label: t('quickActions.approvals'),
        icon: ShieldCheck,
        href: '/approvals',
        description: t('quickActions.approvalsDesc'),
        accent: '#6366f1',
        role: ['admin', 'supervisor'],
      },
      {
        id: 'analytics',
        label: t('quickActions.analytics'),
        icon: BarChart3,
        href: '/analytics',
        description: t('quickActions.analyticsDesc'),
        accent: '#f43f5e',
        role: ['admin', 'supervisor'],
      },
    ];

    const adminActions: QuickAction[] = [
      {
        id: 'employees',
        label: t('quickActions.employees'),
        icon: Users,
        href: '/employees',
        description: t('quickActions.employeesDesc'),
        accent: '#06b6d4',
        role: ['admin', 'superadmin'],
      },
      {
        id: 'settings',
        label: t('quickActions.settings'),
        icon: Settings2,
        href: '/settings',
        description: t('quickActions.settingsDesc'),
        accent: '#64748b',
        role: ['admin', 'superadmin'],
      },
    ];

    return [
      ...commonActions,
      ...(user?.role === 'admin' || user?.role === 'supervisor' || user?.role === 'superadmin'
        ? managerActions
        : []),
      ...(user?.role === 'admin' || user?.role === 'superadmin' ? adminActions : []),
    ];
  }, [user?.role, t]);

  const handleAction = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  return (
    <Card className="border-(--border) overflow-hidden bg-(--card)">
      <SectionHeader
        title={t('quickActions.title')}
        aside={
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-(--muted-foreground) ml-auto">
            <kbd className="px-1.5 py-0.5 rounded-md bg-(--muted) border border-(--border) font-mono text-[11px]">
              Ctrl
            </kbd>
            <span className="opacity-50">+</span>
            <kbd className="px-1.5 py-0.5 rounded-md bg-(--muted) border border-(--border) font-mono text-[11px]">
              K
            </kbd>
          </div>
        }
      />
      <CardContent className="px-4 sm:px-5 pb-4">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3"
        >
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <motion.div key={action.id} variants={itemVariants}>
                {/* Eight saturated gradient tiles shouted over the whole page and
                    over each other. The surface is the card, the colour marks the
                    action, and the label is finally legible on it. */}
                <button
                  onClick={() => handleAction(action.href)}
                  className="group w-full h-full text-left rounded-xl border border-(--border) bg-(--card) p-3 transition-all duration-200 hover:border-(--primary)/30 hover:shadow-md hover:-translate-y-0.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)/40 focus-visible:ring-offset-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: `color-mix(in srgb, ${action.accent} 12%, transparent)`,
                        color: action.accent,
                      }}
                    >
                      <Icon className="w-[18px] h-[18px]" />
                    </span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-(--text-muted) opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-(--text-primary) leading-tight">
                    {action.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-(--text-muted) leading-snug line-clamp-2">
                    {action.description}
                  </p>
                </button>
              </motion.div>
            );
          })}
        </motion.div>
      </CardContent>
    </Card>
  );
}
