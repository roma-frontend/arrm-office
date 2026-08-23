/**
 * How a custom field *looks*. The registry itself lives on the server.
 *
 * `convex/lib/taskCustomFields.ts` owns what a field type is, what values it
 * accepts, and how two values compare — and the client imports that module
 * directly, the way `CreateTicketWizard` imports `convex/lib/ticketFields`. This
 * file adds only the things a Convex module has no business knowing: which icon
 * the field picker shows, which cell component the grid mounts, and how a value
 * reads in the viewer's own language and currency.
 *
 * Keeping the split at exactly that line is the point. A mirrored copy of the
 * registry would drift, and the drift would show up as a value the server
 * accepted and the grid could not render.
 */

import {
  Banknote,
  Calendar,
  CircleDot,
  FileText,
  Gauge,
  Hash,
  Link,
  Mail,
  Percent,
  Phone,
  SquareCheck,
  Star,
  Tags,
  Type,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  FIELD_TYPE_META,
  optionOf,
  ratingMaxOf,
  stringifyFieldValue,
  type TaskFieldLike,
  type TaskFieldType,
} from '../../convex/lib/taskCustomFields';
import { formatDate } from './date-format';

export type {
  TaskFieldType,
  TaskFieldLike,
  TaskFieldOption,
  TaskFieldConfig,
  TaskFieldValue,
} from '../../convex/lib/taskCustomFields';

// ── Icons and names ────────────────────────────────────────────────────────
/** Keyed by the union: a new field type must choose an icon to compile. */
export const FIELD_TYPE_ICONS: Record<TaskFieldType, LucideIcon> = {
  text: Type,
  longText: FileText,
  number: Hash,
  money: Banknote,
  percent: Percent,
  rating: Star,
  progress: Gauge,
  select: CircleDot,
  multiSelect: Tags,
  date: Calendar,
  user: User,
  users: Users,
  checkbox: SquareCheck,
  url: Link,
  email: Mail,
  phone: Phone,
};

/**
 * English names, passed as the second argument to `t()`.
 *
 * The repository's convention is `t(key, fallback)` so a locale that has not
 * caught up renders English rather than the raw key. These are the *type* names,
 * which are translated; the field's own name is whatever the user typed and is
 * never translated.
 */
export const FIELD_TYPE_LABELS: Record<TaskFieldType, string> = {
  text: 'Text',
  longText: 'Long text',
  number: 'Number',
  money: 'Money',
  percent: 'Percent',
  rating: 'Rating',
  progress: 'Progress',
  select: 'Dropdown',
  multiSelect: 'Labels',
  date: 'Date',
  user: 'Person',
  users: 'People',
  checkbox: 'Checkbox',
  url: 'Link',
  email: 'Email',
  phone: 'Phone',
};

export function fieldTypeLabelKey(type: TaskFieldType): string {
  return `tasks.fieldTypes.${type}`;
}

// ── Grid presentation ──────────────────────────────────────────────────────
/**
 * Which cell component the grid mounts.
 *
 * Several field types share one: `text`, `url`, `email` and `phone` are all a
 * single-line input that differs only in validation and in what the read-only
 * state links to, and that difference belongs in the one component rather than
 * in four near-copies.
 */
export type CellKind =
  | 'text'
  | 'longText'
  | 'number'
  | 'select'
  | 'multiSelect'
  | 'date'
  | 'user'
  | 'users'
  | 'checkbox'
  | 'rating'
  | 'progress';

export const FIELD_CELL_KIND: Record<TaskFieldType, CellKind> = {
  text: 'text',
  longText: 'longText',
  number: 'number',
  money: 'number',
  percent: 'number',
  rating: 'rating',
  progress: 'progress',
  select: 'select',
  multiSelect: 'multiSelect',
  date: 'date',
  user: 'user',
  users: 'users',
  checkbox: 'checkbox',
  url: 'text',
  email: 'text',
  phone: 'text',
};

/**
 * Numbers right-align so their digits line up down the column — the one thing
 * that makes an *Amount owed* column scannable. Checkboxes centre; everything
 * else reads from the start edge.
 */
export function fieldAlign(type: TaskFieldType): 'start' | 'end' | 'center' {
  if (type === 'checkbox') return 'center';
  return FIELD_TYPE_META[type].kind === 'number' && type !== 'date' ? 'end' : 'start';
}

/** Tailwind text-alignment class for {@link fieldAlign}. */
export function fieldAlignClass(type: TaskFieldType): string {
  const align = fieldAlign(type);
  return align === 'end' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
}

/**
 * The registry, re-exported so a component has one import to reach for.
 *
 * Width bounds are the reason this block exists: the server stores
 * `taskFields.width` and clamps it on write, so a second copy of the bounds in
 * this file — which is what used to be here — is a column that jumps the first
 * time it renders. The rest are passed through for the same reason, one level up:
 * a grid cell five directories deep should not be reaching across the repository
 * root, and it should certainly not be keeping its own copy of `ratingMaxOf`.
 */
