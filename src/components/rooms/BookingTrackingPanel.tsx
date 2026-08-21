'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner';
import { format, formatDistanceToNow } from 'date-fns';
import { enUS, ru, hy, de } from 'date-fns/locale';
import i18n from 'i18next';
import {
  AlertCircle,
  CalendarClock,
  Check,
  CircleHelp,
  Clock,
  HelpCircle,
  LogIn,
  MessageSquare,
  Pencil,
  RotateCcw,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { EmployeeHoverCard } from '@/components/employees/EmployeeHoverCard';
import type {
  AttendeeResponse,
  BookingActivityEvent,
  BookingResponseCounts,
  BookingTracking,
  TrackedAttendee,
} from './types';

/**
 * Outlook-style tracking for one room booking.
 *
 * Three questions have to be answerable at a glance, which is what the three
 * blocks below are for:
 *   1. where does the meeting stand — the response bar and its counters;
 *   2. who said what, and when — the roster, ordered accepted → tentative →
 *      declined → no answer, each row carrying its own timestamp and note;
 *   3. what happened to this booking — the activity log, visible to the
 *      organizer and to organization staff, which records reschedules,
 *      cancellations, guest-list changes and every answer.
 *
 * Everything is server-truth: the panel renders what `getBookingTracking`
 * returns, including which actions the viewer is allowed to take, so the UI
 * cannot drift from the permission rules.
 */

const RESPONSE_STYLE: Record<
  AttendeeResponse,
  { chip: string; dot: string; icon: React.ComponentType<{ className?: string }> }
> = {
  accepted: {
    chip: 'bg-(--success-quiet) text-(--success-text) dark:text-(--success-text)',
    dot: 'bg-(--success-solid)',
    icon: Check,
  },
  tentative: {
    chip: 'bg-(--warning-quiet) text-(--warning-text) dark:text-(--warning-text)',
    dot: 'bg-(--warning-solid)',
    icon: HelpCircle,
  },
  declined: {
    chip: 'bg-(--danger-quiet) text-(--danger-text) dark:text-(--danger-text)',
    dot: 'bg-(--danger-solid)',
    icon: X,
  },
  needs_action: {
    chip: 'bg-(--background-subtle) text-(--text-muted)',
    dot: 'bg-(--border)',
    icon: CircleHelp,
  },
};

const EVENT_ICON: Record<
  BookingActivityEvent['type'],
  React.ComponentType<{ className?: string }>
> = {
  created: CalendarClock,
  updated: Pencil,
  rescheduled: Clock,
  cancelled: Trash2,
  attendee_added: UserPlus,
  attendee_removed: UserMinus,
  responded: MessageSquare,
  responses_reset: RotateCcw,
  checked_in: LogIn,
};

function useDateLocale() {
  const lang = i18n.language || 'en';
  return lang === 'ru' ? ru : lang === 'hy' ? hy : lang === 'de' ? de : enUS;
}

export function BookingTrackingPanel({
  bookingId,
  enabled = true,
  onViewProfile,
}: {
  bookingId: string;
  /** Skips the query while the panel is collapsed. */
  enabled?: boolean;
  /** Forwarded to EmployeeHoverCard — closes the parent modal and opens the
   *  employee sheet at a higher level. */
  onViewProfile?: (userId: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const respond = useMutation(api.meetingRooms.respondToBooking);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState<AttendeeResponse | null>(null);
  const [showComment, setShowComment] = useState(false);

  const tracking = useQuery(
    api.meetingRooms.getBookingTracking,
    enabled ? { bookingId: bookingId as Id<'roomBookings'> } : 'skip',
  ) as BookingTracking | null | undefined;

  const formatAbsolute = (ms: number) => format(new Date(ms), 'd MMM, HH:mm', { locale });
  const formatRelative = (ms: number) =>
    formatDistanceToNow(new Date(ms), { addSuffix: true, locale });

  const handleRespond = async (response: AttendeeResponse) => {
    if (response === 'needs_action') return;
    setBusy(response);
    try {
      await respond({
        bookingId: bookingId as Id<'roomBookings'>,
        response,
        comment: comment.trim() || undefined,
      });
      setComment('');
      setShowComment(false);
      toast.success(t(`rooms.tracking.responseSaved.${response}`));
    } catch (error) {
      logger.error('RSVP failed', error);
      toast.error(t('rooms.errors.generic'));
    } finally {
      setBusy(null);
    }
  };

  if (!enabled) return null;

  if (tracking === undefined) {
    return (
      <div className="space-y-2 p-3" aria-busy="true">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-9 animate-pulse rounded-lg bg-(--background-subtle)" />
        ))}
      </div>
    );
  }

  if (tracking === null) {
    return (
      <p className="flex items-center gap-2 p-3 text-xs text-(--text-muted)">
        <AlertCircle className="h-3.5 w-3.5" />
        {t('rooms.tracking.unavailable')}
      </p>
    );
  }

  const { booking, organizer, attendees, counts, timeline, timelineVisible, viewer } = tracking;
  const answered = counts.accepted + counts.tentative + counts.declined;

  return (
    <div className="space-y-4 border-t border-(--border) px-3 py-3">
      {/* 1 — where does the meeting stand */}
      <section className="space-y-2">
        <header className="flex items-center justify-between gap-2">
          <h5 className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted)">
            {t('rooms.tracking.title')}
          </h5>
          <span className="text-[11px] text-(--text-muted)">
            {t('rooms.tracking.answeredOf', { answered, total: counts.total })}
          </span>
        </header>

        <ResponseBar counts={counts} />

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <CountTile
            response="accepted"
            value={counts.accepted}
            label={t('rooms.tracking.accepted')}
          />
          <CountTile
            response="tentative"
            value={counts.tentative}
            label={t('rooms.tracking.tentative')}
          />
          <CountTile
            response="declined"
            value={counts.declined}
            label={t('rooms.tracking.declined')}
          />
          <CountTile
            response="needs_action"
            value={counts.needsAction}
            label={t('rooms.tracking.noResponse')}
          />
        </div>

        {counts.total > 0 && (
          <p className="text-[11px] text-(--text-muted)">
            {t('rooms.tracking.checkedInOf', { count: counts.checkedIn, total: counts.total })}
          </p>
        )}
      </section>

      {/* 2 — the viewer's own answer */}
      {viewer.canRespond && (
        <section className="rounded-xl border border-(--border) bg-(--background-subtle) p-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-(--text-secondary)">
              {viewer.myResponse && viewer.myResponse !== 'needs_action'
                ? t(`rooms.tracking.yourAnswer.${viewer.myResponse}`)
                : t('rooms.tracking.yourAnswerPending')}
            </span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {(['accepted', 'tentative', 'declined'] as const).map((response) => (
                <Button
                  key={response}
                  size="xs"
                  variant={viewer.myResponse === response ? 'default' : 'outline'}
                  disabled={busy !== null}
                  onClick={() => handleRespond(response)}
                >
                  <ResponseIcon response={response} className="h-3 w-3" />
                  {t(`rooms.tracking.action.${response}`)}
                </Button>
              ))}
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setShowComment((prev) => !prev)}
                aria-expanded={showComment}
              >
                <MessageSquare className="h-3 w-3" />
                {t('rooms.tracking.addNote')}
              </Button>
            </div>
          </div>
          {showComment && (
            <input
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder={t('rooms.tracking.notePlaceholder')}
              maxLength={200}
              className="mt-2 w-full rounded-lg border border-(--border) bg-(--card) px-2.5 py-1.5 text-xs text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--primary) focus:outline-none"
            />
          )}
        </section>
      )}

      {/* 3 — who said what */}
      <section className="space-y-1.5">
        <h5 className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted)">
          {t('rooms.tracking.participants')}
        </h5>

        <AttendeeRow
          userId={organizer.userId}
          name={organizer.name}
          email={organizer.email}
          avatarUrl={organizer.avatarUrl}
          subtitle={t('rooms.tracking.organizer')}
          response="accepted"
          responseLabel={t('rooms.tracking.organizerAlwaysIn')}
          checkedInAt={organizer.checkedInAt}
          isOrganizer
          formatAbsolute={formatAbsolute}
          formatRelative={formatRelative}
          onViewProfile={onViewProfile}
          t={t}
        />

        {attendees.map((attendee) => (
          <AttendeeRow
            key={attendee.userId}
            userId={attendee.userId}
            name={attendee.name}
            email={attendee.email}
            avatarUrl={attendee.avatarUrl}
            subtitle={[attendee.position, attendee.department].filter(Boolean).join(' · ')}
            response={attendee.response}
            responseLabel={
              attendee.respondedAt
                ? t('rooms.tracking.respondedAt', {
                    when: formatRelative(attendee.respondedAt),
                  })
                : t('rooms.tracking.awaitingSince', {
                    when: formatRelative(attendee.invitedAt),
                  })
            }
            responseTitle={attendee.respondedAt ? formatAbsolute(attendee.respondedAt) : undefined}
            comment={attendee.comment}
            isOptional={attendee.isOptional}
            checkedInAt={attendee.checkedInAt}
            isYou={attendee.userId === viewer.userId}
            formatAbsolute={formatAbsolute}
            formatRelative={formatRelative}
            onViewProfile={onViewProfile}
            t={t}
          />
        ))}

        {attendees.length === 0 && (
          <p className="rounded-lg border border-dashed border-(--border) p-3 text-center text-xs text-(--text-muted)">
            {t('rooms.tracking.noAttendees')}
          </p>
        )}

        {booking.externalAttendees.length > 0 && (
          <p className="flex items-start gap-1.5 pt-1 text-xs text-(--text-secondary)">
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--text-muted)" />
            <span>
              <span className="text-(--text-muted)">{t('rooms.tracking.externalGuests')}: </span>
              {booking.externalAttendees.join(', ')}
            </span>
          </p>
        )}
      </section>

      {/* 4 — what happened to this booking */}
      {timelineVisible && (
        <section className="space-y-1.5">
          <h5 className="text-[11px] font-semibold uppercase tracking-wider text-(--text-muted)">
            {t('rooms.tracking.activity')}
          </h5>
          {timeline.length === 0 ? (
            <p className="text-xs text-(--text-muted)">{t('rooms.tracking.noActivity')}</p>
          ) : (
            <ol className="space-y-0">
              {timeline.map((event, index) => (
                <ActivityRow
                  key={event._id}
                  event={event}
                  isLast={index === timeline.length - 1}
                  formatAbsolute={formatAbsolute}
                  formatRelative={formatRelative}
                  formatTime={(ms) => format(new Date(ms), 'HH:mm')}
                  formatDay={(ms) => format(new Date(ms), 'd MMM', { locale })}
                  t={t}
                />
              ))}
            </ol>
          )}
        </section>
      )}

      {/* Audit footer: the dates an admin asks about */}
      <footer className="flex flex-wrap gap-x-4 gap-y-1 border-t border-(--border) pt-2 text-[11px] text-(--text-muted)">
        <span title={formatAbsolute(booking.createdAt)}>
          {t('rooms.tracking.createdAt', { when: formatAbsolute(booking.createdAt) })}
        </span>
        {booking.updatedAt > booking.createdAt && (
          <span>{t('rooms.tracking.updatedAt', { when: formatAbsolute(booking.updatedAt) })}</span>
        )}
        {booking.cancelledAt && (
          <span className="text-(--danger-text)">
            {t('rooms.tracking.cancelledAt', { when: formatAbsolute(booking.cancelledAt) })}
            {booking.cancelReason ? ` · ${booking.cancelReason}` : ''}
          </span>
        )}
      </footer>
    </div>
  );
}

