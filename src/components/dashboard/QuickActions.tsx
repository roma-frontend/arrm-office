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
  Zap,
  ArrowUpRight,
  Layers,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthUser } from '@/store/useAuthStore';

interface QuickAction {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  description: string;
  gradientClass: string;
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
        gradientClass: 'quick-action-primary',
      },
      {
        id: 'check-in',
        label: t('quickActions.checkIn'),
        icon: Fingerprint,
        href: '/attendance',
        description: t('quickActions.checkInDesc'),
        gradientClass: 'quick-action-success',
      },
      {
        id: 'chat',
        label: t('quickActions.chat'),
        icon: MessageSquare,
        href: '/chat',
        description: t('quickActions.chatDesc'),
        gradientClass: 'quick-action-chat',
      },
      {
        id: 'tasks',
        label: t('quickActions.tasks'),
        icon: CheckCircle2,
        href: '/tasks',
        description: t('quickActions.tasksDesc'),
        gradientClass: 'quick-action-warning',
      },
    ];

    const managerActions: QuickAction[] = [
      {
        id: 'strategy',
        label: t('quickActions.strategy') || 'Strategy',
        icon: Layers,
        href: '/strategy',
        description: t('quickActions.strategyDesc') || 'OKR cascade',
        gradientClass: 'quick-action-purple',
        role: ['admin', 'supervisor', 'superadmin'],
      },
      {
        id: 'approvals',
        label: t('quickActions.approvals'),
        icon: ShieldCheck,
        href: '/approvals',
        description: t('quickActions.approvalsDesc'),
        gradientClass: 'quick-action-indigo',
        role: ['admin', 'supervisor'],
      },
      {
        id: 'analytics',
        label: t('quickActions.analytics'),
        icon: BarChart3,
        href: '/analytics',
        description: t('quickActions.analyticsDesc'),
        gradientClass: 'quick-action-rose',
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
        gradientClass: 'quick-action-cyan',
        role: ['admin', 'superadmin'],
      },
      {
        id: 'settings',
        label: t('quickActions.settings'),
        icon: Settings2,
        href: '/settings',
        description: t('quickActions.settingsDesc'),
        gradientClass: 'quick-action-slate',
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
      <CardHeader className="pb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-(--primary) to-(--primary-hover) shadow-lg shadow-(--primary)/20">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div className="absolute -inset-1 rounded-xl bg-(--primary)/20 blur-md -z-10" />
            </div>
            <div>
              <CardTitle className="text-lg tracking-tight">{t('quickActions.title')}</CardTitle>
              <p className="text-sm text-(--muted-foreground) mt-0.5">
                {t('quickActions.subtitle') || 'Быстрый доступ к основным функциям'}
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-(--muted-foreground)">
            <kbd className="px-2 py-1 rounded-md bg-(--muted) border border-(--border) font-mono text-[11px]">
              Ctrl
            </kbd>
            <span className="opacity-50">+</span>
            <kbd className="px-2 py-1 rounded-md bg-(--muted) border border-(--border) font-mono text-[11px]">
              K
            </kbd>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <motion.div key={action.id} variants={itemVariants}>
                <button
                  onClick={() => handleAction(action.href)}
                  className={`${action.gradientClass} group relative overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)/50 focus-visible:ring-offset-2 focus-visible:ring-offset-(--card)`}
                >
                  <div className="absolute inset-0 bg-white/0 group-hover:bg-white/10 transition-colors duration-300" />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-1 group-hover:translate-x-0">
                    <ArrowUpRight className="w-3.5 h-3.5 text-white/80" />
                  </div>
                  <div className="relative z-10 flex flex-col items-center justify-center gap-2 py-4 px-3">
                    <div className="p-2 rounded-lg bg-white/15 backdrop-blur-sm group-hover:scale-110 transition-transform duration-300">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-sm font-semibold text-white leading-tight text-center">
                      {action.label}
                    </span>
                    <span className="text-[11px] text-white/70 text-center leading-snug line-clamp-2">
                      {action.description}
                    </span>
                  </div>
                </button>
              </motion.div>
            );
          })}
        </motion.div>
      </CardContent>
    </Card>
  );
}
