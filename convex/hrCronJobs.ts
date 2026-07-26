/**
 * Scheduled jobs for HR modules:
 * - Performance review deadline notifications
 * - OKR weekly check-in reminders
 * - Survey auto-activation/closure
 * - Onboarding task activation & overdue reminders
 */

import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// Check for performance review deadlines approaching (daily at 9 AM)
crons.daily(
  'performance-deadline-checks',
  { hourUTC: 9, minuteUTC: 0 },
  internal.performance.checkDeadlineNotifications,
);

// OKR weekly check-in reminders (Monday at 10 AM)
crons.weekly(
  'okr-checkin-reminders',
  { dayOfWeek: 'monday', hourUTC: 10, minuteUTC: 0 },
  internal.goals.sendWeeklyCheckinReminders,
);

// Survey auto-activation (every hour)
crons.interval('survey-auto-activation', { hours: 1 }, internal.surveys.activateScheduledSurveys);

// Survey auto-closure (every hour)
crons.interval('survey-auto-closure', { hours: 1 }, internal.surveys.closeExpiredSurveys);

// Onboarding task activation (every hour)
crons.interval(
  'onboarding-task-activation',
  { hours: 1 },
  internal.onboarding.activateOnboardingTasks,
);

// Onboarding overdue task reminders (daily at 9 AM)
crons.daily(
  'onboarding-overdue-reminders',
  { hourUTC: 9, minuteUTC: 0 },
  internal.onboarding.sendOnboardingOverdueReminders,
);

// Weekly newsletter (Monday at 9 AM UTC)
crons.weekly(
  'weekly-newsletter',
  { dayOfWeek: 'monday', hourUTC: 9, minuteUTC: 0 },
  internal.newsletter.sendWeeklyDigest,
);

// Newsletter drip campaign (every 12 hours)
crons.interval('newsletter-drip', { hours: 12 }, internal.newsletter.processDripCampaign);

// ── Asset Management Reminders ────────────────────────────

// Check for assets with warranty expiring in the next 30 days (daily at 8 AM)
crons.daily(
  'asset-warranty-reminders',
  { hourUTC: 8, minuteUTC: 0 },
  internal.assets.checkWarrantyReminders,
);

// Check for scheduled maintenance due today (daily at 8 AM)
crons.daily(
  'asset-maintenance-reminders',
  { hourUTC: 8, minuteUTC: 30 },
  internal.assets.checkMaintenanceReminders,
);

export default crons;
