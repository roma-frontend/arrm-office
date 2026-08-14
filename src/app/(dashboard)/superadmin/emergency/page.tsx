'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { Id } from '@/convex/_generated/dataModel';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Clock,
  Shield,
  Activity,
  Users,
  Building2,
  AlertOctagon,
  RefreshCw,
  Plus,
  X,
} from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetBody,
} from '@/components/ui/sheet';
import { toast } from 'sonner';
import { CreateIncidentWizard } from '@/components/superadmin/CreateIncidentWizard';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { PromptDialog } from '@/components/ui/prompt-dialog';
import { logger } from '@/lib/logger';

interface Ticket {
  _id: string;
  _creationTime: number;
  ticketNumber: string;
  title: string;
  status: string;
  creatorName: string;
  organizationName: string | null;
  minutesOpen: number;
}

interface Incident {
  _id: Id<'emergencyIncidents'>;
  _creationTime: number;
  organizationId?: Id<'organizations'>;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  affectedUsers: number;
  affectedOrgs: number;
  rootCause?: string;
  resolution?: string;
  startedAt: number;
  resolvedAt?: number;
  createdBy: Id<'users'>;
  createdAt: number;
  updatedAt: number;
  // Enriched fields from map()
  creatorName: string;
  minutesActive: number;
}

interface SuspiciousIP {
  ip: string;
  attempts: number;
  userIds: string[];
}

