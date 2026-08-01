// Base prices in USD
export const BASE_PRICES = {
  starter: 29,
  professional: 79,
  enterprise: 0,
} as const;

// Fallback rates (updated manually as backup)
const FALLBACK_RATES: Record<string, { rate: number; symbol: string; code: string }> = {
  USD: { rate: 1, symbol: '$', code: 'USD' },
  RUB: { rate: 90, symbol: '₽', code: 'RUB' },
  AMD: { rate: 386, symbol: '֏', code: 'AMD' },
  EUR: { rate: 0.92, symbol: '€', code: 'EUR' },
};

// Locale to currency mapping
export const LOCALE_CURRENCY: Record<string, string> = {
  en: 'USD',
  ru: 'RUB',
  hy: 'AMD',
  de: 'EUR',
};

const CACHE_KEY = 'currency_rates_cache';
const CACHE_TTL = 3600000; // 1 hour

interface CachedRates {
  timestamp: number;
  rates: Record<string, number>;
}

async function fetchLiveRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch('/api/currency-rates');
    if (!res.ok) throw new Error('Failed to fetch rates');
    const data = (await res.json()) as { rates?: Record<string, number> };
    return data.rates || {};
  } catch {
    return {};
  }
}

export async function getExchangeRates(): Promise<Record<string, number>> {
  // Check cache first
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed: CachedRates = JSON.parse(cached) as CachedRates;
      if (Date.now() - parsed.timestamp < CACHE_TTL) {
        return parsed.rates;
      }
    }
  }

  // Fetch live rates
  const rates = await fetchLiveRates();

  // Cache the result
  if (typeof window !== 'undefined' && Object.keys(rates).length > 0) {
    const cache: CachedRates = { timestamp: Date.now(), rates };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }

  // Return live rates or fallback
  if (Object.keys(rates).length > 0) {
    return rates;
  }

  // Convert fallback rates to simple number map
  const fallback: Record<string, number> = {};
  for (const [code, config] of Object.entries(FALLBACK_RATES)) {
    fallback[code] = config.rate;
  }
  return fallback;
}

export interface LocalizedPrice {
  amount: number;
  formatted: string;
  currency: string;
  symbol: string;
  rate: number;
}

export async function convertPrice(
  usdAmount: number,
  locale: string = 'en',
): Promise<LocalizedPrice> {
  const targetCurrency = LOCALE_CURRENCY[locale] ?? 'USD';
  const rates = await getExchangeRates();
  const rate = rates[targetCurrency] ?? FALLBACK_RATES[targetCurrency]?.rate ?? 1;
  const config = FALLBACK_RATES[targetCurrency] ?? FALLBACK_RATES.USD;

  const converted = Math.round(usdAmount * rate);

  return {
    amount: converted,
    formatted: `${config!.symbol}${converted.toLocaleString()}`,
    currency: config!.code,
    symbol: config!.symbol,
    rate,
  };
}

export function getCurrencyConfig(locale: string = 'en'): { symbol: string; code: string } {
  const targetCurrency = LOCALE_CURRENCY[locale] ?? 'USD';
  const config = FALLBACK_RATES[targetCurrency] ?? FALLBACK_RATES.USD;
  return { symbol: config!.symbol, code: config!.code };
}
