'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { useAuthStore } from '@/store/useAuthStore';
import { api } from '@/convex/_generated/api';
import { motion } from '@/lib/cssMotion';
import {
  Clock,
  UserPlus,
  CheckCircle2,
  XCircle,
  FileText,
  DollarSign,
  Target,
  Truck,
  Plane,
  ListChecks,
  Bell,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import Link from 'next/link';

// ── Types ──
type ActivityAction =
  | 'task_created'
  | 'task_completed'
  | 'task_status_updated'
  | 'leave_created'
  | 'leave_approved'
  | 'leave_rejected'
  | 'employee_added'
  | 'employee_updated'
  | 'payroll_approved'
  | 'payroll_paid'
  | 'goal_created'
  | 'goal_completed'
  | 'driver_requested'
  | 'driver_approved'
  | 'attendance_checkin'
  | 'recruitment_stage_changed'
  | 'unknown';

interface Activity {
  id: string;
  action: ActivityAction;
  title: string;
  description: string;
  timestamp: number;
  user: { name: string; avatarUrl?: string | null } | null;
  route?: string;
  severity?: 'info' | 'success' | 'warning' | 'error';
}

/** Minimal shape of the audit log entries consumed by this widget. */
interface AuditLogEntry {
  _id: string;
  _creationTime: number;
  action: string;
  details?: string;
  createdAt?: number;
  user?: { name?: string; avatarUrl?: string } | null;
}

// ── Config ──
const ACTION_CONFIG: Record<
  ActivityAction,
  { icon: typeof Clock; color: string; bg: string; defaultSeverity: Activity['severity'] }
> = {
  task_created: {
    icon: ListChecks,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    defaultSeverity: 'info',
  },
  task_completed: {
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    defaultSeverity: 'success',
  },
  task_status_updated: {
    icon: ArrowRight,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    defaultSeverity: 'info',
  },
  leave_created: {
    icon: Plane,
    color: 'text-sky-500',
    bg: 'bg-sky-500/10',
    defaultSeverity: 'info',
  },
  leave_approved: {
    icon: CheckCircle2,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    defaultSeverity: 'success',
  },
  leave_rejected: {
    icon: XCircle,
    color: 'text-rose-500',
    bg: 'bg-rose-500/10',
    defaultSeverity: 'error',
  },
  employee_added: {
    icon: UserPlus,
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    defaultSeverity: 'success',
  },
  employee_updated: {
    icon: UserPlus,
    color: 'text-indigo-500',
    bg: 'bg-indigo-500/10',
    defaultSeverity: 'info',
  },
  payroll_approved: {
    icon: DollarSign,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    defaultSeverity: 'success',
  },
  payroll_paid: {
    icon: DollarSign,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    defaultSeverity: 'success',
  },
  goal_created: {
    icon: Target,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    defaultSeverity: 'info',
  },
  goal_completed: {
    icon: Target,
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    defaultSeverity: 'success',
  },
  driver_requested: {
    icon: Truck,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    defaultSeverity: 'info',
  },
  driver_approved: {
    icon: Truck,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
    defaultSeverity: 'success',
  },
  attendance_checkin: {
    icon: Clock,
    color: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
    defaultSeverity: 'info',
  },
  recruitment_stage_changed: {
    icon: FileText,
    color: 'text-pink-500',
    bg: 'bg-pink-500/10',
    defaultSeverity: 'info',
  },
  unknown: {
    icon: Bell,
    color: 'text-(--text-muted)',
    bg: 'bg-(--background-subtle)',
    defaultSeverity: 'info',
  },
};

// ── Format helpers ──
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatAction(action: string): ActivityAction {
  const normalized = action.toLowerCase().replace(/\s+/g, '_');
  const known: Record<string, ActivityAction> = {
    task_created: 'task_created',
    task_completed: 'task_completed',
    task_status_updated: 'task_status_updated',
    task_deleted: 'task_status_updated',
    leave_created: 'leave_created',
    leave_approved: 'leave_approved',
    leave_rejected: 'leave_rejected',
    employee_added: 'employee_added',
    employee_updated: 'employee_updated',
    payroll_approved: 'payroll_approved',
    payroll_paid: 'payroll_paid',
    goal_created: 'goal_created',
    goal_completed: 'goal_completed',
    create_run: 'payroll_approved',
    calculate: 'payroll_approved',
    approve: 'payroll_approved',
    pay: 'payroll_paid',
    driver_requested: 'driver_requested',
    driver_approved: 'driver_approved',
    check_in: 'attendance_checkin',
    check_out: 'attendance_checkin',
    recruitment_stage_changed: 'recruitment_stage_changed',
  };
  return known[normalized] ?? 'unknown';
}

// ── Activity Item ──
function ActivityItem({
  activity,
  index,
}: {
  activity: Activity;
  index: number;
  t: (key: string) => string;
}) {
  const cfg = ACTION_CONFIG[activity.action] ?? ACTION_CONFIG.unknown;
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
      className="group relative"
    >
      {/* Timeline line */}
      {index > 0 && (
        <div className="absolute left-[17px] top-0 bottom-1/2 w-px bg-(--border) -translate-y-0" />
      )}

      <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-(--background-subtle)/50 transition-colors duration-200">
        {/* Icon circle */}
        <div className={`relative z-10 p-2 rounded-xl ${cfg.bg} ${cfg.color} shrink-0`}>
          <Icon className="w-4 h-4" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {activity.user && (
              <span className="text-sm font-semibold text-(--text-primary) truncate max-w-[120px]">
                {activity.user.name}
              </span>
            )}
            <span className="text-sm text-(--text-primary) line-clamp-1">{activity.title}</span>
          </div>
          {activity.description && (
            <p className="text-xs text-(--text-muted) mt-0.5 line-clamp-1">
              {activity.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            {' '}
            <span className="text-[10px] text-(--text-muted)">
              {timeAgo(activity.timestamp)}
            </span>{' '}
            {activity.severity === 'error' && (
              <Badge variant="destructive" className="text-[8px] px-1 py-0">
                Critical
              </Badge>
            )}
          </div>
        </div>

        {/* Action link */}
        {activity.route && (
          <Link
            href={activity.route}
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-1"
          >
            <Button variant="ghost" size="icon" className="w-7 h-7">
              <ArrowRight className="w-3.5 h-3.5 text-(--text-muted)" />
            </Button>
          </Link>
        )}
      </div>
    </motion.div>
  );
}

// ── Main ActivityFeed ──
interface ActivityFeedProps {
  limit?: number;
  showViewAll?: boolean;
}

export default function ActivityFeed({ limit = 8, showViewAll = true }: ActivityFeedProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const isAdmin =
    user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'supervisor';
  // getAuditLogs server-side only allows admin/superadmin (not supervisor)
  const canViewAuditLogs = user?.role === 'admin' || user?.role === 'superadmin';

  const _useQuery = useQuery as unknown as (...args: unknown[]) => unknown;

  // Only admins/superadmins can fetch audit logs; employees/supervisors see empty state
  const auditLogs = _useQuery(
    api.users.queries.getAuditLogs as never,
    user?.id && canViewAuditLogs ? {} : 'skip',
  ) as AuditLogEntry[] | undefined;

  const allActivities = useMemo(() => {
    if (!auditLogs) return undefined;

    const activities: Activity[] = [];

    // Convert audit logs to activities
    for (const log of auditLogs) {
      try {
        const details = (log.details ? JSON.parse(log.details) : {}) as Record<string, unknown> & {
          title?: string;
          taskId?: string;
        };
        const action = formatAction(log.action);

        activities.push({
          id: log._id,
          action,
          title: details.title ?? action.replace(/_/g, ' '),
          description:
            typeof details === 'string' ? details : JSON.stringify(details).slice(0, 100),
          timestamp: log.createdAt ?? log._creationTime,
          user: log.user
            ? {
                name: log.user.name ?? t('common.unknownUser', 'Unknown'),
                avatarUrl: log.user.avatarUrl,
              }
            : null,
          route: log.action?.startsWith('task')
            ? `/tasks/${details.taskId ?? ''}`
            : log.action?.startsWith('leave')
              ? '/leaves'
              : log.action?.startsWith('payroll')
                ? '/payroll'
                : undefined,
          severity:
            action === 'leave_rejected'
              ? 'error'
              : action === 'task_completed' || action === 'leave_approved'
                ? 'success'
                : 'info',
        });
      } catch {
        // Skip malformed logs
      }
    }

    // Sort by timestamp descending
    activities.sort((a, b) => b.timestamp - a.timestamp);

    return activities.slice(0, limit);
  }, [auditLogs, limit, t]);

  return (
    <Card className="h-full border-(--border) overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="relative">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 shadow-sm">
                <Bell className="w-4 h-4 text-white" />
              </div>
              <div className="absolute -inset-0.5 rounded-lg bg-blue-500/20 blur-sm -z-10" />
            </div>
            {t('activityFeed.title', 'Recent Activity')}
            {allActivities && allActivities.length > 0 && (
              <span className="text-[10px] font-medium text-(--text-muted) bg-(--background-subtle) px-1.5 py-0.5 rounded-full">
                {allActivities.length}
              </span>
            )}
          </CardTitle>
          {showViewAll && isAdmin && (
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link href="/audit">{t('activityFeed.viewAll', 'View all')}</Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {allActivities === undefined ? (
          <div className="flex items-center justify-center py-12">
            <ShieldLoader size="sm" />
          </div>
        ) : allActivities.length === 0 ? (
          <div className="py-12 text-center">
            <Bell className="w-10 h-10 text-(--text-muted) mx-auto mb-2 opacity-30" />
            <p className="text-sm text-(--text-muted)">
              {t('activityFeed.empty', 'No recent activity')}
            </p>
            <p className="text-xs text-(--text-muted) mt-1">
              {t(
                'activityFeed.emptyHint',
                'Activity will appear here as team members perform actions',
              )}
            </p>
          </div>
        ) : (
          <div className="px-4 pb-4 space-y-1">
            {' '}
            <>
              {allActivities.map((activity, idx) => (
                <ActivityItem key={activity.id} activity={activity} index={idx} t={t} />
              ))}
            </>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
