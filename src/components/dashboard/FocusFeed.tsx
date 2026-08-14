'use client';

/**
 * Focus Feed — the first thing on the dashboard.
 *
 * The problem it solves: the dashboard opened on four stat tiles, two charts and
 * a widget grid. All of it is *reference* material — it tells you the state of
 * the org, but not what you personally have to do, and nothing on it could be
 * acted on without navigating away first. A manager's actual morning question is
 * "what needs me today", and answering it took three clicks into /leaves.
 *
 * So this block answers exactly that question, and lets the answer be acted on
 * in place: a pending request can be approved without leaving the page. Below it
 * a single row of counters covers the rest of today — events, birthdays,
 * absences, due tasks — each linking to its own page rather than restating it.
 *
 * Design rules it follows:
 *   - Progressive disclosure. Only the single most urgent request is expanded;
 *     the rest are a count behind "Review all". Showing all of them would
 *     recreate the /leaves page on the dashboard.
 *   - Nothing is rendered for a signal that is zero. An empty card that says "0
 *     birthdays" costs the same attention as a real one. When everything is
 *     clear the whole block collapses to one calm line, which is a deliberate
 *     reward rather than an empty state.
 *   - Every query here is one the app already ran somewhere; no new backend.
 */

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { format, isPast, isToday as isDateToday } from 'date-fns';
import { enUS, hy, ru, de } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import {
  ArrowRight,
  Cake,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ListChecks,
  Plane,
  Search,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useAuthUser } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

const REVIEWER_ROLES = new Set(['superadmin', 'admin', 'supervisor']);

function dateFnsLocale(lang: string): Locale {
  if (lang === 'ru') return ru;
  if (lang === 'hy') return hy;
  if (lang === 'de') return de;
  return enUS;
}

/** Local-midnight bounds for "today", which is what the event window needs. */
function todayBounds(): { start: number; end: number } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start: start.getTime(), end: end.getTime() };
}

interface FocusTileProps {
  icon: LucideIcon;
  tone: 'brand' | 'success' | 'warning' | 'danger' | 'purple' | 'pink';
  value: number;
  label: string;
  href: string;
}

const TONE_CLASSES: Record<FocusTileProps['tone'], string> = {
  brand: 'bg-(--brand-quiet) text-(--brand-text)',
  success: 'bg-(--success-quiet) text-(--success-text)',
  warning: 'bg-(--warning-quiet) text-(--warning-text)',
  danger: 'bg-(--danger-quiet) text-(--danger-text)',
  purple: 'bg-(--purple-quiet) text-(--purple-text)',
  pink: 'bg-(--pink-quiet) text-(--pink-text)',
};

function FocusTile({ icon: Icon, tone, value, label, href }: FocusTileProps) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex min-w-0 items-center gap-3 rounded-card border border-(--border-subtle)',
        'bg-(--card) px-3.5 py-3 shadow-sm',
        'transition-[border-color,box-shadow] duration-140 ease-spark',
        'hover:border-(--border-strong) hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-control',
          TONE_CLASSES[tone],
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        {/* Tabular figures: these counters change as data loads, and
            proportional digits make the row visibly twitch when they do. */}
        <span className="num block text-title leading-none text-(--text-1)">{value}</span>
        <span className="mt-1 block truncate text-caption font-normal tracking-normal normal-case text-(--text-3)">
          {label}
        </span>
      </span>
      <ArrowRight
        className="ml-auto size-3.5 shrink-0 text-(--text-4) opacity-0 transition-opacity duration-140 group-hover:opacity-100"
        aria-hidden="true"
      />
    </Link>
  );
}

export interface FocusFeedProps {
  /** Opens the ⌘K palette from the header button. */
  onOpenSearch?: () => void;
  className?: string;
}

