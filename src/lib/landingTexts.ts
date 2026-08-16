/**
 * Landing text helpers — flatten/nest/inject, shared by:
 *   - the SSR entry (app/page.tsx injects published overrides into the i18next
 *     instance BEFORE rendering, so the server HTML already carries them),
 *   - the client live hook (re-injects when a superadmin publishes),
 *   - the editor (flattens the EN bundle to build the editable key catalog).
 *
 * Every key lives in the `landing` i18n namespace (each locale's landing.json
 * is that namespace's bundle, and the landing's `t('landing.heroTitle')` etc.
 * resolve inside it). Overrides are therefore injected with:
 *   i18n.addResourceBundle(locale, 'landing', nested, true, true)
 */

import type { TFunction } from 'i18next';
// Plain i18next singleton — the same instance react-i18next's useTranslation
// reads by default. Importing '@/i18n/config' here would run the react binding
// (i18n.use(initReactI18next)), which breaks in environments where react-i18next
// is mocked (server tests). addResourceBundle works on the shared instance
// regardless of whether the react plugin was ever attached.
import i18n from 'i18next';

import landingEn from '../../public/locales/en/landing.json';
import landingRu from '../../public/locales/ru/landing.json';
import landingDe from '../../public/locales/de/landing.json';
import landingHy from '../../public/locales/hy/landing.json';

export type LandingLocale = 'en' | 'ru' | 'de' | 'hy';
export const LANDING_LOCALES: LandingLocale[] = ['en', 'ru', 'de', 'hy'];

/** The bundled landing namespace per locale — the default copy. */
export const LANDING_BUNDLES: Record<LandingLocale, Record<string, unknown>> = {
  en: landingEn as Record<string, unknown>,
  ru: landingRu as Record<string, unknown>,
  de: landingDe as Record<string, unknown>,
  hy: landingHy as Record<string, unknown>,
};

type Leaf = string | number | boolean;

/** Walk an object and emit `dotted.path` → leaf value. Arrays become `path.0`. */
export function flattenLeafKeys(
  obj: Record<string, unknown>,
  prefix = '',
  out: Record<string, Leaf> = {},
): Record<string, Leaf> {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      flattenLeafKeys(value as Record<string, unknown>, path, out);
    } else if (typeof value !== 'function' && value !== undefined) {
      out[path] = value as Leaf;
    }
  }
  return out;
}

/** Convert a flat `dotted.path` → value map back into a nested bundle. */
export function nestFromFlat(flat: Record<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    const segments = path.split('.');
    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i]!;
      const next = segments[i + 1]!;
      // Digits become array slots so `faq.items.0.q` nests into an array.
      if (/^\d+$/.test(next)) {
        cursor[seg] ??= [];
      } else {
        cursor[seg] ??= {};
      }
      cursor = cursor[seg] as Record<string, unknown>;
    }
    cursor[segments[segments.length - 1]!] = value;
  }
  return root;
}

/**
 * Inject published overrides for one locale into the i18next `landing`
 * namespace. Replaces the namespace's overridden keys wholesale: the merged
 * bundle is built from the default + published overrides, so unpublishing a key
 * (dropping it from `overrides`) correctly restores the bundled copy.
 */
export function applyLandingOverrides(locale: LandingLocale, overrides: Record<string, string>) {
  const merged = mergeDeep(LANDING_BUNDLES[locale], nestFromFlat(overrides));
  // The merged bundle is COMPLETE (defaults + overrides), so a shallow
  // overwrite is the correct semantics. `deep=true` would merge into the
  // existing bundle where i18next's deepExtend ignores the overwrite flag for
  // pre-existing keys — which made unpublishing/resetting silently fail (the
  // old value survived).
  i18n.addResourceBundle(locale, 'landing', merged, false, true);
}

/** Deep merge `patch` into `base` (patch wins), arrays merged by index. */
export function mergeDeep(base: unknown, patch: unknown): Record<string, unknown> {
  if (Array.isArray(base) && Array.isArray(patch)) {
    // `patch.map` yields `any[]` (Array.isArray narrows unknown to any[]);
    // rebuild it into a typed array before returning.
    const merged: unknown[] = [];
    patch.forEach((p: unknown, i: number) => {
      merged.push(i < base.length ? mergeDeep(base[i] as never, p as never) : p);
    });
    return merged as unknown as Record<string, unknown>;
  }
  if (base && typeof base === 'object' && patch && typeof patch === 'object') {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        out[key] = mergeDeep((base as Record<string, unknown>)[key] as never, value as never);
      } else {
        out[key] = value;
      }
    }
    return out;
  }
  return patch as Record<string, unknown>;
}

/**
 * A `t`-like resolver that checks the published overrides first, then falls
 * back to the live i18n `t`. Used by the editor to preview what a key will
 * render as, and by SSR sections if needed.
 */
export function overrideAwareT(t: TFunction, overrides: Record<string, string>) {
  return (key: string, options?: Record<string, unknown>) => {
    const direct = overrides[key];
    if (direct !== undefined && typeof options === 'undefined') return direct;
    return t(key, options as never);
  };
}
