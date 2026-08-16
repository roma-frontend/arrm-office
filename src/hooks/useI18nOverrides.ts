/**
 * Applies superadmin i18n overrides to the running i18next instance.
 *
 * The operator console writes overrides (key → value per locale) that must win
 * over the JSON bundles. This hook fetches them once and injects each into
 * i18next with the overwrite flag, so every `t()` call across the app picks up
 * the edited text immediately — no reload, no deploy.
 *
 * Only mounted when the current user is a superadmin (the caller decides); the
 * data is harmless for other roles but there is no reason to fetch it.
 */

'use client';

import { useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import i18n from '@/i18n/config';

/**
 * "common.notifications.saved" → { namespace: 'common', keyPath: 'notifications.saved' }
 */
function splitKey(fullKey: string): { namespace: string; keyPath: string } | null {
  const dot = fullKey.indexOf('.');
  if (dot <= 0 || dot === fullKey.length - 1) return null;
  return { namespace: fullKey.slice(0, dot), keyPath: fullKey.slice(dot + 1) };
}

export function useI18nOverrides(enabled: boolean) {
  const overrides = useQuery(api.superadmin.operatorTools.listI18nOverrides, enabled ? {} : 'skip');

  useEffect(() => {
    if (!overrides || overrides.length === 0) return;
    for (const row of overrides) {
      const split = splitKey(row.key);
      if (!split) continue;
      // addResourceBundle(ns, key, { path: value }, deep, overwrite)
      i18n.addResourceBundle(
        row.locale,
        split.namespace,
        { [split.keyPath]: row.value },
        true,
        true,
      );
    }
  }, [overrides]);

  return overrides;
}
