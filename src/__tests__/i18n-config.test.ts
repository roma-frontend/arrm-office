/**
 * Tests for src/i18n/config.ts — i18next initialization options, bundled
 * resources and the language cookie reader.
 *
 * i18next and its plugins are mocked; the JSON locale files are loaded for
 * real (they are plain JSON modules). Each test re-requires the module via
 * jest.resetModules() so the `isInitialized` guard and `getInitialLanguage()`
 * run fresh — and re-fetches the i18next mock afterwards, because the mock
 * factory re-runs on every reset.
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// State shared across mock factory re-runs (jest.resetModules() re-invokes the
// factory, and we want `isInitialized` to persist for the double-init test).
const mockState: { isInitialized: boolean } = { isInitialized: false };

jest.mock('i18next', () => {
  const mock: any = {
    get isInitialized() {
      return mockState.isInitialized;
    },
    use: jest.fn(),
    init: jest.fn(),
    addResourceBundle: jest.fn(),
  };
  mock.use.mockReturnValue(mock);
  return mock;
});

jest.mock('react-i18next', () => ({ initReactI18next: { type: 'initReactI18next' } }));
jest.mock('i18next-browser-languagedetector', () => ({
  __esModule: true,
  default: { type: 'languageDetector' },
}));
jest.mock('i18next-http-backend', () => ({ __esModule: true, default: { type: 'httpBackend' } }));

type I18nMock = {
  isInitialized: boolean;
  use: jest.Mock;
  init: jest.Mock;
  addResourceBundle: jest.Mock;
};

const originalCookie = document.cookie;

/** Re-require the config module AND the (possibly re-created) i18next mock. */
function loadConfig() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@/i18n/config') as typeof import('@/i18n/config');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const i18n = jest.requireMock('i18next') as I18nMock;
  return { mod, i18n };
}

function setCookie(value: string) {
  Object.defineProperty(document, 'cookie', { value, configurable: true });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.isInitialized = false;
  setCookie('');
});

afterEach(() => {
  Object.defineProperty(document, 'cookie', {
    value: originalCookie,
    configurable: true,
  });
  jest.resetModules();
});

describe('allNamespaces', () => {
  it('contains every app namespace with common first', () => {
    const { mod } = loadConfig();
    expect(mod.allNamespaces).toContain('common');
    expect(mod.allNamespaces).toContain('landing');
    expect(mod.allNamespaces).toContain('auth');
    expect(mod.allNamespaces).toContain('modules');
    expect(mod.allNamespaces).toContain('expenses');
    expect(mod.defaultNS).toBe('common');
  });
});

describe('resources', () => {
  it('bundles all EN namespaces', () => {
    const { mod } = loadConfig();
    expect(Object.keys(mod.resources.en)).toEqual(
      expect.arrayContaining(['common', 'landing', 'auth', 'dashboard']),
    );
    expect(mod.resources.en.common).toBeTruthy();
  });

  it('bundles only landing+common for RU/HY/DE', () => {
    const { mod } = loadConfig();
    expect(Object.keys(mod.resources.ru)).toEqual(['landing', 'common']);
    expect(Object.keys(mod.resources.hy)).toEqual(['landing', 'common']);
    expect(Object.keys(mod.resources.de)).toEqual(['landing', 'common']);
  });
});

describe('i18n initialization', () => {
  it('calls init with sane options', () => {
    const { i18n } = loadConfig();
    expect(i18n.init).toHaveBeenCalledTimes(1);
    const opts = i18n.init.mock.calls[0][0];
    expect(opts.fallbackLng).toBe('en');
    expect(opts.defaultNS).toBe('common');
    expect(opts.supportedLngs).toEqual(['en', 'hy', 'ru', 'de']);
    expect(opts.react).toEqual({ useSuspense: false });
    expect(opts.backend.loadPath).toBe('/locales/{{lng}}/{{ns}}.json');
    expect(opts.lng).toBe('en');
  });

  it('uses the language from the i18nextLng cookie', () => {
    setCookie('foo=bar; i18nextLng=ru');
    const { i18n } = loadConfig();
    expect(i18n.init.mock.calls[0][0].lng).toBe('ru');
  });

  it('ignores unsupported languages in the cookie', () => {
    setCookie('i18nextLng=fr');
    const { i18n } = loadConfig();
    expect(i18n.init.mock.calls[0][0].lng).toBe('en');
  });

  it('does not initialize twice when already initialized', () => {
    const first = loadConfig();
    expect(first.i18n.init).toHaveBeenCalledTimes(1);
    mockState.isInitialized = true;
    const second = loadConfig();
    expect(second.i18n.init).toHaveBeenCalledTimes(0);
  });

  it('refreshes the EN resource bundles after init', () => {
    const { i18n } = loadConfig();
    expect(i18n.addResourceBundle.mock.calls.length).toBeGreaterThan(0);
    const [lng, ns, bundle, deep, overwrite] = i18n.addResourceBundle.mock.calls[0];
    expect(lng).toBe('en');
    expect(ns).toBe('common');
    expect(bundle).toBeTruthy();
    expect(deep).toBe(true);
    expect(overwrite).toBe(true);
  });
});
