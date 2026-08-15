/**
 * Superadmin Hub — the platform operator's control room.
 *
 * The landing screen of the superadmin area. Everything a support engineer
 * needs at a glance lives here: platform health, live activity, growth
 * analytics, and feature toggles. Every other tool (DB browser, sessions,
 * audit, backups, organizations…) is one click away — no hunting through the
 * sidebar for the thing you need in the middle of an incident.
 */

'use client';

import { lazy, Suspense, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  Globe,
  History,
  Monitor,
  ShieldAlert,
  ShieldCheck,
  Table2,
  Ticket,
  ToggleLeft,
  Users,
  Zap,
} from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { TerminalClient } from '@/components/superadmin/TerminalClient';
import { cn } from '@/lib/utils';

// Lazy clients for tools that can be embedded in a sheet. Loaded on demand
// so the hub itself stays light.
const LazyDataBrowser = lazy(() =>
  import('@/components/superadmin/DataBrowserClient').then((m) => ({
    default: m.DataBrowserClient,
  })),
);
const LazySessions = lazy(() =>
  import('@/components/superadmin/SessionsClient').then((m) => ({ default: m.SessionsClient })),
);
const LazyAudit = lazy(() =>
  import('@/components/superadmin/AuditTrailClient').then((m) => ({ default: m.AuditTrailClient })),
);
const LazyImpersonate = lazy(() => import('@/components/superadmin/ImpersonationClient'));
const LazyBulkActions = lazy(() => import('@/components/superadmin/BulkActionsClient'));
const LazyAutomation = lazy(() => import('@/components/automation/AutomationClient'));
// Tools whose UI lives in their page module (no separate client component).
// They carry their own headings, so the sheet just hosts them as-is.
const LazyBackups = lazy(() => import('@/app/(dashboard)/superadmin/backups/page'));
const LazyEmergency = lazy(() => import('@/app/(dashboard)/superadmin/emergency/page'));
const LazyOrganizations = lazy(() => import('@/app/(dashboard)/superadmin/organizations/page'));
const LazySubscriptions = lazy(() => import('@/app/(dashboard)/superadmin/subscriptions/page'));
const LazySecurity = lazy(() => import('@/app/(dashboard)/superadmin/security/page'));
const LazySupport = lazy(() => import('@/app/(dashboard)/superadmin/support/page'));

interface ToolDef {
  href: string;
  icon: typeof Table2;
  key: string;
  /** Lazy client component when the tool can live inside a sheet. */
  client?: React.ComponentType;
}

const TOOL_LINKS: ToolDef[] = [
  {
    href: '/superadmin/database',
    icon: Table2,
    key: 'database',
    client: LazyDataBrowser as React.ComponentType,
  },
  {
    href: '/superadmin/sessions',
    icon: Monitor,
    key: 'sessions',
    client: LazySessions as React.ComponentType,
  },
  {
    href: '/superadmin/audit',
    icon: History,
    key: 'audit',
    client: LazyAudit as React.ComponentType,
  },
  {
    href: '/superadmin/backups',
    icon: Database,
    key: 'backups',
    client: LazyBackups as React.ComponentType,
  },
  {
    href: '/superadmin/impersonate',
    icon: Users,
    key: 'impersonate',
    client: LazyImpersonate as React.ComponentType,
  },
  {
    href: '/superadmin/emergency',
    icon: AlertTriangle,
    key: 'emergency',
    client: LazyEmergency as React.ComponentType,
  },
  {
    href: '/superadmin/organizations',
    icon: Building2,
    key: 'organizations',
    client: LazyOrganizations as React.ComponentType,
  },
  {
    href: '/superadmin/subscriptions',
    icon: FileText,
    key: 'subscriptions',
    client: LazySubscriptions as React.ComponentType,
  },
  {
    href: '/superadmin/bulk-actions',
    icon: Zap,
    key: 'bulkActions',
    client: LazyBulkActions as React.ComponentType,
  },
  {
    href: '/superadmin/security',
    icon: ShieldCheck,
    key: 'security',
    client: LazySecurity as React.ComponentType,
  },
  {
    href: '/superadmin/automation',
    icon: Activity,
    key: 'automation',
    client: LazyAutomation as React.ComponentType,
  },
  {
    href: '/superadmin/support',
    icon: Ticket,
    key: 'support',
    client: LazySupport as React.ComponentType,
  },
];

