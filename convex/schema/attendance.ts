import { defineTable } from 'convex/server';
import { v } from 'convex/values';

/**
 * Daily attendance entries — the system that backs the HR Assistant bot's
 * morning digest and the per-user status picker in the chat composer.
 *
 * Why a separate table (not just `leaveRequests`):
 *   - leave = planned absence. leave covers 'today' through 'endDate' once HR
 *     approves, but covers nothing for "I am working from home today" or "I am
 *     on a one-day business trip". Those need a row per day, with an
 *     `isAllDay` marker and a `status` so the bot can decide what to print.
 *   - attendance entries are the source of truth the morning digest renders;
 *     leaves are an *input* into the digest (an approved leave on date X
 *     suppresses / overrides an attendance entry for the same day).
 *
 * Statuses mirror how a manager would think about a person on any given day:
 *   - `office` — present at the workplace (default; rarely stored explicitly
 *     because absence is the interesting case).
 *   - `wfh` — work from home.
 *   - `business_trip` — travelling for work; the bot shows ✈️ next to it.
 *   - `sick` — sick day, counted against the leave balance by an external
 *     payroll step (the digest just surfaces the count).
 *   - `leave` — covers a half-day or a different cut than the leave request
 *     implies (e.g. leaving at lunch on the last working day before a leave).
 *   - `holiday` — public holiday; populated by the digest, never set by hand.
 *
 * The morning digest uses the latest row per (userId, date); later rows
 * replace earlier ones so a person can switch from `office` to `wfh` at
 * 9:15 without leaving yesterday's digest stale.
 */
export const attendance = {
  attendanceEntries: defineTable({
    organizationId: v.id('organizations'),
    userId: v.id('users'),
    /** ISO date `YYYY-MM-DD` in the user's local timezone. */
    date: v.string(),
    type: v.union(
      v.literal('office'),
      v.literal('wfh'),
      v.literal('business_trip'),
      v.literal('sick'),
      v.literal('leave'),
      v.literal('holiday'),
    ),
    /** Free-form note — "doctor appointment", "offsite at Acme HQ", etc. */
    note: v.optional(v.string()),
    /** True for entries that span the whole day (default for office/wfh/etc.). */
    isAllDay: v.optional(v.boolean()),
    /** Optional start time in `HH:MM` — set when the entry covers only part of
     *  the day (e.g. "office until 14:00, then sick"). */
    startTime: v.optional(v.string()),
    /** Optional end time in `HH:MM`. */
    endTime: v.optional(v.string()),
    /** Who set this entry. Equals `userId` for self-service; differs when
     *  HR sets it on someone's behalf (e.g. marking sick leave after a
     *  call). */
    createdBy: v.id('users'),
    /**
     * HR approval status. `auto` (default) covers statuses that don't need a
     *  reviewer — office, wfh, sick with a balance, holidays. `pending` /
     *  `approved` / `rejected` apply to statuses that affect payroll / leave
     *  balance (business_trip, leave).
     */
    status: v.union(
      v.literal('auto'),
      v.literal('pending'),
      v.literal('approved'),
      v.literal('rejected'),
    ),
    /** Optional link back to the leave / overtime / trip request this entry
     *  was generated from. Kept loose — we don't reference concrete tables
     *  here so the schema isn't coupled to leaves/overtime/trips refactors. */
    sourceRequestId: v.optional(v.string()),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_org', ['organizationId'])
    .index('by_org_date', ['organizationId', 'date'])
    .index('by_user_date', ['userId', 'date'])
    .index('by_user_date_org', ['userId', 'organizationId', 'date'])
    .index('by_org_date_status', ['organizationId', 'date', 'status']),

  /**
   * The bot's last-rendered digest message per org, per day. The morning cron
   * overwrites the message text in place (via `chatMessages.patch`) so the
   * channel doesn't get spammed — readers always see "today's attendance"
   * pinned at the bottom rather than a long history of prior digests.
   */
  attendanceDigestMessages: defineTable({
    organizationId: v.id('organizations'),
    /** ISO date `YYYY-MM-DD` the digest covers. */
    date: v.string(),
    conversationId: v.id('chatConversations'),
    messageId: v.id('chatMessages'),
    /** Last time the digest was rendered. Used to throttle re-renders. */
    renderedAt: v.number(),
  })
    .index('by_org_date', ['organizationId', 'date'])
    .index('by_org', ['organizationId']),
};
