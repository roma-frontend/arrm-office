/**
 * Tests for useCurrency hook — currency conversion for plan pricing.
 *
 * Covers: initial loading state, locale-based currency config, price
 * conversion, rate fallback.
 */
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCurrency } from '@/hooks/useCurrency';

const mockI18n = { language: 'en' };

// Mock i18next
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: mockI18n,
  }),
}));

// Mock currency lib
jest.mock('@/lib/currency', () => ({
  BASE_PRICES: { starter: 29, professional: 79 },
  convertPrice: jest.fn(async (price: number, _locale: string) => ({
    amount: price,
    formatted: `$${price}`,
    currency: 'USD',
    symbol: '$',
    rate: 1,
  })),
  getCurrencyConfig: jest.fn(() => ({ symbol: '$', code: 'USD' })),
  getFallbackRate: jest.fn(() => 1),
}));

describe('useCurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts with loading = true', () => {
    const { result } = renderHook(() => useCurrency());
    expect(result.current.loading).toBe(true);
  });

  it('has USD defaults before conversion completes', () => {
    const { result } = renderHook(() => useCurrency());
    expect(result.current.currency).toBe('USD');
    expect(result.current.symbol).toBe('$');
    expect(result.current.rate).toBe(1);
  });

  it('loads and sets correct prices after conversion', async () => {
    const { result } = renderHook(() => useCurrency());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.starter.amount).toBe(29);
    expect(result.current.professional.amount).toBe(79);
    expect(result.current.starter.formatted).toBe('$29');
    expect(result.current.professional.formatted).toBe('$79');
  });

  it('uses the locale from i18next', async () => {
    mockI18n.language = 'de';

    const { convertPrice, getCurrencyConfig } = require('@/lib/currency');
    getCurrencyConfig.mockReturnValue({ symbol: '€', code: 'EUR' });
    convertPrice.mockImplementation(async (price: number) => ({
      amount: price * 0.92,
      formatted: `€${Math.round(price * 0.92)}`,
      currency: 'EUR',
      symbol: '€',
      rate: 0.92,
    }));

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.currency).toBe('EUR');
    expect(result.current.symbol).toBe('€');
    expect(result.current.rate).toBe(0.92);

    mockI18n.language = 'en';
  });

  it('falls back to getFallbackRate when convertPrice returns 0 rate', async () => {
    const { convertPrice, getFallbackRate } = require('@/lib/currency');
    convertPrice.mockImplementation(async (price: number) => ({
      amount: price,
      formatted: `$${price}`,
      currency: 'USD',
      symbol: '$',
      rate: 0,
    }));
    getFallbackRate.mockReturnValue(1);

    const { result } = renderHook(() => useCurrency());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.rate).toBe(1);
    expect(getFallbackRate).toHaveBeenCalled();
  });

  it('cleans up cancellation on unmount', async () => {
    const { result, unmount } = renderHook(() => useCurrency());
    unmount();
    // Should not throw
    expect(result.current.loading).toBe(true);
  });
});
