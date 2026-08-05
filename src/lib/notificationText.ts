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
 *   2. `notifications.types.<type>` — the generic per-type label, which only
 *      helps rows predating `notify()`. Skipped for the catch-all types, where
 *      it says nothing: most old call-sites wrote type `system`, so the label
 *      reads "System Notification" for everything from a birthday greeting to a
 *      locked account. There the stored English title is the better of two
 *      imperfect options.
 *   3. The stored `title` / `message` — English, but better than a raw key.
 */
import type { TFunction } from 'i18next';

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

/** Types too broad for `notifications.types.<type>` to describe a single row. */
const VAGUE_TYPES = new Set(['system', 'status_change']);

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
  const typeKey = VAGUE_TYPES.has(n.type) ? undefined : `notifications.types.${n.type}`;
  return translate(t, titleKey, params ?? {}) ?? translate(t, typeKey, params ?? {}) ?? n.title;
}

export function notificationMessage(t: TFunction, n: NotificationTextSource): string {
  const { messageKey, params } = parseMeta(n.metadata);
  return translate(t, messageKey, params ?? {}) ?? n.message;
}