/** Single stacked bar: the shape of the responses, readable without numbers. */
function ResponseBar({ counts }: { counts: BookingResponseCounts }) {
  const segments = useMemo(
    () =>
      (
        [
          ['accepted', counts.accepted],
          ['tentative', counts.tentative],
          ['declined', counts.declined],
          ['needs_action', counts.needsAction],
        ] as const
      ).filter(([, value]) => value > 0),
    [counts],
  );
  const total = counts.total || 1;

  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-(--background-subtle)">
      {segments.map(([response, value]) => (
        <div
          key={response}
          className={cn('h-full', RESPONSE_STYLE[response].dot)}
          style={{ width: `${(value / total) * 100}%` }}
        />
      ))}
    </div>
  );
}

function ResponseIcon({ response, className }: { response: AttendeeResponse; className?: string }) {
  const Icon = RESPONSE_STYLE[response].icon;
  return <Icon className={className} />;
}

function CountTile({
  response,
  value,
  label,
}: {
  response: AttendeeResponse;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-lg border border-(--border) bg-(--card) px-2 py-1.5">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
        <span className={cn('h-1.5 w-1.5 rounded-full', RESPONSE_STYLE[response].dot)} />
        {label}
      </p>
      <p className="mt-0.5 text-sm font-bold text-(--text-primary)">{value}</p>
    </div>
  );
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function AttendeeRow({
  userId,
  name,
  email,
  avatarUrl,
  subtitle,
  response,
  responseLabel,
  responseTitle,
  comment,
  isOptional,
  checkedInAt,
  isOrganizer,
  isYou,
  formatAbsolute,
  formatRelative,
  onViewProfile,
  t,
}: {
  userId?: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  subtitle?: string;
  response: AttendeeResponse;
  responseLabel: string;
  responseTitle?: string;
  comment?: string;
  isOptional?: boolean;
  checkedInAt?: number;
  isOrganizer?: boolean;
  isYou?: boolean;
  formatAbsolute: (ms: number) => string;
  formatRelative: (ms: number) => string;
  onViewProfile?: (userId: string, name: string) => void;
  t: Translate;
}) {
  const style = RESPONSE_STYLE[response];

  return (
    <div className="flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-(--background-subtle)">
      <span className="relative mt-0.5 shrink-0">
        {avatarUrl ? (
          // Avatars are user-uploaded URLs from arbitrary hosts, which
          // next/image cannot pre-configure.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-(--background-subtle) text-[11px] font-bold text-(--text-secondary)">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-(--card)',
            style.dot,
          )}
          aria-hidden="true"
        />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-(--text-primary)">
          {userId ? (
            <EmployeeHoverCard userId={userId} name={name} elevated onViewProfile={onViewProfile}>
              <span className="truncate cursor-pointer hover:underline hover:underline-offset-2">
                {name}
              </span>
            </EmployeeHoverCard>
          ) : (
            <span className="truncate">{name}</span>
          )}
          {isOrganizer && (
            <Badge variant="info" className="h-4 px-1 text-[9px]">
              {t('rooms.tracking.organizer')}
            </Badge>
          )}
          {isYou && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">
              {t('rooms.tracking.you')}
            </Badge>
          )}
          {isOptional && (
            <Badge variant="outline" className="h-4 px-1 text-[9px]">
              {t('rooms.tracking.optional')}
            </Badge>
          )}
          {checkedInAt && (
            <Badge
              variant="success"
              className="h-4 px-1 text-[9px]"
              title={formatAbsolute(checkedInAt)}
            >
              {t('rooms.tracking.present')}
            </Badge>
          )}
        </div>
        {(subtitle || email) && (
          <p className="truncate text-[11px] text-(--text-muted)">{subtitle || email}</p>
        )}
        {comment && (
          <p className="mt-0.5 flex items-start gap-1 text-[11px] italic text-(--text-secondary)">
            <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" />
            {comment}
          </p>
        )}
      </div>

      <div className="shrink-0 text-right">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
            style.chip,
          )}
        >
          <ResponseIcon response={response} className="h-2.5 w-2.5" />
          {t(`rooms.tracking.status.${response}`)}
        </span>
        <p className="mt-0.5 text-[10px] text-(--text-muted)" title={responseTitle}>
          {responseLabel}
        </p>
      </div>
    </div>
  );
}