export function SuperadminHubClient() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  // Toggles follow the org picked in the sidebar selector: with an org selected
  // the rows show (and flip) that org's override, not the global switch.
  const selectedOrgId = useSelectedOrganization();

  const health = useQuery(api.superadmin.hub.getPlatformHealth);
  const activity = useQuery(api.superadmin.hub.getLiveActivity, { limit: 25 });
  const analytics = useQuery(api.superadmin.hub.getPlatformAnalytics);
  const toggles = useQuery(
    api.superadmin.featureToggles.listFeatureToggles,
    selectedOrgId ? { organizationId: selectedOrgId as Id<'organizations'> } : {},
  );

  // Which tool is open in the quick-view sheet.
  const [openTool, setOpenTool] = useState<ToolDef | null>(null);

  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString(i18n.language === 'ru' ? 'ru-RU' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const sparkline = useMemo(() => {
    const buckets = analytics?.growth?.orgBuckets ?? [];
    if (buckets.length === 0) return null;
    const max = Math.max(...buckets, 1);
    return buckets.map((v) => ({
      height: Math.max(2, Math.round((v / max) * 32)),
      value: v,
    }));
  }, [analytics]);

  if (!health || !activity) {
    return (
      <div className="flex items-center justify-center py-24">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="my-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1
              className="mb-1 text-3xl font-bold md:text-4xl"
              style={{ color: 'var(--text-primary)' }}
            >
              {t('superadmin.hub.title', 'Superadmin Hub')}
            </h1>
            <p className="text-muted-foreground">
              {t(
                'superadmin.hub.subtitle',
                'Platform health, live activity and every tool — in one control room',
              )}
            </p>
          </div>
          <Badge
            variant="outline"
            className="flex items-center gap-1.5 border-(--success-outline) bg-(--success-quiet) px-3 py-1.5 text-(--success-text)"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t('superadmin.hub.platformOnline', 'Platform online')}
          </Badge>
        </div>

        {/* Health tiles */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
          <HealthTile
            icon={Building2}
            label={t('superadmin.hub.organizations', 'Organizations')}
            value={health.organizations}
            to="/superadmin/organizations"
          />
          <HealthTile
            icon={Users}
            label={t('superadmin.hub.users', 'Users')}
            value={health.users}
            to="/superadmin/organizations"
          />
          <HealthTile
            icon={FileText}
            label={t('superadmin.hub.subscriptions', 'Subscriptions')}
            value={health.activeSubscriptions}
            to="/superadmin/subscriptions"
          />
          <HealthTile
            icon={ShieldAlert}
            label={t('superadmin.hub.trials', 'Trials expiring')}
            value={health.expiringTrials}
            to="/superadmin/subscriptions"
            alert={health.expiringTrials > 0}
          />
          <HealthTile
            icon={AlertTriangle}
            label={t('superadmin.hub.pendingLeaves', 'Pending leaves')}
            value={health.pendingLeaves}
            to="/superadmin/bulk-actions"
          />
          <HealthTile
            icon={Activity}
            label={t('superadmin.hub.incidents', 'Incidents')}
            value={health.activeIncidents}
            to="/superadmin/emergency"
            alert={health.activeIncidents > 0}
          />
          <HealthTile
            icon={Ticket}
            label={t('superadmin.hub.openTickets', 'Open tickets')}
            value={health.openTickets}
            to="/superadmin/support"
          />
          <HealthTile
            icon={Monitor}
            label={t('superadmin.hub.sessions', 'Active sessions')}
            value={health.sessions ?? '—'}
            to="/superadmin/sessions"
          />
        </div>

        {/* Main grid: analytics + activity + tools + toggles */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Growth analytics */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4 text-(--brand-text)" />
                {t('superadmin.hub.growth', 'Platform growth')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!analytics ? (
                <div className="flex justify-center py-8">
                  <ShieldLoader size="sm" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <StatBox
                      value={analytics.growth.orgsLast30d}
                      label={t('superadmin.hub.orgs30d', 'Orgs last 30d')}
                    />
                    <StatBox
                      value={analytics.growth.usersLast30d}
                      label={t('superadmin.hub.users30d', 'Users last 30d')}
                    />
                    <StatBox
                      value={analytics.engagement.tasksLast7d}
                      label={t('superadmin.hub.tasks7d', 'Tasks last 7d')}
                    />
                  </div>

                  {/* Org growth sparkline */}
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-(--text-muted)">
                      {t('superadmin.hub.orgGrowthChart', 'New organizations per day (30d)')}
                    </p>
                    <div className="flex h-10 items-end gap-[2px]">
                      {sparkline?.map((bar, i) => (
                        <div
                          key={i}
                          title={String(bar.value)}
                          className="flex-1 rounded-t-sm bg-linear-to-t from-(--brand)/30 to-(--brand)"
                          style={{ height: `${bar.height}px` }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Module adoption */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <AdoptionBar
                      label={t('superadmin.hub.tasksAdoption', 'Tasks')}
                      pct={analytics.adoption.tasksPct}
                    />
                    <AdoptionBar
                      label={t('superadmin.hub.leavesAdoption', 'Leave')}
                      pct={analytics.adoption.leavesPct}
                    />
                    <AdoptionBar
                      label={t('superadmin.hub.chatAdoption', 'Chat')}
                      pct={analytics.adoption.chatPct}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tools grid */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-(--brand-text)" />
                {t('superadmin.hub.tools', 'Tools')}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {TOOL_LINKS.map((tool) => {
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.href}
                    type="button"
                    onClick={() => setOpenTool(tool)}
                    title={t('superadmin.hub.openInSheet', 'Open quick view')}
                    className="group flex items-center gap-2 rounded-xl border border-(--border) bg-(--card) px-3 py-2.5 text-xs font-medium text-(--text-secondary) transition-all hover:border-(--brand-outline) hover:text-(--brand-text) hover:shadow-sm"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-(--text-muted) transition-colors group-hover:text-(--brand-text)" />
                    <span className="truncate">{t(`superadmin.hub.tool.${tool.key}`)}</span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Live activity */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-(--brand-text)" />
                  {t('superadmin.hub.liveActivity', 'Live activity')}
                </CardTitle>
                <Link
                  href="/superadmin/audit"
                  className="flex items-center gap-1 text-xs font-medium text-(--brand-text) hover:underline"
                >
                  {t('superadmin.hub.viewAll', 'View all')}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="max-h-[340px] space-y-1.5 overflow-y-auto">
              {activity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-(--background-subtle)"
                >
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-(--brand)" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-(--text-primary)">
                      <span className="font-semibold">{item.userName}</span>
                      <span className="mx-1 text-(--text-muted)">·</span>
                      <code className="font-mono text-[11px] text-(--brand-text)">
                        {item.action}
                      </code>
                    </p>
                    {item.details && (
                      <p className="truncate text-[11px] text-(--text-muted)">{item.details}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] text-(--text-muted)">{formatDate(item.createdAt)}</p>
                    {item.organizationName && (
                      <p className="max-w-[140px] truncate text-[10px] text-(--text-muted)">
                        {item.organizationName}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Feature toggles */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ToggleLeft className="h-4 w-4 text-(--brand-text)" />
                {t('superadmin.hub.featureToggles', 'Feature toggles')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {!toggles ? (
                <div className="flex justify-center py-6">
                  <ShieldLoader size="sm" />
                </div>
              ) : (
                toggles
                  .slice(0, 8)
                  .map((toggle) => <FeatureToggleRow key={toggle.key} toggle={toggle} />)
              )}
              <Link
                href="/superadmin/feature-toggles"
                className="mt-2 flex items-center justify-center gap-1 rounded-lg border border-(--border) px-3 py-2 text-xs font-medium text-(--brand-text) transition-colors hover:bg-(--brand-quiet)"
              >
                {t('superadmin.hub.manageToggles', 'Manage all toggles')}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Operator console — full-width terminal panel */}
        <div className="mt-4 grid grid-cols-1 gap-4">
          <div className="h-[420px]">
            <TerminalClient />
          </div>
        </div>
      </div>

      {/* Tool quick-view sheet — open the tool inline, or jump to its page */}
      <Sheet
        open={openTool !== null}
        onOpenChange={(open) => {
          if (!open) setOpenTool(null);
        }}
      >
        <SheetContent
          side="right"
          size="xl"
          closeLabel={t('common.close', 'Close')}
          className="p-0"
        >
          {openTool && (
            <>
              <SheetHeader className="flex flex-col items-start gap-3 border-b border-(--border) px-5 py-4">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <openTool.icon className="h-4 w-4 text-(--brand-text)" />
                  {t(`superadmin.hub.tool.${openTool.key}`)}
                </SheetTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex shrink-0 items-center gap-1.5"
                  onClick={() => {
                    const href = openTool.href;
                    setOpenTool(null);
                    router.push(href);
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('superadmin.hub.openFullPage', 'Open full page')}
                </Button>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 !pt-0">
                <Suspense
                  fallback={
                    <div className="flex justify-center py-24">
                      <ShieldLoader size="md" />
                    </div>
                  }
                >
                  {(() => {
                    const ToolClient = openTool.client as React.ComponentType;
                    return <ToolClient />;
                  })()}
                </Suspense>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function HealthTile({
  icon: Icon,
  label,
  value,
  to,
  alert,
}: {
  icon: typeof Building2;
  label: string;
  value: number | string;
  to: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={to}
      className={cn(
        'group flex flex-col gap-1 rounded-2xl border border-(--border) bg-(--card) p-3 transition-all hover:border-(--brand-outline) hover:shadow-sm',
        alert && 'border-(--warning-outline)',
      )}
    >
      <div className="flex items-center justify-between">
        <Icon
          className={cn(
            'h-4 w-4',
            alert ? 'text-(--warning-text)' : 'text-(--text-muted) group-hover:text-(--brand-text)',
          )}
        />
        {alert && <span className="size-2 rounded-full bg-(--warning-solid) animate-pulse" />}
      </div>
      <p className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="truncate text-[10px] leading-tight text-(--text-muted)">{label}</p>
    </Link>
  );
}

function StatBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border border-(--border) bg-(--background-subtle) p-3 text-center">
      <p className="text-2xl font-bold text-(--brand-text)">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-[11px] text-(--text-muted)">{label}</p>
    </div>
  );
}

function AdoptionBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-(--text-secondary)">{label}</span>
        <span className="font-semibold text-(--brand-text)">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-(--background-subtle)">
        <div
          className="h-full rounded-full bg-linear-to-r from-(--brand)/60 to-(--brand)"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FeatureToggleRow({
  toggle,
}: {
  toggle: {
    key: string;
    labelKey: string;
    enabled: boolean;
    isOverridden: boolean;
    orgOverrideCount: number;
  };
}) {
  const { t } = useTranslation();
  const selectedOrgId = useSelectedOrganization();
  const setFeatureToggle = useMutation(api.superadmin.featureToggles.setFeatureToggle);
  const setOrgOverride = useMutation(api.superadmin.featureToggles.setOrgFeatureOverride);
  const [busy, setBusy] = useState(false);

  const handleToggle = async () => {
    setBusy(true);
    try {
      if (selectedOrgId) {
        // Org-scoped — flip only the selected organization's override.
        await setOrgOverride({
          key: toggle.key,
          organizationId: selectedOrgId as Id<'organizations'>,
          enabled: !toggle.enabled,
        });
      } else {
        await setFeatureToggle({ key: toggle.key, enabled: !toggle.enabled });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the toggle');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-(--text-primary)">
          <span>{t(toggle.labelKey, toggle.key)}</span>
          {toggle.isOverridden && (
            <Badge variant="outline" className="ml-1.5 text-[9px]">
              {t('superadmin.hub.overridden', 'overridden')}
            </Badge>
          )}
        </p>
        {toggle.orgOverrideCount > 0 && (
          <p className="text-[10px] text-(--text-muted)">
            {t('superadmin.hub.orgOverrides', '{{count}} org overrides', {
              count: toggle.orgOverrideCount,
            })}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={handleToggle}
        aria-label={toggle.key}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50',
          toggle.enabled ? 'bg-(--brand)' : 'bg-(--text-muted)/30',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 size-4 rounded-full bg-white shadow transition-all',
            toggle.enabled ? 'left-[18px]' : 'left-0.5',
          )}
        />
      </button>
    </div>
  );
}

export default SuperadminHubClient;
