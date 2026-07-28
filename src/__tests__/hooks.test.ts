/**
 * Tests for hooks.
 *
 * Covers: useCurrency.
 * Note: useCurrency requires react-i18next context, so we mock it.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useCurrency } from '@/hooks/useCurrency';

// Mock react-i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key: string) => key,
  }),
}));

// Mock global fetch for convertPrice calls
const originalFetch = global.fetch;

beforeAll(() => {
  global.fetch = jest.fn();
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('useCurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rates: { USD: 1, RUB: 90, AMD: 386, EUR: 0.92 } }),
    });
  });

  it('returns default state on first render with loading true', () => {
    const { result } = renderHook(() => useCurrency());
    // Initial state before effect runs
    expect(result.current.loading).toBe(true);
    expect(result.current.currency).toBe('USD');
    expect(result.current.symbol).toBe('$');
  });

  it('resolves with converted prices', async () => {
    const { result } = renderHook(() => useCurrency());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.currency).toBe('USD');
    expect(result.current.symbol).toBe('$');
    expect(result.current.starter).toBeDefined();
    expect(result.current.professional).toBeDefined();
    expect(result.current.locale).toBe('en');
  });

  it('converts starter price correctly', async () => {
    const { result } = renderHook(() => useCurrency());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.starter.amount).toBeGreaterThan(0);
    expect(result.current.starter.currency).toBe('USD');
    expect(result.current.starter.symbol).toBe('$');
    expect(result.current.starter.formatted).toContain('$');
  });

  it('has loading false after resolving', async () => {
    const { result } = renderHook(() => useCurrency());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.loading).toBe(false);
  });
});
