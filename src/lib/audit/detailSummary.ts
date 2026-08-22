/**
 * One readable line out of an audit row's `details` payload.
 *
 * Extracted from `ActivityFeed` so the dashboard widget and the full audit page
 * describe the same event with the same sentence. It keeps the existing
 * `activityFeed.details.*` translation keys on purpose: those strings are
 * already translated into all four locales and already asserted by
 * `ActivityFeed.test.tsx`.
 *
 * Pure: no React, no DOM. `t` is passed in so the caller owns the i18n instance.
 */

import type { TFunction } from 'i18next';

/** `t` from `useTranslation()`, narrowed to the two call shapes used here. */
export type AuditTFunc = TFunction | ((key: string, options?: Record<string, unknown>) => string);

/**
 * Ids, hashes and timestamps read as noise in a one-line summary — the row
 * already shows the actor, the target and the time in dedicated columns.
 */
export const NOISY_DETAIL_KEYS = new Set([
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

/**
 * Returns '' when nothing user-facing can be extracted — callers then fall back
 * to the action label rather than printing `{}`.
 *
 * The special cases come first because a generic key/value dump of the same
 * payload reads far worse: `Temp access: Ann · ann@x.io` beats `Ann · ann@x.io`.
 */
export function summarizeAuditDetails(
  details: Record<string, unknown>,
  rawAction: string,
  t: AuditTFunc,
): string {
  const translate = t as (key: string, options?: Record<string, unknown>) => string;

  // Temp-access tokens carry a human + email — surface those.
  if (typeof details.tempName === 'string') {
    const who = [details.tempName, typeof details.tempEmail === 'string' ? details.tempEmail : null]
      .filter(Boolean)
      .join(' · ');
    return translate('activityFeed.details.tempAccess', {
      who,
      defaultValue: 'Temp access: {{who}}',
    });
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
    return translate(key, { count: details.durationDays, defaultValue: fallback });
  }

  if (typeof details.messagesRead === 'number') {
    return translate('activityFeed.details.messagesRead', {
      count: details.messagesRead,
      defaultValue: 'Marked {{count}} messages as read',
    });
  }

  if (Array.isArray(details.updatedFields) && details.updatedFields.length > 0) {
    const shown = details.updatedFields.slice(0, 3).map(String).join(', ');
    const rest = details.updatedFields.length - 3;
    const more =
      rest > 0
        ? `, ${translate('activityFeed.details.moreFields', {
            count: rest,
            defaultValue: '+{{count}} more',
          })}`
        : '';
    return (
      translate('activityFeed.details.updatedFields', {
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
