'use client';

/**
 * Tool dock state — recency×frequency ordering plus manual pinning.
 *
 * Kept in localStorage so the dock adapts to what each person actually opens
 * without any server-side analytics: score = count * 0.7^(days since last
 * use), which rewards both habit (many visits) and recency (used this week).
 *
 * Consumers: ToolDock (and anything that wants to reorder by usage).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useAuthUser } from '@/store/useAuthStore';
import { MODULE_TOGGLE_BY_HREF, useFeatureFlags } from '@/hooks/useFeatureFlags';
import { flattenNavDestinations } from '@/lib/nav';

const STORAGE_PREFIX = 'tool-dock-v1';
const DECAY = 0.7;

/**
 * Core modules that every role reaches for daily — they anchor the dock and
 * are always visible regardless of usage history. Tasks first by design.
 */
const CORE_HREFS = ['/tasks', '/leaves', '/attendance', '/calendar'];

interface UsageEntry {
  count: number;
  lastUsed: number;
}

export interface DockModule {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  /** i18n group the module lives under in the sidebar, when any. */
  groupKey?: string;
}

interface PersistedState {
  /** href → usage record for every module this user has ever opened. */
  usage: Record<string, UsageEntry>;
  /** hrefs the user pinned; they always win the sort. */
  pinned: string[];
}

function emptyState(): PersistedState {
  return { usage: {}, pinned: [] };
}

function loadState(userKey: string): PersistedState {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${userKey}`);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as PersistedState;
    return {
      usage: parsed.usage && typeof parsed.usage === 'object' ? parsed.usage : {},
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
    };
  } catch {
    return emptyState();
  }
}

export function useToolDock() {
  const user = useAuthUser();
  const { isEnabled } = useFeatureFlags();
  const userKey = user?.id && user.id !== '' ? user.id : 'anonymous';

  const [state, setState] = useState<PersistedState>(() => loadState(userKey));

  // Re-read when the signed-in user changes (logout → login as someone else).
  useEffect(() => {
    setState(loadState(userKey));
  }, [userKey]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}:${userKey}`, JSON.stringify(state));
    } catch {
      // Private mode / storage full — the dock just falls back to role order.
    }
  }, [state, userKey]);

  /** Record that the user opened a module; called from the dock tiles. */
  const recordVisit = useCallback((href: string) => {
    setState((prev) => {
      const entry = prev.usage[href];
      const now = Date.now();
      return {
        ...prev,
        usage: {
          ...prev.usage,
          [href]: { count: (entry?.count ?? 0) + 1, lastUsed: now },
        },
      };
    });
  }, []);

  const togglePin = useCallback((href: string) => {
    setState((prev) => ({
      ...prev,
      pinned: prev.pinned.includes(href)
        ? prev.pinned.filter((h) => h !== href)
        : [...prev.pinned, href],
    }));
  }, []);

  const isPinned = useCallback((href: string) => state.pinned.includes(href), [state.pinned]);

  /** Score for one module — used to order the unpinned tail. */
  const score = useCallback(
    (href: string): number => {
      const entry = state.usage[href];
      if (!entry || entry.count === 0) return 0;
      const daysSince = (Date.now() - entry.lastUsed) / 86_400_000;
      return entry.count * Math.pow(DECAY, daysSince);
    },
    [state.usage],
  );

  /**
   * Modules for the current role, sorted: pinned first (in pin order), then
   * usage score descending, then the sidebar order as a stable tie-break.
   */
  const modules = useMemo<DockModule[]>(() => {
    const role = user?.role ?? 'employee';
    const destinations = flattenNavDestinations(role).filter(
      (d) => !MODULE_TOGGLE_BY_HREF[d.href] || isEnabled(MODULE_TOGGLE_BY_HREF[d.href]),
    );
    const order = new Map(destinations.map((d, i) => [d.href, i]));

    return [...destinations]
      .map((d) => ({
        href: d.href,
        labelKey: d.labelKey,
        icon: d.icon,
        groupKey: d.groupKey,
      }))
      .sort((a, b) => {
        // Pinned first, in pin order.
        const pinA = state.pinned.includes(a.href);
        const pinB = state.pinned.includes(b.href);
        if (pinA !== pinB) return pinA ? -1 : 1;
        if (pinA && pinB) {
          return state.pinned.indexOf(a.href) - state.pinned.indexOf(b.href);
        }
        // Core modules always anchor the visible dock.
        const coreA = CORE_HREFS.indexOf(a.href);
        const coreB = CORE_HREFS.indexOf(b.href);
        if (coreA !== -1 || coreB !== -1) {
          if (coreA === -1) return 1;
          if (coreB === -1) return -1;
          return coreA - coreB;
        }
        // Then by recency×frequency, sidebar order as a stable tie-break.
        const scoreA = score(a.href);
        const scoreB = score(b.href);
        if (scoreA !== scoreB) return scoreB - scoreA;
        return (order.get(a.href) ?? 0) - (order.get(b.href) ?? 0);
      });
  }, [user?.role, state.pinned, score, isEnabled]);

  return { modules, recordVisit, togglePin, isPinned };
}
