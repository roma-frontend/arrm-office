'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';
import '../i18n/config';

const VALID_LANGUAGES = ['en', 'hy', 'ru', 'de'] as const;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function setLanguageCookie(lang: string) {
  if (typeof document !== 'undefined') {
    document.cookie = `i18nextLng=${lang};path=/;max-age=${COOKIE_MAX_AGE}`;
  }
}

function getSavedLanguage(): string | null {
  if (typeof window === 'undefined') return null;
  const saved = localStorage.getItem('i18nextLng');
  if (saved && VALID_LANGUAGES.includes(saved as (typeof VALID_LANGUAGES)[number])) {
    return saved;
  }
  return null;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { i18n } = useTranslation();
  const [isReady, setIsReady] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const savedLang = getSavedLanguage();
    const currentLang = i18n.language;

    if (savedLang && savedLang !== currentLang) {
      i18n.changeLanguage(savedLang).then(() => {
        setLanguageCookie(savedLang);
        setIsReady(true);
      });
    } else {
      if (!savedLang) {
        const langToSave = currentLang || 'en';
        if (typeof window !== 'undefined') {
          localStorage.setItem('i18nextLng', langToSave);
        }
        setLanguageCookie(langToSave);
      } else if (savedLang !== currentLang) {
        logger.warn('Invalid language in localStorage:', savedLang);
        if (typeof window !== 'undefined') {
          localStorage.setItem('i18nextLng', 'en');
        }
        i18n.changeLanguage('en');
        setLanguageCookie('en');
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- i18n init is one-time, gated by the initialized ref
      setIsReady(true);
    }
  }, [i18n]);

  if (!isReady) {
    return <>{children}</>;
  }

  return <>{children}</>;
}
