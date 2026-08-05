/**
 * Resolves a stored notification row into text in the reader's language.
 *
 * Notifications are written on the server (see `convex/lib/notify.ts`) long
 * before anyone reads them, so the text cannot be baked in at write time.
 * Each row carries i18n keys plus interpolation params in `metadata`; this is
 * the single place that turns them back into strings.
 *
 * Resolution order, most to least specific:
 *   1. `metadata.titleKey` / `metadata.messageKey` — set by `notify()`.
 *   2. The stored `title` / `message`, for any type this system writes itself.
 *      `notify()` documents those columns as the deliberate fallback, and they
 *      say something concrete ("Your leave was approved"), unlike the generic
 *      per-type label ("New Leave Request") that would replace them.
 *   3. `notifications.types.<type>` — the generic per-type label. Only reached
 *      for rows whose type this system no longer writes (legacy or imported
 *      data), where a translated category name is all we can offer and the
 *      stored English text may be missing entirely.
 */
import type { TFunction } from 'i18next';
import { NOTIFICATION_TYPES } from '../../convex/lib/notify';

/** The subset of a notification row needed to render its text. */
export interface NotificationTextSource {
  type: string;
  title: string;
  message: string;
  metadata?: string;
}

interface NotificationMeta {
  titleKey?: string;
  messageKey?: string;
  params?: Record<string, string | number>;
}

/**
 * Types written by `convex/lib/notify.ts` today. For these the stored English
 * title beats `notifications.types.<type>`; see the resolution order above.
 */
const SELF_WRITTEN_TYPES: ReadonlySet<string> = new Set(NOTIFICATION_TYPES);

function parseMeta(metadata?: string): NotificationMeta {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as NotificationMeta;
  } catch {
    return {};
  }
}

/**
 * Translates a key, but treats a result identical to the key as a miss so the
 * caller can fall back. i18next returns the key itself when nothing resolves,
 * which would otherwise render `notifications.titles.leaveApproved` on screen.
 */
function translate(
  t: TFunction,
  key: string | undefined,
  params: Record<string, string | number>,
): string | null {
  if (!key) return null;
  const value = String(t(key, { ...params, defaultValue: '' }));
  return value && value !== key ? value : null;
}

export function notificationTitle(t: TFunction, n: NotificationTextSource): string {
  const { titleKey, params } = parseMeta(n.metadata);
  // Legacy/imported rows only: for our own types the stored title is preferred.
  const typeKey = SELF_WRITTEN_TYPES.has(n.type) ? undefined : `notifications.types.${n.type}`;
  return translate(t, titleKey, params ?? {}) ?? translate(t, typeKey, params ?? {}) ?? n.title;
}

export function notificationMessage(t: TFunction, n: NotificationTextSource): string {
  const { messageKey, params } = parseMeta(n.metadata);
  return translate(t, messageKey, params ?? {}) ?? n.message;
}
