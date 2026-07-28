/**
 * Tests for server-translation.ts — Server-side i18n translation helper.
 *
 * Tests: getServerTranslation with mocked fs module to control
 * what locale JSON files are loaded.
 */

import { getServerTranslation } from '@/lib/i18n/server-translation';

const mockFileContents: Record<string, string> = {};

jest.mock('fs', () => ({
  readFileSync: jest.fn((path: string, _encoding?: string) => {
    const content = mockFileContents[path as string];
    if (content === undefined) {
      throw new Error(`ENOENT: no such file: ${path}`);
    }
    return content;
  }),
}));

// We need to mock path.join so it returns a predictable path
jest.mock('path', () => {
  const actual = jest.requireActual('path');
  return {
    ...actual,
    join: jest.fn((...parts: string[]) => parts.join('/')),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  // Reset mock file contents
  Object.keys(mockFileContents).forEach((k) => delete mockFileContents[k]);
  // Set up the cwd so join(process.cwd(), 'public', 'locales', ...) works
  jest.spyOn(process, 'cwd').mockReturnValue('/app');
});

describe('getServerTranslation', () => {
  it('returns translation function and locale', async () => {
    const result = await getServerTranslation('common', 'en');
    expect(result).toHaveProperty('t');
    expect(typeof result.t).toBe('function');
    expect(result.locale).toBe('en');
  });

  it('falls back to "en" for unsupported locales', async () => {
    const result = await getServerTranslation('common', 'fr' as any);
    expect(result.locale).toBe('en');
  });

  it('returns the key itself for missing translations', async () => {
    const { t } = await getServerTranslation('common', 'en');
    const result = t('nonexistent.key');
    expect(result).toBe('nonexistent.key');
  });

  let cwdSpy: jest.SpyInfo;

  beforeEach(() => {
    cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('/app');
  });

  afterEach(() => {
    cwdSpy.mockRestore();
  });

  it('retrieves nested translation values', async () => {
    mockFileContents['/app/public/locales/en/nested.json'] = JSON.stringify({
      greeting: 'Hello',
      nav: { home: 'Home', about: 'About' },
    });

    const { t } = await getServerTranslation('nested', 'en');
    expect(t('greeting')).toBe('Hello');
    expect(t('nav.home')).toBe('Home');
    expect(t('nav.about')).toBe('About');
  });

  it('returns key for partially missing nested path', async () => {
    mockFileContents['/app/public/locales/en/partial.json'] = JSON.stringify({
      nav: { home: 'Home' },
    });

    const { t } = await getServerTranslation('partial', 'en');
    expect(t('nav.missing')).toBe('nav.missing');
  });

  it('replaces params in translated strings', async () => {
    mockFileContents['/app/public/locales/en/welcome.json'] = JSON.stringify({
      greeting: 'Hello {{name}}, you have {{count}} messages',
    });

    const { t } = await getServerTranslation('welcome', 'en');
    const result = t('greeting', { name: 'Alice', count: '5' });
    expect(result).toBe('Hello Alice, you have 5 messages');
  });

  it('handles multiple param replacements', async () => {
    mockFileContents['/app/public/locales/en/notify.json'] = JSON.stringify({
      message: '{{actor}} sent you a {{type}}',
    });

    const { t } = await getServerTranslation('notify', 'en');
    const result = t('message', { actor: 'Bob', type: 'message' });
    expect(result).toBe('Bob sent you a message');
  });

  it('returns key when param replacement does not change key', async () => {
    mockFileContents['/app/public/locales/en/empty.json'] = JSON.stringify({});

    const { t } = await getServerTranslation('empty', 'en');
    const result = t('missing.key', { name: 'Alice' });
    expect(result).toBe('missing.key');
  });

  it('loads different namespaces independently', async () => {
    mockFileContents['/app/public/locales/en/titles.json'] = JSON.stringify({
      title: 'Common Title',
    });
    mockFileContents['/app/public/locales/en/login.json'] = JSON.stringify({
      signin: 'Sign In',
    });

    const titles = await getServerTranslation('titles', 'en');
    const login = await getServerTranslation('login', 'en');

    expect(titles.t('title')).toBe('Common Title');
    expect(titles.t('signin')).toBe('signin');
    expect(login.t('signin')).toBe('Sign In');
    expect(login.t('title')).toBe('title');
  });

  it('returns object values as the key', async () => {
    mockFileContents['/app/public/locales/en/objtest.json'] = JSON.stringify({
      nested: { key: 'value' },
    });

    const { t } = await getServerTranslation('objtest', 'en');
    expect(t('nested')).toBe('nested');
  });

  it('handles empty or missing translation file gracefully', async () => {
    mockFileContents['/app/public/locales/en/missingns.json'] = JSON.stringify({});
    const { t } = await getServerTranslation('missingns', 'en');
    const result = t('any.key');
    expect(result).toBe('any.key');
  });

  it('returns key for non-string translation values', async () => {
    mockFileContents['/app/public/locales/en/valuestest.json'] = JSON.stringify({
      count: 42,
      flag: true,
    });

    const { t } = await getServerTranslation('valuestest', 'en');
    expect(t('count')).toBe('count');
    expect(t('flag')).toBe('flag');
  });

  it('supports russian locale', async () => {
    mockFileContents['/app/public/locales/ru/common.json'] = JSON.stringify({
      greeting: 'Привет',
    });

    const { t } = await getServerTranslation('common', 'ru');
    expect(t('greeting')).toBe('Привет');
  });

  it('supports armenian locale', async () => {
    mockFileContents['/app/public/locales/hy/common.json'] = JSON.stringify({
      greeting: 'Բարև',
    });

    const { t } = await getServerTranslation('common', 'hy');
    expect(t('greeting')).toBe('Բարև');
  });

  it('supports german locale', async () => {
    mockFileContents['/app/public/locales/de/common.json'] = JSON.stringify({
      greeting: 'Hallo',
    });

    const { t } = await getServerTranslation('common', 'de');
    expect(t('greeting')).toBe('Hallo');
  });
});
