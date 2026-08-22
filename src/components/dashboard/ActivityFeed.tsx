'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
  Shield,
  MessageSquare,
  FolderKanban,
  Building2,
  Megaphone,
  FileCheck,
  LogOut,
  CalendarDays,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  | 'chat'
  | 'ticket'
  | 'project'
  | 'organization'
  | 'announcement'
  | 'compliance'
  | 'onboarding'
  | 'offboarding'
  | 'probation'
  | 'security'
  | 'review'
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
    color: 'text-(--brand-text)',
    bg: 'bg-(--brand-quiet)',
    defaultSeverity: 'info',
  },
  task_completed: {
    icon: CheckCircle2,
    color: 'text-(--success-text)',
    bg: 'bg-(--success-quiet)',
    defaultSeverity: 'success',
  },
  task_status_updated: {
    icon: ArrowRight,
    color: 'text-(--warning-text)',
    bg: 'bg-(--warning-quiet)',
    defaultSeverity: 'info',
  },
  leave_created: {
    icon: Plane,
    color: 'text-(--brand-text)',
    bg: 'bg-(--brand-quiet)',
    defaultSeverity: 'info',
  },
  leave_approved: {
    icon: CheckCircle2,
    color: 'text-(--success-text)',
    bg: 'bg-(--success-quiet)',
    defaultSeverity: 'success',
  },
  leave_rejected: {
    icon: XCircle,
    color: 'text-(--danger-text)',
    bg: 'bg-(--danger-quiet)',
    defaultSeverity: 'error',
  },
  employee_added: {
    icon: UserPlus,
    color: 'text-(--purple-text)',
    bg: 'bg-(--purple-quiet)',
    defaultSeverity: 'success',
  },
  employee_updated: {
    icon: UserPlus,
    color: 'text-(--purple-text)',
    bg: 'bg-(--purple-quiet)',
    defaultSeverity: 'info',
  },
  payroll_approved: {
    icon: DollarSign,
    color: 'text-(--success-text)',
    bg: 'bg-(--success-quiet)',
    defaultSeverity: 'success',
  },
  payroll_paid: {
    icon: DollarSign,
    color: 'text-(--success-text)',
    bg: 'bg-(--success-quiet)',
    defaultSeverity: 'success',
  },
  goal_created: {
    icon: Target,
    color: 'text-(--purple-text)',
    bg: 'bg-(--purple-quiet)',
    defaultSeverity: 'info',
  },
  goal_completed: {
    icon: Target,
    color: 'text-(--success-text)',
    bg: 'bg-(--success-quiet)',
    defaultSeverity: 'success',
  },
  driver_requested: {
    icon: Truck,
    color: 'text-(--warning-text)',
    bg: 'bg-(--warning-quiet)',
    defaultSeverity: 'info',
  },
  driver_approved: {
    icon: Truck,
    color: 'text-(--success-text)',
    bg: 'bg-(--success-quiet)',
    defaultSeverity: 'success',
  },
  attendance_checkin: {
    icon: Clock,
    color: 'text-(--cyan-text)',
    bg: 'bg-(--cyan-quiet)',
    defaultSeverity: 'info',
  },
  recruitment_stage_changed: {
    icon: FileText,
    color: 'text-(--pink-text)',
    bg: 'bg-(--pink-quiet)',
    defaultSeverity: 'info',
  },
  chat: {
    icon: MessageSquare,
    color: 'text-(--brand-text)',
    bg: 'bg-(--brand-quiet)',
    defaultSeverity: 'info',
  },
  ticket: {
    icon: FileText,
    color: 'text-(--warning-text)',
    bg: 'bg-(--warning-quiet)',
    defaultSeverity: 'info',
  },
  project: {
    icon: FolderKanban,
    color: 'text-(--purple-text)',
    bg: 'bg-(--purple-quiet)',
    defaultSeverity: 'info',
  },
  organization: {
    icon: Building2,
    color: 'text-(--purple-text)',
    bg: 'bg-(--purple-quiet)',
    defaultSeverity: 'info',
  },
  announcement: {
    icon: Megaphone,
    color: 'text-(--pink-text)',
    bg: 'bg-(--pink-quiet)',
    defaultSeverity: 'info',
  },
  compliance: {
    icon: Shield,
    color: 'text-(--success-text)',
    bg: 'bg-(--success-quiet)',
    defaultSeverity: 'info',
  },
  onboarding: {
    icon: ListChecks,
    color: 'text-(--success-text)',
    bg: 'bg-(--success-quiet)',
    defaultSeverity: 'info',
  },
  offboarding: {
    icon: LogOut,
    color: 'text-(--warning-text)',
    bg: 'bg-(--warning-quiet)',
    defaultSeverity: 'info',
  },
  probation: {
    icon: CalendarDays,
    color: 'text-(--cyan-text)',
    bg: 'bg-(--cyan-quiet)',
    defaultSeverity: 'info',
  },
  security: {
    icon: Shield,
    color: 'text-(--danger-text)',
    bg: 'bg-(--danger-quiet)',
    defaultSeverity: 'info',
  },
  review: {
    icon: FileCheck,
    color: 'text-(--purple-text)',
    bg: 'bg-(--purple-quiet)',
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
type TFunc = TFunction;

function timeAgo(ts: number, now: number, t: TFunc): string {
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return t('time.justNow', 'Just now');
  if (mins < 60) return t('time.minutesAgo', { count: mins, defaultValue: '{{count}}m ago' });
  if (hours < 24) return t('time.hoursAgo', { count: hours, defaultValue: '{{count}}h ago' });
  if (days < 30) return t('time.daysAgo', { count: days, defaultValue: '{{count}}d ago' });
  return new Date(ts).toLocaleDateString();
}

/**
 * Turn an audit action into a human-friendly label, e.g.
 * `GENERATE_SUPERADMIN_TOKEN` → "Generate superadmin token",
 * `chat_conversation_marked_read` → "Chat conversation marked read".
 */
function humanizeAction(action: string): string {
  return action
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function formatAction(action: string): ActivityAction {
  const normalized = action.toLowerCase().replace(/[.\s-]+/g, '_');
  const known: Record<string, ActivityAction> = {
    task_created: 'task_created',
    task_completed: 'task_completed',
    task_status_updated: 'task_status_updated',
    task_deleted: 'task_status_updated',
    task_updated: 'task_status_updated',
    task_reassigned: 'task_status_updated',
    leave_created: 'leave_created',
    leave_approved: 'leave_approved',
    leave_rejected: 'leave_rejected',
    leave_auto_approved: 'leave_approved',
    leave_deleted: 'leave_created',
    leave_updated: 'leave_created',
    employee_added: 'employee_added',
    employee_updated: 'employee_updated',
    user_created: 'employee_added',
    user_updated: 'employee_updated',
    user_approved: 'employee_added',
    profile_updated: 'employee_updated',
    payroll_approved: 'payroll_approved',
    payroll_paid: 'payroll_paid',
    goal_created: 'goal_created',
    goal_completed: 'goal_completed',
    create_run: 'payroll_approved',
    calculate: 'payroll_approved',
    approve: 'payroll_approved',
    pay: 'payroll_paid',
    cancel: 'payroll_approved',
    driver_requested: 'driver_requested',
    driver_approved: 'driver_approved',
    check_in: 'attendance_checkin',
    check_out: 'attendance_checkin',
    recruitment_stage_changed: 'recruitment_stage_changed',
    chat_message_sent: 'chat',
    chat_message_edited: 'chat',
    chat_message_deleted: 'chat',
    chat_dm_created: 'chat',
    chat_group_created: 'chat',
    chat_conversation_marked_read: 'chat',
    chat_member_added: 'chat',
    chat_member_left: 'chat',
    project_created: 'project',
    project_updated: 'project',
    project_deleted: 'project',
    announcement_created: 'announcement',
    announcement_updated: 'announcement',
    announcement_deleted: 'announcement',
    gdpr_request_status_changed: 'compliance',
    consent_granted: 'compliance',
    consent_withdrawn: 'compliance',
    policy_created: 'compliance',
    policy_updated: 'compliance',
    policy_deleted: 'compliance',
    onboarding_started: 'onboarding',
    onboarding_completed: 'onboarding',
    onboarding_cancelled: 'onboarding',
    offboarding_started: 'offboarding',
    offboarding_completed: 'offboarding',
    offboarding_cancelled: 'offboarding',
    probation_started: 'probation',
    probation_extended: 'probation',
    probation_passed_auto: 'probation',
    probation_started_auto: 'probation',
    login_failed: 'security',
    face_login_failed: 'security',
    face_id_failed_attempt: 'security',
    account_unlocked: 'security',
    user_auto_suspended: 'security',
    security_setting_changed: 'security',
    review_cycle_deleted: 'review',
    generate_superadmin_token: 'organization',
    revoke_superadmin_token: 'organization',
    impersonate_user: 'security',
    end_impersonation: 'security',
  };
  if (known[normalized]) return known[normalized];
  // Prefix families: chat_*, ticket_*, project_*, driver_request_*, leave_balance_*,
  // onboarding_*, offboarding_*, probation_*, messenger_*, recurring_task_* …
  if (normalized.startsWith('chat_') || normalized.startsWith('messenger_')) return 'chat';
  if (normalized.startsWith('ticket_')) return 'ticket';
  if (normalized.startsWith('project_')) return 'project';
  if (normalized.startsWith('driver_request_')) return 'driver_requested';
  if (normalized.startsWith('onboarding_')) return 'onboarding';
  if (normalized.startsWith('offboarding_')) return 'offboarding';
  if (normalized.startsWith('probation_')) return 'probation';
  if (normalized.startsWith('leave_balance') || normalized.startsWith('leave_bulk'))
    return 'leave_created';
  if (normalized.startsWith('recurring_task_')) return 'task_status_updated';
  if (normalized.startsWith('face_') || normalized.startsWith('login_')) return 'security';
  if (normalized.startsWith('announcement')) return 'announcement';
  if (
    normalized.startsWith('gdpr_') ||
    normalized.startsWith('policy_') ||
    normalized.startsWith('consent_') ||
    normalized.startsWith('sign_')
  )
    return 'compliance';
  if (normalized.startsWith('integration_') || normalized.startsWith('verification'))
    return 'security';
  if (
    normalized.startsWith('organization') ||
    normalized.startsWith('org_') ||
    normalized.startsWith('join_request')
  )
    return 'organization';
  if (normalized.startsWith('holiday_') || normalized.startsWith('leave_type'))
    return 'leave_created';
  return 'unknown';
}

/**
 * Build a readable one-liner from an audit log's details JSON. Returns '' when
 * nothing user-facing can be extracted — the widget then shows just the title.
 */
const NOISY_DETAIL_KEYS = new Set([
  'tokenId',
  'periodId',
  'taskId',
  'userId',
  'organizationId',
  '_id',
  'id',
  'title',
  'createdAt',
  'updatedAt',
  'expiresAt',
  'startDate',
  'endDate',
  'passwordHash',
  'avatarUrl',
  'ip',
]);

function summarizeDetails(details: Record<string, unknown>, rawAction = '', t: TFunc): string {
  // Temp-access tokens carry a human + email — surface those.
  if (typeof details.tempName === 'string') {
    const who = [details.tempName, typeof details.tempEmail === 'string' ? details.tempEmail : null]
      .filter(Boolean)
      .join(' · ');
    return t('activityFeed.details.tempAccess', { who, defaultValue: 'Temp access: {{who}}' });
  }
  // Probation / review periods: duration is the user-facing bit.
  if (typeof details.durationDays === 'number') {
    const isProbation = rawAction.toLowerCase().includes('probation');
    // A named period (e.g. "Q3 Review") is more useful than a generic label.
    if (!isProbation && typeof details.periodName === 'string') {
      return `${details.periodName} · ${details.durationDays} days`;
    }
    const key = isProbation
      ? 'activityFeed.details.probationDays'
      : 'activityFeed.details.reviewCycleDays';
    const fallback = isProbation ? 'Probation · {{count}} days' : 'Review cycle · {{count}} days';
    return t(key, { count: details.durationDays, defaultValue: fallback });
  }
  if (typeof details.messagesRead === 'number') {
    return t('activityFeed.details.messagesRead', {
      count: details.messagesRead,
      defaultValue: 'Marked {{count}} messages as read',
    });
  }
  if (Array.isArray(details.updatedFields) && details.updatedFields.length > 0) {
    const shown = details.updatedFields.slice(0, 3).map(String).join(', ');
    const rest = details.updatedFields.length - 3;
    const more =
      rest > 0
        ? `, ${t('activityFeed.details.moreFields', {
            count: rest,
            defaultValue: '+{{count}} more',
          })}`
        : '';
    return (
      t('activityFeed.details.updatedFields', {
        fields: shown,
        defaultValue: 'Updated fields: {{fields}}',
      }) + more
    );
  }
  // Fallback: a few scalar values, skipping ids/timestamps.
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (NOISY_DETAIL_KEYS.has(key)) continue;
    if (typeof value === 'string' && value.length < 40) parts.push(value);
    else if (typeof value === 'number') parts.push(String(value));
    if (parts.length >= 3) break;
  }
  return parts.join(' · ');
}

function deriveSeverity(action: ActivityAction, rawAction: string): Activity['severity'] {
  const raw = rawAction.toLowerCase();
  if (action === 'leave_rejected' || /rejected|failed|declined|revoked|deleted/.test(raw)) {
    return 'error';
  }
  if (
    action === 'task_completed' ||
    action === 'leave_approved' ||
    /approved|completed|paid|verified/.test(raw)
  ) {
    return 'success';
  }
  return 'info';
}

// ── Activity Item ──
function ActivityItem({
  activity,
  index,
  now,
  t,
}: {
  activity: Activity;
  index: number;
  /** Current time (ms) — bumped every 30s so "x m ago" stays honest. */
  now: number;
  t: TFunc;
}) {
  const cfg = ACTION_CONFIG[activity.action] ?? ACTION_CONFIG.unknown;
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
      className="group relative pl-9"
    >
      {/* Timeline line — runs through center of circles */}
      <div className="absolute left-4 top-0 bottom-0 w-px bg-(--border-subtle)" />

      <div className="relative flex items-start gap-3 py-3">
        {/* Icon circle — sits on top of the line */}
        <div
          className={`absolute -left-9 z-10 flex size-8 items-center justify-center rounded-full border-2 border-(--border-subtle) ${cfg.bg} ${cfg.color} shrink-0`}
          style={{ top: '10px' }}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-(--text-primary) line-clamp-1">
            {activity.title}
          </p>
          {activity.description && (
            <p className="text-xs text-(--brand-text) mt-0.5 line-clamp-1">
              {activity.description}
            </p>
          )}
          <span className="mt-0.5 block text-[11px] text-(--text-muted)">
            {timeAgo(activity.timestamp, now, t)}
          </span>
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

  // Tick once a minute so relative timestamps ("3m ago") don't go stale while
  // the feed sits on screen — the feed is a live surface, not a static snapshot.
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
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
        const rawDetails: unknown = log.details ? JSON.parse(log.details) : {};
        const details = (rawDetails && typeof rawDetails === 'object' ? rawDetails : {}) as Record<
          string,
          unknown
        > & { title?: string; taskId?: string };
        const action = formatAction(log.action);
        const normalized = log.action.toLowerCase().replace(/[.\s-]+/g, '_');
        // Translated action label, falling back to a humanized English label when
        // the action is not yet in the locale dictionaries.
        const humanized = humanizeAction(log.action);
        const actionLabel = t(`activityFeed.actions.${normalized}`, {
          defaultValue: humanized,
        });

        activities.push({
          id: log._id,
          action,
          title: typeof details.title === 'string' && details.title ? details.title : actionLabel,
          description:
            typeof rawDetails === 'string' ? rawDetails : summarizeDetails(details, log.action, t),
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
          severity: deriveSeverity(action, log.action ?? ''),
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
    <Card className="h-full border-(--border) overflow-hidden glass-panel">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="relative">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-(--brand) to-(--cyan) shadow-sm">
                <Bell className="w-4 h-4 text-white" />
              </div>
              <div className="absolute -inset-0.5 rounded-lg bg-(--brand-quiet) blur-sm -z-10" />
            </div>
            {t('activityFeed.title', 'Recent Activity')}
            {allActivities && allActivities.length > 0 && (
              <span className="text-[10px] font-medium text-(--text-muted) bg-(--background-subtle) px-1.5 py-0.5 rounded-full">
                {allActivities.length}
              </span>
            )}
            {/* Live badge — the feed updates in place (relative timestamps
                tick) rather than being a static list. */}
            {allActivities && allActivities.length > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{
                  background: 'rgb(var(--green-500-ch) / 12%)',
                  color: 'var(--success-text)',
                }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    style={{ background: 'var(--success-solid)' }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-1.5 w-1.5"
                    style={{ background: 'var(--success-solid)' }}
                  />
                </span>
                {t('activityFeed.live', 'Live')}
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
          <div className="px-4 pb-4">
            {' '}
            <>
              {allActivities.map((activity, idx) => (
                <ActivityItem key={activity.id} activity={activity} index={idx} now={now} t={t} />
              ))}
            </>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
