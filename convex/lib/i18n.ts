/**
 * Translation for server-side code that has no i18next and no filesystem.
 *
 * Convex functions run in a sandboxed runtime without `fs`, so they cannot read
 * `public/locales/*.json` the way `src/lib/i18n/server-translation.ts` does.
 * The strings they need are therefore compiled into `localeCatalog.ts` by
 * `npm run build:convex-locales`; this module is the lookup on top of it.
 *
 * Feature parity with the client matters here: notification text is authored
 * once and read through both paths, so this resolves the same two constructs
 * i18next does — `{{param}}` interpolation and `$t(other.key)` nesting. Without
 * nesting, `"$t(leaveTypes.{{type}})"` would reach the reader verbatim.
 */

import { LOCALE_CATALOG, type CatalogLocale } from './localeCatalog';

export type { CatalogLocale };

/** Values safe to interpolate into a translated string. */
export type TranslateParams = Record<string, string | number>;

const FALLBACK_LOCALE: CatalogLocale = 'en';

/** Guards against an unbounded `$t()` chain (a key that nests itself). */
const MAX_NESTING_DEPTH = 4;

/**
 * Narrows an arbitrary stored language to one the catalog actually has.
 *
 * `users.language` is a free-form string, so it can hold a locale that was
 * never translated, a regional tag, or nothing at all.
 */
export function toCatalogLocale(language: string | undefined | null): CatalogLocale {
  if (!language) return FALLBACK_LOCALE;
  const base = language.toLowerCase().split(/[-_]/)[0];
  return base && base in LOCALE_CATALOG ? (base as CatalogLocale) : FALLBACK_LOCALE;
}

function lookup(locale: CatalogLocale, key: string): string | undefined {
  // `LOCALE_CATALOG` is typed as `Record<string, Record<string, string>>`, so
  // under `noUncheckedIndexedAccess` both levels can be undefined even though a
  // `CatalogLocale` is always present in practice.
  const value = LOCALE_CATALOG[locale]?.[key];
  if (typeof value === 'string') return value;
  // A locale can legitimately lag behind `en` for a newly added key.
  const fallback = LOCALE_CATALOG[FALLBACK_LOCALE]?.[key];
  return typeof fallback === 'string' ? fallback : undefined;
}

function interpolate(text: string, params: TranslateParams): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (whole, name: string) => {
    const value = params[name];
    // Leave the placeholder untouched when the caller passed nothing for it —
    // an visible `{{name}}` is a louder bug than a silent empty string.
    return value === undefined ? whole : String(value);
  });
}

/**
 * Resolves `$t(some.key)` references, innermost params first.
 *
 * Params are interpolated before the reference is read so that
 * `$t(leaveTypes.{{type}})` becomes `$t(leaveTypes.sick)` and then the
 * translated noun.
 */
function resolveNesting(
  locale: CatalogLocale,
  text: string,
  params: TranslateParams,
  depth: number,
): string {
  if (depth >= MAX_NESTING_DEPTH || !text.includes('$t(')) return text;

  const replaced = text.replace(/\$t\(([^)]+)\)/g, (whole, rawKey: string) => {
    const nestedKey = interpolate(rawKey.trim(), params);
    const nestedValue = lookup(locale, nestedKey);
    if (nestedValue === undefined) return whole;
    return resolveNesting(locale, interpolate(nestedValue, params), params, depth + 1);
  });

  return replaced;
}

/**
 * Translates `key` into `locale`, or returns null when the key is unknown.
 *
 * Null rather than the key itself: callers hold an English fallback written at
 * the same time as the key, which reads far better than `notifications.x.y`.
 */
export function translateOrNull(
  locale: CatalogLocale,
  key: string,
  params: TranslateParams = {},
): string | null {
  const raw = lookup(locale, key);
  if (raw === undefined) return null;
  return resolveNesting(locale, interpolate(raw, params), params, 0);
}

/** Translates `key`, falling back to `fallback` when it is missing. */
export function translate(
  locale: CatalogLocale,
  key: string,
  params: TranslateParams = {},
  fallback = key,
): string {
  return translateOrNull(locale, key, params) ?? fallback;
}
