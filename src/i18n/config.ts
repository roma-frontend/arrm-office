import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// Only landing-critical namespaces (common + landing) are statically bundled —
// for EVERY supported language, so the SSR'd landing page renders in the
// visitor's language on the first paint with no flash. The dashboard-only
// namespaces used to be bundled for EN too, which shipped a ~750KB locale
// mega-chunk (222KB gz) to every anonymous landing visitor; they now lazy-load
// via HttpBackend from /locales when the dashboard/auth layouts mount
// (see ensureAppNamespaces) — the exact path non-EN languages always used.
// Source of truth = public/locales/* (also served via HttpBackend at runtime).
// Importing directly from public/ keeps a single source and prevents drift.
import commonEn from '../../public/locales/en/common.json';
import landingEn from '../../public/locales/en/landing.json';
import landingRu from '../../public/locales/ru/landing.json';
import commonRu from '../../public/locales/ru/common.json';
import landingHy from '../../public/locales/hy/landing.json';
import commonHy from '../../public/locales/hy/common.json';
import landingDe from '../../public/locales/de/landing.json';
import commonDe from '../../public/locales/de/common.json';

export const allNamespaces = [
  'common',
  'landing',
  'auth',
  'dashboard',
  'leaves',
  'tasks',
  'employees',
  'chat',
  'admin',
  'drivers',
  'settings',
  'modules',
  'payroll',
  'compensation',
  'learning',
  'expenses',
] as const;

export type AppNamespace = (typeof allNamespaces)[number];
export const defaultNS: AppNamespace = 'common';

/** Namespaces statically bundled above (available before any network I/O). */
export const bundledNamespaces = ['common', 'landing'] as const;

/** Namespaces fetched on demand once an app (non-landing) layout mounts. */
export const lazyNamespaces = allNamespaces.filter(
  (ns) => !(bundledNamespaces as readonly string[]).includes(ns),
);

// Landing + common for all languages; see the note above for why nothing else
// is bundled. Non-EN languages load every other namespace via HttpBackend.
export const resources = {
  en: {
    common: commonEn,
    landing: landingEn,
  },
  ru: {
    landing: landingRu,
    common: commonRu,
  },
  hy: {
    landing: landingHy,
    common: commonHy,
  },
  de: {
    landing: landingDe,
    common: commonDe,
  },
} as const;

const getInitialLanguage = () => {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/i18nextLng=(en|hy|ru|de)/);
    if (match?.[1]) return match[1];
  }
  return 'en';
};

if (!i18n.isInitialized) {
  // Avoid registering the HttpBackend during Jest runs (jsdom) where XHR
  // behaviour can be problematic. Tests mock `react-i18next` as needed.
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    i18n.use(HttpBackend);
    i18n.use(LanguageDetector);
  }

  i18n.use(initReactI18next).init({
    defaultNS,
    // Only the bundled namespaces — initializing with every namespace made
    // i18next fetch all 14 dashboard namespaces for non-EN visitors even on
    // the landing page. App layouts load the rest via ensureAppNamespaces().
    ns: [...bundledNamespaces],
    fallbackNS: [...allNamespaces],
    fallbackLng: 'en',
    lng: getInitialLanguage(),
    supportedLngs: ['en', 'hy', 'ru', 'de'],
    nonExplicitSupportedLngs: false,
    debug: false,
    interpolation: { escapeValue: false },
    resources,
    partialBundledLanguages: true,
    backend: { loadPath: '/locales/{{lng}}/{{ns}}.json' },
    detection: {
      order: ['cookie', 'localStorage', 'navigator'],
      lookupCookie: 'i18nextLng',
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage', 'cookie'],
    },
    react: { useSuspense: false, bindI18nStore: 'added removed' },
  });
}

let appNamespacesRequested = false;

/**
 * Fetch the dashboard/auth namespaces over HttpBackend. Fire-and-forget:
 * addResourceBundle fires the `added` store event, so useTranslation
 * consumers re-render when the bundles land (bindI18nStore above).
 * Call once from the (dashboard) and (auth) client layouts — never on the
 * landing page, where these namespaces are dead weight.
 */
export function ensureAppNamespaces() {
  if (typeof window === 'undefined' || appNamespacesRequested) return;
  appNamespacesRequested = true;
  i18n.loadNamespaces([...lazyNamespaces]).catch(() => {
    // Allow a retry after a failed load (offline, 5xx…).
    appNamespacesRequested = false;
  });
}

// HMR-safe: always refresh bundled resources from the latest imports.
// Without this, after init() runs once, i18next keeps stale in-memory data
// even when JSON files change (since the init guard skips re-initialization).
for (const lng of ['en', 'ru', 'hy', 'de'] as const) {
  for (const ns of bundledNamespaces) {
    i18n.addResourceBundle(lng, ns, resources[lng][ns], true, true);
  }
}

export default i18n;