export {
  MIN_COLUMN_WIDTH,
  MAX_COLUMN_WIDTH,
  clampColumnWidth,
  defaultFieldWidth,
  FIELD_TYPE_META,
  TASK_FIELD_TYPES,
  fieldHasOptions,
  compareFieldValues,
  optionOf,
  ratingMaxOf,
} from '../../convex/lib/taskCustomFields';

/**
 * A custom field as a grid needs it: the registry's shape, plus the identity and
 * the layout that only a stored `taskFields` row carries.
 *
 * Structural rather than `Doc<'taskFields'>` on purpose — the same cells then
 * render a field loaded from Convex, one assembled in a test, and one the field
 * editor has not saved yet.
 */
export interface TaskGridField extends TaskFieldLike {
  _id: string;
  width?: number;
  order?: number;
  isActive?: boolean;
}

/** Whether the type is editable by typing, as opposed to picking or toggling. */
export function isTypedField(type: TaskFieldType): boolean {
  const kind = FIELD_CELL_KIND[type];
  return kind === 'text' || kind === 'longText' || kind === 'number';
}

// ── Display formatting ─────────────────────────────────────────────────────
export interface FieldFormatContext {
  /** i18n language, e.g. `ru`. Drives digit grouping, currency and month names. */
  lang: string | undefined;
  /** The organization's currency, used when a money field names none. */
  orgCurrency?: string;
  /** Resolves a user id to a display name; the grid passes its loaded map. */
  resolveUserName?: (id: string) => string | undefined;
}

function localeOf(lang: string | undefined): string {
  // `hy` needs the region to format numbers the way Armenian users expect.
  if (!lang) return 'en-US';
  if (lang === 'hy') return 'hy-AM';
  if (lang === 'ru') return 'ru-RU';
  if (lang === 'de') return 'de-DE';
  return lang === 'en' ? 'en-US' : lang;
}

function formatNumber(value: number, locale: string, precision?: number): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: precision ?? 0,
    maximumFractionDigits: precision ?? 2,
  }).format(value);
}

/**
 * A money amount in the field's own currency — never converted.
 *
 * An *Amount owed* of 1500 AMD is 1500 AMD to everyone who opens the board;
 * running it through the exchange rate that `useCurrency` applies to plan prices
 * would silently restate somebody's invoice. The reader's locale only decides
 * how the digits and the symbol are arranged.
 */
function formatMoney(value: number, locale: string, currency: string, precision?: number): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(value);
  } catch {
    // An unknown or malformed currency code: show the number and the code
    // rather than nothing at all.
    return `${formatNumber(value, locale, precision)} ${currency}`.trim();
  }
}

/**
 * A value as a person should read it. `''` for an empty cell.
 *
 * Not the same as `stringifyFieldValue` in the shared registry: that one is
 * locale-independent and belongs in a CSV, where a German thousands separator
 * would split the column in two.
 */
export function formatFieldValue(
  field: TaskFieldLike,
  value: unknown,
  ctx: FieldFormatContext,
): string {
  if (value === undefined || value === null || value === '') return '';
  if (Array.isArray(value) && value.length === 0) return '';

  const locale = localeOf(ctx.lang);
  const { precision, currency, prefix, suffix } = field.config ?? {};

  switch (field.type) {
    case 'money':
      return formatMoney(Number(value), locale, currency || ctx.orgCurrency || 'USD', precision);

    case 'number': {
      const body = formatNumber(Number(value), locale, precision);
      return `${prefix ?? ''}${body}${suffix ?? ''}`;
    }

    case 'percent':
      return `${formatNumber(Number(value), locale, precision)}%`;

    case 'progress':
      return `${Math.round(Number(value))}%`;

    case 'rating':
      return `${Number(value)}/${ratingMaxOf(field)}`;

    case 'date':
      return formatDate(Number(value), ctx.lang, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

    case 'user': {
      const name = ctx.resolveUserName?.(String(value));
      // An id the caller could not resolve means a removed colleague; an em dash
      // is honest, where printing the raw id would look like corruption.
      return name ?? '—';
    }

    case 'users':
      return Array.isArray(value)
        ? value
            .map((id) => ctx.resolveUserName?.(String(id)))
            .filter((name): name is string => !!name)
            .join(', ')
        : '';

    case 'select':
      return optionOf(field, value)?.label ?? '';

    case 'multiSelect':
      return Array.isArray(value)
        ? value
            .map((id) => optionOf(field, id)?.label)
            .filter((label): label is string => !!label)
            .join(', ')
        : '';

    // `checkbox` renders as a control rather than as text, and the remaining
    // string types need no locale treatment.
    default:
      return stringifyFieldValue(field, value);
  }
}