/** One line of the audit log, phrased as a sentence with the actor first. */
function ActivityRow({
  event,
  isLast,
  formatAbsolute,
  formatRelative,
  formatTime,
  formatDay,
  t,
}: {
  event: BookingActivityEvent;
  isLast: boolean;
  formatAbsolute: (ms: number) => string;
  formatRelative: (ms: number) => string;
  formatTime: (ms: number) => string;
  formatDay: (ms: number) => string;
  t: Translate;
}) {
  const Icon = EVENT_ICON[event.type];

  const description = (() => {
    switch (event.type) {
      case 'rescheduled':
        return t('rooms.tracking.event.rescheduled', {
          from:
            event.previousStartTime !== undefined
              ? `${formatDay(event.previousStartTime)} ${formatTime(event.previousStartTime)}`
              : '—',
          to:
            event.newStartTime !== undefined
              ? `${formatDay(event.newStartTime)} ${formatTime(event.newStartTime)}`
              : '—',
        });
      case 'responded':
        return t(`rooms.tracking.event.responded.${event.response ?? 'needs_action'}`, {
          name: event.targetName ?? event.actorName,
        });
      case 'attendee_added':
        return t('rooms.tracking.event.attendeeAdded', { name: event.targetName ?? '—' });
      case 'attendee_removed':
        return t('rooms.tracking.event.attendeeRemoved', { name: event.targetName ?? '—' });
      case 'checked_in':
        return t('rooms.tracking.event.checkedIn', { name: event.targetName ?? event.actorName });
      case 'cancelled':
        return event.note
          ? t('rooms.tracking.event.cancelledWithReason', { reason: event.note })
          : t('rooms.tracking.event.cancelled');
      case 'responses_reset':
        return t('rooms.tracking.event.responsesReset', { count: Number(event.note ?? 0) });
      case 'updated':
        return t('rooms.tracking.event.updated', {
          fields: (event.note ?? '')
            .split(',')
            .filter(Boolean)
            .map((field) => t(`rooms.tracking.field.${field}`))
            .join(', '),
        });
      case 'created':
      default:
        return t('rooms.tracking.event.created');
    }
  })();

  return (
    <li className="flex gap-2.5">
      <div className="flex flex-col items-center">
        <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--background-subtle) text-(--text-muted)">
          <Icon className="h-3 w-3" />
        </span>
        {!isLast && <span className="my-0.5 w-px flex-1 bg-(--border)" aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1 pb-2.5">
        <p className="text-xs text-(--text-primary)">
          <span className="font-semibold">{event.actorName}</span>
          {event.actorRole && (
            <span className="text-(--text-muted)">
              {' · '}
              {t(`roles.${event.actorRole}`, { defaultValue: event.actorRole })}
            </span>
          )}
        </p>
        <p className="text-[11px] text-(--text-secondary)">{description}</p>
        <p className="text-[10px] text-(--text-muted)" title={formatAbsolute(event.createdAt)}>
          {formatRelative(event.createdAt)}
        </p>
      </div>
    </li>
  );
}

/** Compact chips for a collapsed booking row: ✓3 ?1 ✗2 ·2 pending. */
export function ResponseSummaryChips({
  counts,
  className,
}: {
  counts: BookingResponseCounts;
  className?: string;
}) {
  const { t } = useTranslation();
  if (counts.total === 0) return null;

  const items = (
    [
      ['accepted', counts.accepted],
      ['tentative', counts.tentative],
      ['declined', counts.declined],
      ['needs_action', counts.needsAction],
    ] as const
  ).filter(([, value]) => value > 0);

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {items.map(([response, value]) => (
        <span
          key={response}
          title={t(`rooms.tracking.status.${response}`)}
          className={cn(
            'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
            RESPONSE_STYLE[response].chip,
          )}
        >
          <ResponseIcon response={response} className="h-2.5 w-2.5" />
          {value}
        </span>
      ))}
    </span>
  );
}

export type { TrackedAttendee };
