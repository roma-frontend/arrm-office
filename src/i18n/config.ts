import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// EN namespaces bundled for instant render (no flash of keys).
// Source of truth = public/locales/en/* (also served via HttpBackend at runtime).
// Importing directly from public/ keeps a single source and prevents drift.
import commonEn from '../../public/locales/en/common.json';
import landingEn from '../../public/locales/en/landing.json';
import authEn from '../../public/locales/en/auth.json';
import dashboardEn from '../../public/locales/en/dashboard.json';
import leavesEn from '../../public/locales/en/leaves.json';
import tasksEn from '../../public/locales/en/tasks.json';
import employeesEn from '../../public/locales/en/employees.json';
import chatEn from '../../public/locales/en/chat.json';
import adminEn from '../../public/locales/en/admin.json';
import driversEn from '../../public/locales/en/drivers.json';
import settingsEn from '../../public/locales/en/settings.json';
import modulesEn from '../../public/locales/en/modules.json';
import payrollEn from '../../public/locales/en/payroll.json';
import compensationEn from '../../public/locales/en/compensation.json';
import learningEn from '../../public/locales/en/learning.json';
import expensesEn from '../../public/locales/en/expenses.json';

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

// EN is fully bundled for instant render. RU/HY load lazily via HttpBackend.
export const resources = {
  en: {
    common: commonEn,
    landing: landingEn,
    auth: authEn,
    dashboard: dashboardEn,
    leaves: leavesEn,
    tasks: tasksEn,
    employees: employeesEn,
    chat: chatEn,
    admin: adminEn,
    drivers: driversEn,
    settings: settingsEn,
    modules: modulesEn,
    payroll: payrollEn,
    compensation: compensationEn,
    learning: learningEn,
    expenses: expensesEn,
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
  if (typeof window !== 'undefined') {
    i18n.use(HttpBackend);
    i18n.use(LanguageDetector);
  }

  i18n.use(initReactI18next).init({
    defaultNS,
    ns: [...allNamespaces],
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
    react: { useSuspense: false },
  });
}

// HMR-safe: always refresh bundled EN resources from the latest imports.
// Without this, after init() runs once, i18next keeps stale in-memory data
// even when JSON files change (since the init guard skips re-initialization).
for (const ns of allNamespaces) {
  i18n.addResourceBundle('en', ns, resources.en[ns], true, true);
}

export default i18n;
