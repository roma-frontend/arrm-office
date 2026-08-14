'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import '@/i18n/config';

/**
 * Landing-page translation hook that is safe to server-render.
 *
 * Before mount it resolves translations with `getFixedT(initialLanguage)` — the
 * landing/common namespaces are statically bundled for every language, so this
 * is synchronous and the server HTML matches the first client render exactly
 * (no hydration mismatch, no English→language flash). After mount it switches
 * to the live `t`, which keeps runtime language switching working.
 *
 * Returns `mounted` too, so callers can gate browser-only branches (auth state,
 * etc.) the same way HeroCTA does.
 */
export function useLandingTranslation(initialLanguage = 'en') {
  const { t: liveT, i18n } = useTranslation();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Fall back to the live `t` when `getFixedT` is unavailable (e.g. lightweight
  // react-i18next test mocks) — in tests there is no SSR pass to diverge from.
  const t =
    mounted || typeof i18n.getFixedT !== 'function' ? liveT : i18n.getFixedT(initialLanguage);
  return { t, mounted, i18n };
}
