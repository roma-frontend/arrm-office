'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { convertPrice, BASE_PRICES, getCurrencyConfig } from '@/lib/currency';

interface CurrencyState {
  starter: { amount: number; formatted: string; currency: string; symbol: string };
  professional: { amount: number; formatted: string; currency: string; symbol: string };
  locale: string;
  currency: string;
  symbol: string;
  loading: boolean;
}

export function useCurrency(): CurrencyState {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  const [state, setState] = useState<CurrencyState>({
    starter: { amount: 0, formatted: '$29', currency: 'USD', symbol: '$' },
    professional: { amount: 0, formatted: '$79', currency: 'USD', symbol: '$' },
    locale,
    currency: 'USD',
    symbol: '$',
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const config = getCurrencyConfig(locale);
      const [starter, professional] = await Promise.all([
        convertPrice(BASE_PRICES.starter, locale),
        convertPrice(BASE_PRICES.professional, locale),
      ]);

      if (!cancelled) {
        setState({
          starter,
          professional,
          locale,
          currency: config.code,
          symbol: config.symbol,
          loading: false,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [locale]);

  return state;
}
