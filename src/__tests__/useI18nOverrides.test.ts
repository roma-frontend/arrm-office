/**
 * Tests for useI18nOverrides hook — key splitting, i18n override injection.
 */
import { renderHook } from '@testing-library/react';

// Mock i18n config — use a shared mock function
const mockAddResourceBundle = jest.fn();
jest.mock('@/i18n/config', () => ({
  __esModule: true,
  default: { addResourceBundle: (...args: unknown[]) => mockAddResourceBundle(...args) },
}));

// Mock convex/react
const mockUseQuery = jest.fn();
jest.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

// Mock API
jest.mock('@/convex/_generated/api', () => ({
  api: {
    superadmin: {
      operatorTools: { listI18nOverrides: 'listI18nOverrides' },
    },
  },
}));

import { useI18nOverrides } from '@/hooks/useI18nOverrides';

// Re-implement splitKey for unit testing
function splitKey(fullKey: string): { namespace: string; keyPath: string } | null {
  const dot = fullKey.indexOf('.');
  if (dot <= 0 || dot === fullKey.length - 1) return null;
  return { namespace: fullKey.slice(0, dot), keyPath: fullKey.slice(dot + 1) };
}

describe('splitKey (internal helper)', () => {
  it('splits "common.notifications.saved"', () => {
    expect(splitKey('common.notifications.saved')).toEqual({
      namespace: 'common',
      keyPath: 'notifications.saved',
    });
  });

  it('splits "tasks.title"', () => {
    expect(splitKey('tasks.title')).toEqual({ namespace: 'tasks', keyPath: 'title' });
  });

  it('returns null for single segment', () => {
    expect(splitKey('notepad')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(splitKey('')).toBeNull();
  });

  it('returns null for dot at start', () => {
    expect(splitKey('.hidden')).toBeNull();
  });

  it('returns null for dot at end', () => {
    expect(splitKey('trailing.')).toBeNull();
  });

  it('handles deeply nested keys', () => {
    expect(splitKey('a.b.c.d.e')).toEqual({ namespace: 'a', keyPath: 'b.c.d.e' });
  });
});

describe('useI18nOverrides', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns overrides from query', () => {
    const mockOverrides = [{ key: 'common.title', locale: 'en', value: 'My App' }];
    mockUseQuery.mockReturnValue(mockOverrides);

    const { result } = renderHook(() => useI18nOverrides(true));
    expect(result.current).toEqual(mockOverrides);
  });

  it('skips query when disabled', () => {
    mockUseQuery.mockReturnValue(undefined);
    renderHook(() => useI18nOverrides(false));
    expect(mockUseQuery).toHaveBeenCalledWith('listI18nOverrides', 'skip');
  });

  it('sends query when enabled', () => {
    mockUseQuery.mockReturnValue(undefined);
    renderHook(() => useI18nOverrides(true));
    expect(mockUseQuery).toHaveBeenCalledWith('listI18nOverrides', {});
  });

  it('applies overrides to i18n', () => {
    mockUseQuery.mockReturnValue([
      { key: 'common.title', locale: 'en', value: 'My App' },
      { key: 'tasks.filterLabel', locale: 'en', value: 'Filter Tasks' },
    ]);

    renderHook(() => useI18nOverrides(true));

    expect(mockAddResourceBundle).toHaveBeenCalledTimes(2);
    expect(mockAddResourceBundle).toHaveBeenCalledWith(
      'en',
      'common',
      { title: 'My App' },
      true,
      true,
    );
    expect(mockAddResourceBundle).toHaveBeenCalledWith(
      'en',
      'tasks',
      { filterLabel: 'Filter Tasks' },
      true,
      true,
    );
  });

  it('handles multiple locales', () => {
    mockUseQuery.mockReturnValue([
      { key: 'common.title', locale: 'en', value: 'My App' },
      { key: 'common.title', locale: 'ru', value: 'Моё Приложение' },
      { key: 'common.title', locale: 'hy', value: 'Իմ Ծրագիրը' },
    ]);

    renderHook(() => useI18nOverrides(true));

    expect(mockAddResourceBundle).toHaveBeenCalledTimes(3);
  });

  it('skips invalid keys', () => {
    mockUseQuery.mockReturnValue([
      { key: 'invalidkey', locale: 'en', value: 'test' },
      { key: 'valid.key', locale: 'en', value: 'test' },
    ]);

    renderHook(() => useI18nOverrides(true));

    expect(mockAddResourceBundle).toHaveBeenCalledTimes(1);
    expect(mockAddResourceBundle).toHaveBeenCalledWith('en', 'valid', { key: 'test' }, true, true);
  });

  it('does not apply when overrides is empty', () => {
    mockUseQuery.mockReturnValue([]);
    renderHook(() => useI18nOverrides(true));
    expect(mockAddResourceBundle).not.toHaveBeenCalled();
  });

  it('does not apply when overrides is undefined', () => {
    mockUseQuery.mockReturnValue(undefined);
    renderHook(() => useI18nOverrides(true));
    expect(mockAddResourceBundle).not.toHaveBeenCalled();
  });

  it('always passes overwrite=true', () => {
    mockUseQuery.mockReturnValue([{ key: 'ns.key', locale: 'en', value: 'val' }]);

    renderHook(() => useI18nOverrides(true));

    const call = mockAddResourceBundle.mock.calls[0];
    expect(call[3]).toBe(true); // deep merge
    expect(call[4]).toBe(true); // overwrite
  });
});
