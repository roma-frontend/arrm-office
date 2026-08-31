'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { useQuery } from '@/lib/convex-typed';
import { api } from '../../../../../convex/_generated/api';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { useAuthUser } from '@/store/useAuthStore';
import type { Id } from '../../../../../convex/_generated/dataModel';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  Building2,
  CalendarCheck,
  Sun,
  Wallet,
  Clock,
  Globe,
  ShieldCheck,
  ScrollText,
  Palette,
  Bot,
  DoorOpen,
  Link2,
  Users,
  ChevronRight,
  Settings,
  CreditCard,
  ClipboardCheck,
  Sparkles,
} from 'lucide-react';

type PortalCard = {
  href: string;
  titleKey: string;
  fallbackTitle: string;
  descKey: string;
  fallbackDesc: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  /** Roles allowed to see this card. undefined = all. */
  roles?: string[];
};

const PORTAL_CARDS: PortalCard[] = [
  {
    href: '/admin/leave-settings',
    titleKey: 'companyPortal.leaveSettings',
    fallbackTitle: 'Leave Settings',
    descKey: 'companyPortal.leaveSettingsDesc',
    fallbackDesc: 'Configure leave types, approval workflows, and default days',
    icon: CalendarCheck,
    color: '#2563eb',
    bgColor: 'rgba(37,99,235,0.08)',
    roles: ['superadmin', 'admin'],
  },
  {
    href: '/admin/holidays',
    titleKey: 'companyPortal.holidays',
    fallbackTitle: 'Holidays',
    descKey: 'companyPortal.holidaysDesc',
    fallbackDesc: 'Manage public holidays and internal non-working days',
    icon: Sun,
    color: '#f59e0b',
    bgColor: 'rgba(245,158,11,0.08)',
    roles: ['superadmin', 'admin'],
  },
  {
    href: '/admin/leave-balances',
    titleKey: 'companyPortal.leaveBalances',
    fallbackTitle: 'Leave Balances',
    descKey: 'companyPortal.leaveBalancesDesc',
    fallbackDesc: 'View and adjust employee leave balances',
    icon: Wallet,
    color: '#10b981',
    bgColor: 'rgba(16,185,129,0.08)',
    roles: ['superadmin', 'admin'],
  },
  {
    href: '/admin/overtime-settings',
    titleKey: 'companyPortal.overtimeSettings',
    fallbackTitle: 'Overtime Settings',
    descKey: 'companyPortal.overtimeSettingsDesc',
    fallbackDesc: 'Set overtime limits, payment types, and approval rules',
    icon: Clock,
    color: '#8b5cf6',
    bgColor: 'rgba(139,92,246,0.08)',
    roles: ['superadmin', 'admin'],
  },
  {
    href: '/admin/integrations',
    titleKey: 'companyPortal.integrations',
    fallbackTitle: 'Integrations',
    descKey: 'companyPortal.integrationsDesc',
    fallbackDesc: 'Connect third-party services and sync data',
    icon: Link2,
    color: '#06b6d4',
    bgColor: 'rgba(6,182,212,0.08)',
    roles: ['superadmin', 'admin'],
  },
  {
    href: '/settings',
    titleKey: 'companyPortal.branding',
    fallbackTitle: 'Branding & White-Label',
    descKey: 'companyPortal.brandingDesc',
    fallbackDesc: 'Customize colors, fonts, logo, and white-label settings',
    icon: Palette,
    color: '#ec4899',
    bgColor: 'rgba(236,72,153,0.08)',
    roles: ['superadmin', 'admin'],
  },
  {
    href: '/settings',
    titleKey: 'companyPortal.aiGovernance',
    fallbackTitle: 'AI Governance',
    descKey: 'companyPortal.aiGovernanceDesc',
    fallbackDesc: 'Configure AI agent guardrails and oversight policies',
    icon: Bot,
    color: '#f97316',
    bgColor: 'rgba(249,115,22,0.08)',
    roles: ['superadmin', 'admin'],
  },
  {
    href: '/settings',
    titleKey: 'companyPortal.meetingRooms',
    fallbackTitle: 'Meeting Rooms',
    descKey: 'companyPortal.meetingRoomsDesc',
    fallbackDesc: 'Set reminder lead times and room availability',
    icon: DoorOpen,
    color: '#14b8a6',
    bgColor: 'rgba(20,184,166,0.08)',
    roles: ['superadmin', 'admin'],
  },
  {
    href: '/compliance',
    titleKey: 'companyPortal.compliance',
    fallbackTitle: 'Compliance',
    descKey: 'companyPortal.complianceDesc',
    fallbackDesc: 'Track policy compliance and regulatory requirements',
    icon: ClipboardCheck,
    color: '#ef4444',
    bgColor: 'rgba(239,68,68,0.08)',
    roles: ['superadmin', 'admin'],
  },
  {
    href: '/audit',
    titleKey: 'companyPortal.auditLog',
    fallbackTitle: 'Audit Log',
    descKey: 'companyPortal.auditLogDesc',
    fallbackDesc: 'Review all admin actions and system changes',
    icon: ScrollText,
    color: '#64748b',
    bgColor: 'rgba(100,116,139,0.08)',
    roles: ['superadmin', 'admin'],
  },
  {
    href: '/settings',
    titleKey: 'companyPortal.settings',
    fallbackTitle: 'General Settings',
    descKey: 'companyPortal.settingsDesc',
    fallbackDesc: 'Productivity, notifications, security, and appearance',
    icon: Settings,
    color: '#6366f1',
    bgColor: 'rgba(99,102,241,0.08)',
  },
  {
    href: '/employees/departments',
    titleKey: 'companyPortal.departments',
    fallbackTitle: 'Departments & Positions',
    descKey: 'companyPortal.departmentsDesc',
    fallbackDesc: 'Manage organizational structure and job positions',
    icon: Users,
    color: '#0ea5e9',
    bgColor: 'rgba(14,165,233,0.08)',
    roles: ['superadmin', 'admin', 'supervisor'],
  },
  {
    href: '/payroll',
    titleKey: 'companyPortal.payroll',
    fallbackTitle: 'Payroll & Compensation',
    descKey: 'companyPortal.payrollDesc',
    fallbackDesc: 'Manage payroll cycles, salary bands, and compensation',
    icon: CreditCard,
    color: '#a855f7',
    bgColor: 'rgba(168,85,247,0.08)',
    roles: ['superadmin', 'admin'],
  },
  {
    href: '/superadmin/feature-toggles',
    titleKey: 'companyPortal.featureToggles',
    fallbackTitle: 'Feature Toggles',
    descKey: 'companyPortal.featureTogglesDesc',
    fallbackDesc: 'Enable or disable platform features per organization',
    icon: Sparkles,
    color: '#eab308',
    bgColor: 'rgba(234,179,8,0.08)',
    roles: ['superadmin'],
  },
];

