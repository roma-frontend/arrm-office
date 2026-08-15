'use client';

/**
 * Realtime feature flags for the signed-in caller's organization.
 *
 * Backed by `superadmin.featureToggles.getMyFeatureFlags`, a Convex query —
 * Convex keeps it subscribed, so flipping a toggle in the operator console
 * re-renders every open client within ~100ms. Consumers use `isEnabled(key)`
 * to hide entry points (nav items, widgets, pages) the moment a switch flips.
 */

import { useMemo } from 'react';
import { useQuery } from 'convex/react';
import { useAuthUser } from '@/store/useAuthStore';
import { api } from '@/convex/_generated/api';

export type FeatureKey =
  | 'ai.assistant'
  | 'face.recognition'
  | 'chat.realtime'
  | 'drivers.module'
  | 'expenses.module'
  | 'recruitment.module'
  | 'surveys.module'
  | 'compensation.module';

/** Routes whose module visibility is controlled by a feature toggle. */
export const MODULE_TOGGLE_BY_HREF: Record<string, FeatureKey> = {
  '/chat': 'chat.realtime',
  '/drivers': 'drivers.module',
  '/expenses': 'expenses.module',
  '/recruitment': 'recruitment.module',
  '/surveys': 'surveys.module',
  '/compensation': 'compensation.module',
};

export function useFeatureFlags() {
  const user = useAuthUser();
  const flags = useQuery(api.superadmin.featureToggles.getMyFeatureFlags, user?.id ? {} : 'skip');

  const map = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const f of flags ?? []) m.set(f.key, f.enabled);
    return m;
  }, [flags]);

  /** A flag we haven't loaded yet (or the user is signed out) is treated as on. */
  const isEnabled = (key: FeatureKey | undefined): boolean =>
    key === undefined || (map.get(key) ?? true);

  /** Filter an array of { href } destinations, dropping toggled-off modules. */
  const filterByHref = <T extends { href: string }>(items: T[]): T[] =>
    items.filter((i) => isEnabled(MODULE_TOGGLE_BY_HREF[i.href]));

  return { flags: map, isEnabled, filterByHref };
}
