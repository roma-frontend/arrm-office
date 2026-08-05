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

export default crons;
