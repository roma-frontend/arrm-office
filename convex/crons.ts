/**
 * Cron registration entry point.
 *
 * Convex only picks up scheduled jobs from `convex/crons.ts` — a `cronJobs()`
 * object exported from any other module is never registered. Jobs defined
 * elsewhere in this directory (see `hrCronJobs.ts`, `backups.cron.ts`) are
 * therefore dormant until they are wired in here.
 *
 * Only the integration sweep is registered for now: the other files schedule
 * outward-facing side effects (newsletter delivery, org backups) that must not
 * be switched on implicitly.
 *
 * Exception: the two onboarding jobs below. They only write in-app
 * notifications for people who already have onboarding tasks assigned, so there
 * is no outward-facing side effect — and while they were dormant the whole
 * "task due / task overdue" half of onboarding never fired.
 */

import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// Sweep every organization's enabled integrations and run the ones whose
// `syncSchedule` cron is due. Hourly, so schedules resolve to the hour.
crons.interval(
  'integration-scheduled-syncs',
  { hours: 1 },
  internal.integrations.runScheduledSyncs,
);

// Signed documents are archived to permanent storage by the client (PDF
// rendering is browser-only). If a signer closes the tab straight after signing,
// the document ends up legally complete with no archived copy — this nightly
// sweep notifies the creator so the gap is closed instead of going unnoticed.
crons.daily(
  'signature-archive-sweep',
  { hourUTC: 2, minuteUTC: 30 },
  internal.signatures.sweepUnarchivedDocuments,
);

// Onboarding tasks become due on their `dayOffset`; this notifies the assignee
// when that moment arrives. Hourly, matching the granularity of the check
// window inside the mutation (due within the last day, still pending).
crons.interval(
  'onboarding-task-activation',
  { hours: 1 },
  internal.onboarding.activateOnboardingTasks,
);

// One daily nudge per overdue onboarding task (the mutation itself suppresses
// repeats within 24h), so a stalled adaptation surfaces instead of going quiet.
crons.daily(
  'onboarding-overdue-reminders',
  { hourUTC: 9, minuteUTC: 0 },
  internal.onboarding.sendOnboardingOverdueReminders,
);

// Mirror for departures: warn the manager while the last working day is close
// and checklist items (access revocation, equipment return) are still open.
crons.daily(
  'offboarding-last-day-reminders',
  { hourUTC: 9, minuteUTC: 15 },
  internal.offboarding.sendOffboardingReminders,
);

// Reward vouchers lapse on their own date; without a sweep an unused one sits
// "issued" forever, keeps its pool code locked and inflates the outstanding
// figures the reward budget is judged on. Points are deliberately not refunded.
crons.daily('reward-voucher-expiry', { hourUTC: 1, minuteUTC: 0 }, internal.rewards.expireVouchers);

// Dated news entries (birthdays, office events) reach the feed on their own day.
// Hourly rather than daily: an entry added for today should appear within the
// hour, and a run missed to a deploy is caught up on the next pass instead of
// skipping the day. The mutation itself is idempotent per occurrence.
crons.interval('news-schedule-publish', { hours: 1 }, internal.newsSchedule.publishDueEntries);

// The other half of the same promise: a post whose last day has passed is taken
// down rather than left to sit in the archive. Runs shortly after the hour so it
// follows the publishing pass.
crons.interval('news-schedule-expiry', { hours: 1 }, internal.newsSchedule.expireAnnouncements);

export default crons;
