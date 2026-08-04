/**
 * Localized notification writer.
 *
 * Notifications are created on the server, but rendered much later in whatever
 * language the reader has selected — so the text cannot be baked in at write
 * time. Instead every notification carries i18n keys plus their interpolation
 * params in `metadata`, and the client resolves them through i18next against
 * the `common` namespace (`notifications.titles.*` / `notifications.messages.*`).
 *
 * `title` / `message` are still written as English text. They are the fallback
 * for rows created before this helper existed, for e-mail/Telegram digests that
 * have no i18n runtime, and for any key that goes missing after a refactor.
 *
 * Params are interpolated client-side, so pass raw values (names, dates,
 * counts) — never pre-formatted sentences. To translate an enum value inside a
 * message, reference it from the locale string with i18next nesting, e.g.
 * `"$t(leaveTypes.{{type}})"`, and pass `{ type: 'sick' }` here.
 */

import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

/** Values safe to interpolate into a translated string. */
export type NotifyParams = Record<string, string | number>;

/** Notification kinds accepted by the `notifications` table. */
export type NotificationType =
  | 'leave_request'
  | 'leave_approved'
  | 'leave_rejected'
  | 'driver_request'
  | 'driver_request_approved'
  | 'driver_request_rejected'
  | 'employee_added'
  | 'join_request'
  | 'join_approved'
  | 'join_rejected'
  | 'security_alert'
  | 'status_change'
  | 'message_mention'
  | 'system'
  | 'review_deadline'
  | 'okr_checkin_reminder'
  | 'survey_auto_activated'
  | 'survey_auto_closed'
  | 'onboarding_task_due'
  | 'onboarding_started'
  | 'onboarding_manager_assigned'
  | 'onboarding_buddy_assigned'
  | 'onboarding_task_overdue'
  | 'asset_assigned'
  | 'room_booked'
  | 'room_booking_cancelled';

export interface NotifyArgs {
  organizationId?: Id<'organizations'>;
  userId: Id<'users'>;
  type: NotificationType;
  /** i18n key under `notifications.titles.*` (full path, e.g. `notifications.titles.leaveApproved`). */
  titleKey: string;
  /** i18n key under `notifications.messages.*`. Omit when the title says it all. */
  messageKey?: string;
  /** Interpolation values shared by both keys. */
  params?: NotifyParams;
  /** English text used when a key cannot be resolved. */
  fallbackTitle: string;
  fallbackMessage: string;
  relatedId?: string;
  route?: string;
  /** Extra data merged into `metadata` next to the i18n keys. */
  extra?: Record<string, unknown>;
  /** Defaults to the current time; pass a shared `now` to keep a batch aligned. */
  createdAt?: number;
}

/**
 * Inserts one notification with its translation keys attached.
 *
 * Returns the new row id so call-sites can keep referencing it (a few schedule
 * follow-up work off the notification).
 */
export async function notify(ctx: MutationCtx, args: NotifyArgs): Promise<Id<'notifications'>> {
  const {
    organizationId,
    userId,
    type,
    titleKey,
    messageKey,
    params,
    fallbackTitle,
    fallbackMessage,
    relatedId,
    route,
    extra,
    createdAt,
  } = args;

  const metadata: Record<string, unknown> = { ...(extra ?? {}), titleKey };
  if (messageKey) metadata.messageKey = messageKey;
  if (params && Object.keys(params).length > 0) metadata.params = params;

  return await ctx.db.insert('notifications', {
    organizationId,
    userId,
    type,
    title: fallbackTitle,
    message: fallbackMessage,
    isRead: false,
    relatedId,
    route,
    metadata: JSON.stringify(metadata),
    createdAt: createdAt ?? Date.now(),
  });
}
