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

export default crons;