export function FocusFeed({ onOpenSearch, className }: FocusFeedProps) {
  const { t, i18n } = useTranslation();
  const user = useAuthUser();
  const selectedOrgId = useSelectedOrganization();

  const locale = dateFnsLocale(i18n.language);
  const orgId = (selectedOrgId ?? user?.organizationId) as Id<'organizations'> | undefined;
  const canReview = REVIEWER_ROLES.has(user?.role ?? 'employee');

  /** Requests already acted on in this session, so the row leaves immediately
   *  instead of waiting for the Convex subscription to round-trip. */
  const [resolved, setResolved] = useState<Record<string, 'approved' | 'rejected'>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const approveLeave = useMutation(api.leaves.approveLeave);
  const rejectLeave = useMutation(api.leaves.rejectLeave);

  const pending = useQuery(api.leaves.getPendingLeaves, canReview ? {} : 'skip');
  const birthdays = useQuery(
    api.dashboard.getUpcomingBirthdays,
    orgId ? { withinDays: 1, organizationId: orgId } : 'skip',
  );
  const outOfOffice = useQuery(
    api.dashboard.getOutOfOffice,
    orgId ? { withinDays: 1, organizationId: orgId } : 'skip',
  );
  const myTasks = useQuery(api.dashboard.getMyTasks, {});

  const bounds = useMemo(() => todayBounds(), []);
  const events = useQuery(
    api.events.getCompanyEvents,
    orgId ? { organizationId: orgId, startDate: bounds.start, endDate: bounds.end } : 'skip',
  );

  const openPending = useMemo(
    () => (pending ?? []).filter((leave) => !resolved[leave._id]),
    [pending, resolved],
  );

  const birthdaysToday = useMemo(
    () => (birthdays ?? []).filter((b) => b.isToday).length,
    [birthdays],
  );
  const outToday = useMemo(
    () => (outOfOffice ?? []).filter((p) => p.isOutToday).length,
    [outOfOffice],
  );
  const eventsToday = events?.length ?? 0;

  const { overdue, dueToday } = useMemo(() => {
    let over = 0;
    let today = 0;
    for (const task of myTasks ?? []) {
      if (!task.deadline) continue;
      const deadline = new Date(task.deadline);
      if (isDateToday(deadline)) today += 1;
      else if (isPast(deadline)) over += 1;
    }
    return { overdue: over, dueToday: today };
  }, [myTasks]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t('focus.greetingMorning', 'Good morning');
    if (hour < 18) return t('focus.greetingAfternoon', 'Good afternoon');
    return t('focus.greetingEvening', 'Good evening');
  }, [t]);

  const firstName = user?.name?.split(' ')[0] ?? '';
  const next = openPending[0];

  async function act(leaveId: Id<'leaveRequests'>, action: 'approved' | 'rejected') {
    setBusyId(leaveId);
    try {
      if (action === 'approved') await approveLeave({ leaveId });
      else await rejectLeave({ leaveId });
      setResolved((prev) => ({ ...prev, [leaveId]: action }));
      toast.success(
        action === 'approved' ? t('focus.approved', 'Approved') : t('focus.rejected', 'Rejected'),
      );
    } catch (error) {
      // Convex throws plain strings here ('Leave is not pending', separation-of-
      // duties violations, cross-org access). Surface them rather than swallow:
      // a silently-failing approve button is worse than no button.
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(null);
    }
  }

  const tiles: FocusTileProps[] = [];
  if (eventsToday > 0) {
    tiles.push({
      icon: CalendarDays,
      tone: 'brand',
      value: eventsToday,
      label: t('focus.eventsToday', 'On today'),
      href: '/calendar',
    });
  }
  if (overdue > 0) {
    tiles.push({
      icon: ListChecks,
      tone: 'danger',
      value: overdue,
      label: t('focus.tasksOverdue', '{{count}} overdue', { count: overdue }),
      href: '/tasks',
    });
  }
  if (dueToday > 0) {
    tiles.push({
      icon: ListChecks,
      tone: 'warning',
      value: dueToday,
      label: t('focus.tasksDue', 'Tasks due'),
      href: '/tasks',
    });
  }
  if (birthdaysToday > 0) {
    tiles.push({
      icon: Cake,
      tone: 'pink',
      value: birthdaysToday,
      label: t('focus.birthdays', 'Birthday today'),
      href: '/team',
    });
  }
  if (outToday > 0) {
    tiles.push({
      icon: Plane,
      tone: 'purple',
      value: outToday,
      label: t('focus.outToday', 'Out of office today'),
      href: '/calendar',
    });
  }

  const hasApprovals = canReview && openPending.length > 0;
  const isLoading = pending === undefined && birthdays === undefined && myTasks === undefined;
  const isQuiet = !hasApprovals && tiles.length === 0;

  return (
    <section
      aria-label={t('focus.title', "Today's focus")}
      className={cn('focus-feed relative overflow-hidden rounded-sheet', className)}
    >
      {/* Ambient wash. At 6-8% it is not perceived as colour, only as the block
          sitting slightly forward of the page — the cheapest way to mark "this
          is the important part" without a heavy border or a solid fill. */}
      <div className="focus-feed-wash" aria-hidden="true" />

      <div className="relative p-4 sm:p-5">
        {/* ── Greeting row ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-title text-(--text-1)">
              {firstName ? `${greeting}, ${firstName}` : greeting}
            </h2>
            <p className="mt-0.5 text-label text-(--text-3)">
              {format(new Date(), 'EEEE, d MMMM', { locale })}
            </p>
          </div>

          {onOpenSearch && (
            <button
              type="button"
              onClick={onOpenSearch}
              className={cn(
                'press-subtle hidden items-center gap-2 rounded-control border border-(--border-default)',
                'bg-(--card) py-1.5 pl-2.5 pr-2 text-label text-(--text-3) shadow-sm sm:flex',
                'transition-colors duration-140 ease-spark hover:border-(--border-strong) hover:text-(--text-2)',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25',
              )}
            >
              <Search className="size-3.5" aria-hidden="true" />
              {t('focus.searchHint', 'Search anything')}
              <kbd className="kbd ml-1">⌘K</kbd>
            </button>
          )}
        </div>

        {/* ── The one thing that needs a decision ── */}
        {hasApprovals && next && (
          <div className="mt-4 rounded-card border border-(--border-default) glass-panel shadow-sm">
            <div className="flex items-center gap-2 border-b border-(--border-subtle) px-3.5 py-2">
              <ClipboardCheck
                className="size-3.5 shrink-0 text-(--warning-text)"
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-label text-(--text-2)">
                {openPending.length === 1
                  ? t('focus.approvalsOne', '1 request needs your decision')
                  : t('focus.approvalsMany', '{{count}} requests need your decision', {
                      count: openPending.length,
                    })}
              </span>
              <Link
                href="/leaves"
                className="shrink-0 text-caption font-medium text-(--brand-text) hover:underline"
              >
                {t('focus.reviewAll', 'Review all')}
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-3 px-3.5 py-3">
              <Avatar className="size-9 shrink-0">
                {next.userAvatarUrl && <AvatarImage src={next.userAvatarUrl} alt="" />}
                <AvatarFallback className="text-[11px]">
                  {(next.userName || '?').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-(--text-1)">{next.userName}</p>
                <p className="num truncate text-caption font-normal tracking-normal normal-case text-(--text-3)">
                  {t(`leaveTypes.${next.type}`, next.type)} ·{' '}
                  {format(new Date(next.startDate), 'd MMM', { locale })} –{' '}
                  {format(new Date(next.endDate), 'd MMM', { locale })} · {next.days}
                  {t('ui.days', 'd')}
                </p>
              </div>

              {/* Reject sits left of Approve so the destructive action is never
                  the one under a thumb reaching for the primary. */}
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busyId === next._id}
                  onClick={() => act(next._id, 'rejected')}
                >
                  <X className="size-3.5" aria-hidden="true" />
                  {t('focus.reject', 'Reject')}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  disabled={busyId === next._id}
                  onClick={() => act(next._id, 'approved')}
                >
                  <Check className="size-3.5" aria-hidden="true" />
                  {t('focus.approve', 'Approve')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Everything else about today, one counter each ── */}
        {tiles.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {tiles.map((tile) => (
              <FocusTile key={`${tile.label}-${tile.href}`} {...tile} />
            ))}
          </div>
        )}

        {/* ── Nothing to do ──
            Reached only once the queries have resolved, so a slow connection
            never flashes "all caught up" before the real state arrives. */}
        {isQuiet && !isLoading && (
          <div className="mt-4 flex items-center gap-3 rounded-card border border-(--border-subtle) glass-panel px-3.5 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-(--success-quiet) text-(--success-text)">
              <CheckCircle2 className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-body font-medium text-(--text-1)">
                {t('focus.allClear', "You're all caught up")}
              </p>
              <p className="truncate text-caption font-normal tracking-normal normal-case text-(--text-3)">
                {t('focus.allClearHint', 'Nothing needs your attention right now.')}
              </p>
            </div>
          </div>
        )}

        {isQuiet && isLoading && (
          <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-[3.75rem]" />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default FocusFeed;
