/**
 * Cron registration entry point.
 *
 * Convex only picks up scheduled jobs from `convex/crons.ts` — a `cronJobs()`
 * object exported from any other module is never registered. Jobs defined
 * elsewhere in this directory (see `hrCronJobs.ts`, `backups.cron.ts`) are
 * therefore dormant until they are wired in here.
 *
 * Every job runs through `operatorTools.dispatchCron`, the single gate that
 * honours the operator's pause flag (Scheduled Ops console) and records
 * `lastRunAt` / outcome on the registry row. Pausing a job in the console
 * therefore actually stops its next scheduled fire — no deploy needed.
 * The job key is passed as args so the dispatcher knows which job to run.
 */

import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

const dispatch = internal.superadmin.operatorTools.dispatchCron;

// Sweep every organization's enabled integrations and run the ones whose
// `syncSchedule` cron is due. Hourly, so schedules resolve to the hour.
crons.interval('integration-scheduled-syncs', { hours: 1 }, dispatch, {
  jobKey: 'integration-scheduled-syncs',
});

// Signed documents are archived to permanent storage by the client (PDF
// rendering is browser-only). If a signer closes the tab straight after signing,
// the document ends up legally complete with no archived copy — this nightly
// sweep notifies the creator so the gap is closed instead of going unnoticed.
crons.daily('signature-archive-sweep', { hourUTC: 2, minuteUTC: 30 }, dispatch, {
  jobKey: 'signature-archive-sweep',
});

// Onboarding tasks become due on their `dayOffset`; this notifies the assignee
// when that moment arrives. Hourly, matching the granularity of the check
// window inside the mutation (due within the last day, still pending).
crons.interval('onboarding-task-activation', { hours: 1 }, dispatch, {
  jobKey: 'onboarding-task-activation',
});

// One daily nudge per overdue onboarding task (the mutation itself suppresses
// repeats within 24h), so a stalled adaptation surfaces instead of going quiet.
crons.daily('onboarding-overdue-reminders', { hourUTC: 9, minuteUTC: 0 }, dispatch, {
  jobKey: 'onboarding-overdue-reminders',
});

// Mirror for departures: warn the manager while the last working day is close
// and checklist items (access revocation, equipment return) are still open.
crons.daily('offboarding-last-day-reminders', { hourUTC: 9, minuteUTC: 15 }, dispatch, {
  jobKey: 'offboarding-last-day-reminders',
});

// Probation periods get one heads-up per threshold (20/15/10/5 days left) so
// HR can review and extend from the notification link; a period whose end date
// passes without a decision auto-passes on the next sweep.
crons.daily('probation-deadline-reminders', { hourUTC: 9, minuteUTC: 30 }, dispatch, {
  jobKey: 'probation-deadline-reminders',
});

// Reward vouchers lapse on their own date; without a sweep an unused one sits
// "issued" forever, keeps its pool code locked and inflates the outstanding
// figures the reward budget is judged on. Points are deliberately not refunded.
crons.daily('reward-voucher-expiry', { hourUTC: 1, minuteUTC: 0 }, dispatch, {
  jobKey: 'reward-voucher-expiry',
});

// Dated news entries (birthdays, office events) reach the feed on their own day.
// Hourly rather than daily: an entry added for today should appear within the
// hour, and a run missed to a deploy is caught up on the next pass instead of
// skipping the day. The mutation itself is idempotent per occurrence.
crons.interval('news-schedule-publish', { hours: 1 }, dispatch, {
  jobKey: 'news-schedule-publish',
});

// The other half of the same promise: a post whose last day has passed is taken
// down rather than left to sit in the archive. Runs shortly after the hour so it
// follows the publishing pass.
crons.interval('news-schedule-expiry', { hours: 1 }, dispatch, { jobKey: 'news-schedule-expiry' });

// Recurring task series produce their occurrence on each day the rule lands on.
// Hourly for the same reasons as the news sweep: a series created for today
// should appear within the hour, and a pass lost to a deploy is caught up on the
// next one. The mutation is idempotent per day, so overlapping runs cannot
// produce the same task twice.
crons.interval('recurring-tasks-generate', { hours: 1 }, dispatch, {
  jobKey: 'recurring-tasks-generate',
});

// Performance review deadlines nudge the reviewer before the window closes;
// the mutation suppresses repeats within 24h per review.
crons.daily('performance-deadline-checks', { hourUTC: 9, minuteUTC: 0 }, dispatch, {
  jobKey: 'performance-deadline-checks',
});

// OKR weekly check-in reminders (Monday morning) for key results with a
// check-in due; the mutation suppresses repeats within a week.
crons.weekly(
  'okr-checkin-reminders',
  { dayOfWeek: 'monday', hourUTC: 10, minuteUTC: 0 },
  dispatch,
  { jobKey: 'okr-checkin-reminders' },
);

// Surveys with a scheduled start/end flip state on their own; the creator is
// notified either way so a silent survey never looks like a bug.
crons.interval('survey-auto-activation', { hours: 1 }, dispatch, {
  jobKey: 'survey-auto-activation',
});
crons.interval('survey-auto-closure', { hours: 1 }, dispatch, {
  jobKey: 'survey-auto-closure',
});

// Asset warranty reminders fire once per threshold (30/15/7/1 days left);
// maintenance reminders nudge daily while a scheduled job is due or overdue,
// mirroring the onboarding-overdue daily nudge.
crons.daily('asset-warranty-reminders', { hourUTC: 8, minuteUTC: 0 }, dispatch, {
  jobKey: 'asset-warranty-reminders',
});
crons.daily('asset-maintenance-reminders', { hourUTC: 8, minuteUTC: 30 }, dispatch, {
  jobKey: 'asset-maintenance-reminders',
});

// Room booking meeting reminders — every 10 minutes, check for bookings
// starting in the next 15 min and notify organizers + attendees with the
// video conference platform link when available.
crons.interval('room-meeting-reminders', { minutes: 10 }, dispatch, {
  jobKey: 'room-meeting-reminders',
});

// Maintenance windows open on their `startsAt`, close past `endsAt`, and fire
// the pre-window broadcast once. Was every 5 minutes (288 function calls/day);
// while the project is pre-revenue a ±30 min activation window is acceptable —
// tighten back to { minutes: 5 } when maintenance windows are actively used.
crons.interval(
  'operator-maintenance-sweep',
  { minutes: 30 },
  internal.superadmin.operatorToolsInternal.maintenanceSweep,
);

export default crons;
