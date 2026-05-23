// Server-side translation helper for Server Components
import { readFileSync } from 'fs';
import { join } from 'path';

type TranslationKey = string;

interface ServerTranslation {
  t: (key: TranslationKey, params?: Record<string, string>) => string;
  locale: string;
}

// Cache loaded namespaces in memory (per-process, reset on deploy)
const cache = new Map<string, Record<string, unknown>>();

function loadNamespace(locale: string, ns: string): Record<string, unknown> {
  const cacheKey = `${locale}:${ns}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  try {
    const filePath = join(process.cwd(), 'public', 'locales', locale, `${ns}.json`);
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    cache.set(cacheKey, data);
    return data;
  } catch {
    return {};
  }
}

/**
 * Get translation function for Server Components.
 * Loads only the requested namespace from disk (no full bundle).
 */
export async function getServerTranslation(
  namespace: string = 'common',
  locale: string = 'en',
): Promise<ServerTranslation> {
  const validLocale = ['en', 'hy', 'ru', 'deu'].includes(locale) ? locale : 'en';
  const translations = loadNamespace(validLocale, namespace);

  function t(key: TranslationKey, params?: Record<string, string>): string {
    const keys = key.split('.');
    let value: unknown = translations;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return key;
      }
    }
    let result = typeof value === 'string' ? value : key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(new RegExp(`{{${k}}}`, 'g'), v);
      }
    }
    return result;
  }

  return { t, locale: validLocale };
}
