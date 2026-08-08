import {
  Cake,
  Calendar,
  FileText,
  Megaphone,
  MessageCircle,
  Newspaper,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

export type NewsCategory =
  | 'news'
  | 'announcement'
  | 'event'
  | 'birthday'
  | 'achievement'
  | 'policy'
  | 'general';

/**
 * Category presentation, shared by the feed and the composer so a colour never
 * means two different things on the same screen.
 */
export const CATEGORY_CONFIG: Record<
  NewsCategory,
  { icon: LucideIcon; color: string; labelKey: string }
> = {
  news: { icon: Newspaper, color: '#3b82f6', labelKey: 'news.category.news' },
  announcement: { icon: Megaphone, color: '#8b5cf6', labelKey: 'news.category.announcement' },
  event: { icon: Calendar, color: '#f59e0b', labelKey: 'news.category.event' },
  birthday: { icon: Cake, color: '#ec4899', labelKey: 'news.category.birthday' },
  achievement: { icon: Trophy, color: '#10b981', labelKey: 'news.category.achievement' },
  policy: { icon: FileText, color: '#06b6d4', labelKey: 'news.category.policy' },
  general: { icon: MessageCircle, color: '#6b7280', labelKey: 'news.category.general' },
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_CONFIG) as NewsCategory[];

/**
 * Accent for controls that are not tied to a category.
 *
 * `--primary` is the theme's accent and is now guaranteed to be a colour rather
 * than a gradient — see the note next to its definition in `globals.css`, where
 * holding a `linear-gradient` there used to make every `bg-primary` utility in
 * the app paint nothing in the light theme.
 */
export const ACCENT = 'var(--primary)';

export const EMOJI_REACTIONS = ['👍', '❤️', '🎉', '🔥', '👏', '😮', '😂'] as const;

/**
 * Relative time in the reader's language.
 *
 * The previous helper returned hardcoded English ("just now", "5m ago") in the
 * middle of a translated feed. `Intl.RelativeTimeFormat` is in every supported
 * browser and needs no dependency.
 */
export function relativeTime(timestamp: number, locale: string): string {
  const diffMs = timestamp - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;

  if (abs < minute) return rtf.format(Math.round(diffMs / 1000), 'second');
  if (abs < hour) return rtf.format(Math.round(diffMs / minute), 'minute');
  if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour');
  if (abs < week) return rtf.format(Math.round(diffMs / day), 'day');
  if (abs < month) return rtf.format(Math.round(diffMs / week), 'week');
  return new Date(timestamp).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}