export default function CompanyPortalPage() {
  const { t } = useTranslation();
  const user = useAuthUser();
  const organizationId = useSelectedOrganization() as Id<'organizations'> | undefined;

  const org = useQuery(
    api.organizations.getMyOrganization,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  const leaveConfigs = useQuery(
    api.leaveSettings.getLeaveTypeConfigs,
    organizationId ? { organizationId } : 'skip',
  );

  const holidays = useQuery(
    api.leaveSettings.getHolidays,
    organizationId ? { organizationId } : 'skip',
  );

  if (!organizationId || !user) return <ShieldLoader />;

  const userRole = user.role ?? 'employee';

  const activeLeaveTypes = leaveConfigs?.filter((c) => c.isActive).length ?? 0;
  const totalLeaveTypes = leaveConfigs?.length ?? 0;
  const totalHolidays = holidays?.length ?? 0;

  const visibleCards = PORTAL_CARDS.filter(
    (card) => !card.roles || card.roles.includes(userRole),
  );

  const stats = [
    {
      label: t('companyPortal.statLeaveTypes', 'Leave Types'),
      value: `${activeLeaveTypes}/${totalLeaveTypes}`,
      color: '#2563eb',
    },
    {
      label: t('companyPortal.statHolidays', 'Holidays'),
      value: totalHolidays,
      color: '#f59e0b',
    },
    {
      label: t('companyPortal.statPlan', 'Plan'),
      value: org?.plan ? org.plan.charAt(0).toUpperCase() + org.plan.slice(1) : '—',
      color: '#8b5cf6',
    },
    {
      label: t('companyPortal.statStatus', 'Status'),
      value: org?.isActive ? '✓' : '✗',
      color: org?.isActive ? '#10b981' : '#ef4444',
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* ── Sticky Header ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-(--brand)/10 border border-(--brand-outline)">
              <Building2 className="w-6 h-6 text-(--brand-text)" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-(--text-primary)">
                {t('companyPortal.title', 'Company Portal')}
              </h1>
              <p className="text-sm text-(--text-muted) mt-0.5">
                {org?.name ?? t('companyPortal.subtitle', 'All organization settings in one place')}
              </p>
            </div>
          </div>
          {org && (
            <Badge variant="outline" className="text-xs shrink-0 mt-1">
              {org.plan?.charAt(0).toUpperCase()}{org.plan?.slice(1)}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Quick Stats ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="border border-(--border) bg-(--card)">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-(--text-muted) mb-1">{stat.label}</p>
              <p className="text-xl font-bold" style={{ color: stat.color }}>
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Portal Cards Grid ─────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-(--text-primary) mb-3">
          {t('companyPortal.quickAccess', 'Quick Access')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleCards.map((card) => {
            const Icon = card.icon as React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
            return (
              <Link key={card.href + card.titleKey} href={card.href} className="group">
                <Card className="h-full border border-(--border) bg-(--card) hover:border-(--brand-outline) hover:shadow-md transition-all duration-200 cursor-pointer">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div
                      className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: card.bgColor }}
                    >
                      <Icon className="w-5 h-5" style={{ color: card.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-semibold text-(--text-primary) group-hover:text-(--brand-text) transition-colors truncate">
                          {t(card.titleKey, card.fallbackTitle)}
                        </h3>
                        <ChevronRight className="w-3.5 h-3.5 text-(--text-muted) group-hover:text-(--brand-text) transition-colors shrink-0 opacity-0 group-hover:opacity-100" />
                      </div>
                      <p className="text-xs text-(--text-muted) mt-0.5 line-clamp-2">
                        {t(card.descKey, card.fallbackDesc)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Org Info Footer ─────────────────────────────────────── */}
      {org && (
        <Card className="border border-(--border) bg-(--card)">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-(--text-primary) mb-3">
              {t('companyPortal.orgInfo', 'Organization Info')}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {[
                { label: t('companyPortal.orgName', 'Name'), value: org.name },
                { label: t('companyPortal.orgSlug', 'Slug'), value: org.slug },
                {
                  label: t('companyPortal.orgCountry', 'Country'),
                  value: org.country || '—',
                },
                {
                  label: t('companyPortal.orgTimezone', 'Timezone'),
                  value: org.timezone || '—',
                },
                {
                  label: t('companyPortal.orgCurrency', 'Currency'),
                  value: org.currency || '—',
                },
                {
                  label: t('companyPortal.orgIndustry', 'Industry'),
                  value: org.industry || '—',
                },
                {
                  label: t('companyPortal.orgLimit', 'Employee Limit'),
                  value: org.employeeLimit?.toString() ?? '—',
                },
                {
                  label: t('companyPortal.orgPayroll', 'Payroll Cycle'),
                  value: org.payrollCycle || '—',
                },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-(--text-muted)">{label}</p>
                  <p className="font-medium text-(--text-primary) truncate">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