export default function EmergencyDashboardPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const [createIncidentOpen, setCreateIncidentOpen] = useState(false);
  const [resolvingIncidentId, setResolvingIncidentId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const data = useQuery(api.superadmin.getEmergencyDashboard);
  const updateIncidentStatus = useMutation(api.superadmin.updateIncidentStatus);

  // Force refresh by toggling loading state
  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Convex automatically refreshes, but we can show loading state
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsRefreshing(false);
  };

  if (!data || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  const {
    criticalTickets,
    activeIncidents,
    slaBreaches,
    suspiciousIPs,
    maintenanceModeOrgs,
    pendingOrgRequests,
    priorityLevel,
    priorityScore,
    issues,
    requiresAttention,
  } = data;

  const getPriorityColor = (level: string) => {
    switch (level) {
      case 'critical':
        return 'text-red-500 bg-red-500/10 border-red-500/30';
      case 'high':
        return 'text-orange-500 bg-orange-500/10 border-orange-500/30';
      case 'medium':
        return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30';
      default:
        return 'text-green-500 bg-green-500/10 border-green-500/30';
    }
  };

  /**
   * Resolving an incident needs both a root cause and a resolution. They used to
   * be asked for through two native prompts in a row, which meant the root cause
   * was already typed and then thrown away if the second prompt was dismissed.
   * One form now collects both, or neither.
   */
  const handleResolveIncident = async (values: Record<string, string>) => {
    if (!resolvingIncidentId) return;

    try {
      await updateIncidentStatus({
        incidentId: resolvingIncidentId as Id<'emergencyIncidents'>,
        status: 'resolved',
        userId: user.id as Id<'users'>,
        rootCause: values.rootCause ?? '',
        resolution: values.resolution ?? '',
      });

      toast.success(t('superadmin.emergency.alerts.incidentResolved'));
      setResolvingIncidentId(null);
    } catch (error) {
      toast.error(t('superadmin.emergency.alerts.errorResolvingIncident'));
      logger.error(error);
      // Rethrow so the form stays open with both answers intact.
      throw error;
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen" style={{ background: 'var(--background)' }}>
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-4 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                  <h1
                    className="text-2xl sm:text-3xl font-bold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {t('superadmin.emergency.title')}
                  </h1>
                  <Badge
                    className={`${getPriorityColor(priorityLevel)} text-sm sm:text-base px-3 sm:px-4 py-1`}
                  >
                    {priorityLevel === 'critical' && '🔴'}
                    {priorityLevel === 'high' && '🟠'}
                    {priorityLevel === 'medium' && '🟡'}
                    {priorityLevel === 'low' && '🟢'}{' '}
                    <span className="hidden sm:inline">{priorityLevel.toUpperCase()}</span>
                    <span className="sm:hidden">
                      {priorityLevel === 'critical'
                        ? 'CRIT'
                        : priorityLevel === 'high'
                          ? 'HIGH'
                          : priorityLevel === 'medium'
                            ? 'MED'
                            : 'LOW'}
                    </span>
                  </Badge>
                </div>
                <p className="text-muted-foreground text-sm sm:text-base">
                  {t('superadmin.emergency.subtitle')}
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto flex-col sm:flex-row">
                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="text-(--foreground) w-full sm:w-auto"
                >
                  {isRefreshing ? (
                    <ShieldLoader size="xs" variant="inline" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
                <Button
                  onClick={() => setCreateIncidentOpen(true)}
                  className="gap-2 bg-(--primary) hover:bg-(--primary-hover) text-white w-full sm:w-auto"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {t('superadmin.emergency.createIncident')}
                  </span>
                  <span className="sm:hidden">Create</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Priority Score */}
          {requiresAttention && (
            <Card
              className="mb-6 border-red-500/50 animate-pulse"
              style={{ background: 'var(--card)' }}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <AlertOctagon className="w-12 h-12 text-red-500" />
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-red-500 mb-1">
                      {t('superadmin.emergency.attentionRequired')}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t('superadmin.emergency.problemsDetected', { problems: issues.join(', ') })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-bold text-red-500">{priorityScore}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('superadmin.emergency.priorityScore')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            <StatCard
              title={t('superadmin.emergency.criticalTickets')}
              value={criticalTickets.length}
              icon={AlertTriangle}
              color="red"
              subtitle={t('superadmin.emergency.criticalTicketsSubtitle')}
            />
            <StatCard
              title={t('superadmin.emergency.activeIncidents')}
              value={activeIncidents.length}
              icon={Activity}
              color="orange"
              subtitle={t('superadmin.emergency.activeIncidentsSubtitle')}
            />
            <StatCard
              title={t('superadmin.emergency.slaBreaches')}
              value={slaBreaches}
              icon={Clock}
              color="yellow"
              subtitle={t('superadmin.emergency.slaBreachesSubtitle')}
            />
            <StatCard
              title={t('superadmin.emergency.suspiciousIPs')}
              value={suspiciousIPs.length}
              icon={Shield}
              color="purple"
              subtitle={t('superadmin.emergency.suspiciousIPsSubtitle')}
            />
            <StatCard
              title={t('superadmin.emergency.maintenanceMode')}
              value={maintenanceModeOrgs}
              icon={Building2}
              color="blue"
              subtitle={t('superadmin.emergency.maintenanceModeSubtitle')}
            />
            <StatCard
              title={t('superadmin.emergency.pendingOrgs')}
              value={pendingOrgRequests}
              icon={Users}
              color="green"
              subtitle={t('superadmin.emergency.pendingOrgsSubtitle')}
            />
          </div>

          {/* Critical Tickets */}
          {criticalTickets.length > 0 && (
            <Card className="mb-6 border-red-500/50" style={{ background: 'var(--card)' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-500">
                  <AlertTriangle className="w-5 h-5" />
                  {t('superadmin.emergency.criticalTickets')}
                </CardTitle>
                <CardDescription>
                  {t('superadmin.emergency.criticalTicketsSubtitle')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {criticalTickets.map((ticket: Ticket) => (
                    <div
                      key={ticket._id}
                      className="p-3 sm:p-4 rounded-lg border border-red-500/30 bg-red-500/5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="font-mono text-xs sm:text-sm">
                              {ticket.ticketNumber}
                            </span>
                            <Badge
                              variant="default"
                              className="bg-(--danger-solid) hover:opacity-90 text-white shadow-sm text-xs"
                            >
                              CRITICAL
                            </Badge>
                            <Badge
                              variant="outline"
                              className="border-(--border) bg-(--background) text-(--foreground) text-xs"
                            >
                              {ticket.status}
                            </Badge>
                          </div>
                          <p
                            className="font-semibold text-sm sm:text-base mb-2"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {ticket.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>👤 {ticket.creatorName}</span>
                            {ticket.organizationName && <span>🏢 {ticket.organizationName}</span>}
                            <span>
                              ⏱️ {ticket.minutesOpen} {t('common.minutesAgo')}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/superadmin/support?ticket=${ticket._id}`)}
                          className="border-(--border) bg-(--background) hover:bg-(--background-subtle) text-(--foreground) shrink-0 self-start"
                        >
                          {t('superadmin.emergency.actions.open')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Active Incidents */}
          {activeIncidents.length > 0 && (
            <Card className="mb-6 border-orange-500/50" style={{ background: 'var(--card)' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-500">
                  <Activity className="w-5 h-5" />
                  {t('superadmin.emergency.activeIncidents')}
                </CardTitle>
                <CardDescription>{t('superadmin.emergency.activeIncidentsDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {activeIncidents.map((incident: Incident) => (
                    <div
                      key={incident._id}
                      className="p-3 sm:p-4 rounded-lg border border-orange-500/30 bg-orange-500/5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <Badge
                              variant={
                                incident.severity === 'critical'
                                  ? 'destructive'
                                  : incident.severity === 'high'
                                    ? 'default'
                                    : 'secondary'
                              }
                              className={
                                incident.severity === 'critical'
                                  ? 'bg-(--danger-solid) hover:opacity-90 text-white shadow-sm text-xs'
                                  : incident.severity === 'high'
                                    ? 'bg-(--warning-solid) hover:opacity-90 text-white shadow-sm text-xs'
                                    : 'bg-(--surface-3) hover:bg-(--surface-2) text-(--text-2) shadow-sm text-xs'
                              }
                            >
                              {incident.severity}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="border-(--border) bg-(--background) text-(--foreground) text-xs"
                            >
                              {incident.status}
                            </Badge>
                          </div>
                          <p
                            className="font-semibold text-sm sm:text-base mb-1"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {incident.title}
                          </p>
                          <p className="text-xs sm:text-sm text-muted-foreground mb-2 line-clamp-2">
                            {incident.description}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              👥 {incident.affectedUsers} {t('superadmin.emergency.usersAffected')}
                            </span>
                            <span>
                              🏢 {incident.affectedOrgs} {t('superadmin.emergency.organizations')}
                            </span>
                            <span>
                              ⏱️ {incident.minutesActive} {t('common.minutesActive')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 sm:self-start">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setResolvingIncidentId(incident._id)}
                            className="border-(--border) bg-(--background) hover:bg-(--background-subtle) text-(--foreground) text-xs"
                          >
                            {t('superadmin.emergency.actions.resolve')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="hover:bg-(--background-subtle) text-(--muted-foreground) h-8 w-8"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Suspicious IPs */}
          {suspiciousIPs.length > 0 && (
            <Card className="mb-6 border-purple-500/50" style={{ background: 'var(--card)' }}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-500">
                  <Shield className="w-5 h-5" />
                  {t('superadmin.emergency.suspiciousIPs')}
                </CardTitle>
                <CardDescription>{t('superadmin.emergency.suspiciousIPsDesc')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {suspiciousIPs.map((ipData: SuspiciousIP) => (
                    <div
                      key={ipData.ip}
                      className="p-4 rounded-lg border border-purple-500/30 bg-purple-500/5"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p
                            className="font-mono font-semibold mb-1"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            🌐 {ipData.ip}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {ipData.attempts} {t('superadmin.emergency.failedAttempts')} •{' '}
                            {ipData.userIds.length} {t('superadmin.emergency.users')}
                          </p>
                        </div>
                        <Badge
                          variant="default"
                          className="bg-(--danger-solid) hover:opacity-90 text-white shadow-sm"
                        >
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          {t('superadmin.emergency.actions.block')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* System Status */}
          <Card style={{ background: 'var(--card)' }}>
            <CardHeader>
              <CardTitle>{t('superadmin.emergency.systemStatus')}</CardTitle>
              <CardDescription>{t('superadmin.emergency.systemStatusSubtitle')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <SystemStatusItem
                  name={t('superadmin.emergency.systemComponents.api')}
                  status={t('superadmin.emergency.systemComponents.operational')}
                  latency="45ms"
                />
                <SystemStatusItem
                  name={t('superadmin.emergency.systemComponents.database')}
                  status={t('superadmin.emergency.systemComponents.operational')}
                  latency="12ms"
                />
                <SystemStatusItem
                  name={t('superadmin.emergency.systemComponents.emailService')}
                  status={t('superadmin.emergency.systemComponents.operational')}
                  latency="230ms"
                />
                <SystemStatusItem
                  name={t('superadmin.emergency.systemComponents.stripe')}
                  status={t('superadmin.emergency.systemComponents.operational')}
                  latency="180ms"
                />
                <SystemStatusItem
                  name={t('superadmin.emergency.systemComponents.convex')}
                  status={t('superadmin.emergency.systemComponents.operational')}
                  latency="35ms"
                />
                <SystemStatusItem
                  name={t('superadmin.emergency.systemComponents.redis')}
                  status={t('superadmin.emergency.systemComponents.operational')}
                  latency="8ms"
                />
                <SystemStatusItem
                  name={t('superadmin.emergency.systemComponents.cloudinary')}
                  status={t('superadmin.emergency.systemComponents.operational')}
                  latency="320ms"
                />
                <SystemStatusItem
                  name={t('superadmin.emergency.systemComponents.sentry')}
                  status={t('superadmin.emergency.systemComponents.operational')}
                  latency="95ms"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Create Incident Wizard Dialog */}
        <Sheet open={createIncidentOpen} onOpenChange={setCreateIncidentOpen}>
          <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
            <SheetTitle className="sr-only">{t('superadmin.emergency.createIncident')}</SheetTitle>
            <SheetDescription className="sr-only">
              {t('superadmin.emergency.createIncidentDesc')}
            </SheetDescription>
            <SheetBody>
              <CreateIncidentWizard
                userId={user.id as Id<'users'>}
                onComplete={() => setCreateIncidentOpen(false)}
                onCancel={() => setCreateIncidentOpen(false)}
              />
            </SheetBody>
          </SheetContent>
        </Sheet>

        <PromptDialog
          open={resolvingIncidentId !== null}
          onOpenChange={(next) => !next && setResolvingIncidentId(null)}
          title={t('superadmin.emergency.alerts.resolveIncidentTitle')}
          description={t('superadmin.emergency.alerts.resolveIncidentHint')}
          submitLabel={t('superadmin.emergency.actions.resolve')}
          fields={[
            {
              name: 'rootCause',
              label: t('superadmin.emergency.alerts.specifyRootCause'),
              placeholder: t('superadmin.emergency.alerts.rootCausePlaceholder'),
              multiline: true,
              minLength: 10,
              maxLength: 2000,
            },
            {
              name: 'resolution',
              label: t('superadmin.emergency.alerts.specifyResolution'),
              placeholder: t('superadmin.emergency.alerts.resolutionPlaceholder'),
              multiline: true,
              minLength: 10,
              maxLength: 2000,
            },
          ]}
          onSubmit={handleResolveIncident}
        />
      </div>
    </ErrorBoundary>
  );
}

// Stat Card Component
function StatCard({
  title,
  value,
  icon,
  color,
  subtitle,
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  subtitle: string;
}) {
  const colorClasses: Record<string, string> = {
    red: 'text-red-500',
    orange: 'text-orange-500',
    yellow: 'text-yellow-500',
    purple: 'text-purple-500',
    blue: 'text-blue-500',
    green: 'text-green-500',
  };

  return (
    <Card style={{ background: 'var(--background-subtle)' }}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground">{title}</p>
          {React.createElement(icon, { className: `w-4 h-4 ${colorClasses[color]}` })}
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

// System Status Item
function SystemStatusItem({
  name,
  status,
  latency,
}: {
  name: string;
  status: string;
  latency: string;
}) {
  return (
    <div
      className="flex items-center justify-between p-3 rounded-lg border"
      style={{ background: 'var(--background-subtle)' }}
    >
      <div>
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {name}
        </p>
        <p className="text-xs text-muted-foreground">{latency}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-(--success-solid)" />
        <span className="text-xs text-(--success-text) capitalize">{status}</span>
      </div>
    </div>
  );
}
