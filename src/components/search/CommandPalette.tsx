/**
 * Command palette — ⌘K / Ctrl+K.
 *
 * Replaces a version of this file that was never mounted anywhere in the app: a
 * repo-wide search for `CommandPalette` found only its own definition. Meanwhile
 * the navbar's shortcut modal, the dashboard's Quick Actions header and the
 * productivity settings page all advertised ⌘K to users — so the app promised a
 * palette and pressing the keys did nothing. It is mounted in
 * components/layout/Providers.tsx now.
 *
 * What changed beyond wiring it up:
 *
 *   - Destinations come from `@/lib/nav` — the same array the sidebar renders.
 *     The old file carried its own hardcoded list of 15 entries against the
 *     sidebar's ~60, so most of the app was unreachable from search and a few of
 *     its hrefs pointed at routes that had moved.
 *   - Subsequence matching (`@/lib/fuzzy`) instead of `includes()`, ranked by
 *     prefix / word-boundary / run-length, so "lvs" finds Leave Requests.
 *   - People search over the org roster, because navigating to a colleague is
 *     the single most common reason to open a palette in an HR product.
 *   - Recents, persisted per user, shown when the query is empty. An empty
 *     palette that shows the last five things you opened is worth more than one
 *     that shows a static list.
 *   - Convex queries are `'skip'`ped until the palette is actually open, so
 *     mounting it in the shell adds no org-wide subscription to page load.
 */

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import {
  ArrowRight,
  CalendarPlus,
  CornerDownLeft,
  PlusCircle,
  Search,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { flattenNavDestinations, type UserRole } from '@/lib/nav';
import { fuzzyMatchAny } from '@/lib/fuzzy';
import { MODULE_TOGGLE_BY_HREF, useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useGlobalShortcut } from '@/hooks/useGlobalShortcut';
import { useAuthUser } from '@/store/useAuthStore';
import { useCommandPaletteStore } from '@/store/useCommandPaletteStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

/** How many roster entries to score per keystroke. */
const MAX_PEOPLE_RESULTS = 6;
const MAX_NAV_RESULTS = 8;
const MAX_RECENTS = 5;
const RECENTS_KEY = 'hr:command-palette:recents:v1';

type ResultKind = 'action' | 'nav' | 'person';

interface Result {
  id: string;
  kind: ResultKind;
  label: string;
  hint?: string;
  href: string;
  icon: LucideIcon;
  /** Image URL for person results; falls back to initials. */
  avatarUrl?: string;
  score: number;
}

/** Quick actions — verbs, not destinations. Deliberately few. */
interface QuickAction {
  id: string;
  href: string;
  icon: LucideIcon;
  labelKey: string;
  fallback: string;
  roles?: UserRole[];
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'action-new-leave',
    href: '/leaves?new=1',
    icon: CalendarPlus,
    labelKey: 'commandPalette.actions.newLeave',
    fallback: 'Request time off',
  },
  {
    id: 'action-new-task',
    href: '/tasks/new',
    icon: PlusCircle,
    labelKey: 'commandPalette.actions.newTask',
    fallback: 'Create a task',
  },
  {
    id: 'action-book-room',
    href: '/rooms',
    icon: CalendarPlus,
    labelKey: 'commandPalette.actions.bookRoom',
    fallback: 'Book a meeting room',
  },
  {
    id: 'action-ask-ai',
    href: '/ai-chat',
    icon: Sparkles,
    labelKey: 'commandPalette.actions.askAi',
    fallback: 'Ask the assistant',
  },
];

const GROUP_ORDER: ResultKind[] = ['action', 'person', 'nav'];

function readRecents(userId: string | undefined): string[] {
  if (typeof window === 'undefined' || !userId) return [];
  try {
    const raw = window.localStorage.getItem(`${RECENTS_KEY}:${userId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // A corrupt or unavailable localStorage must never keep the palette shut.
    return [];
  }
}

function writeRecents(userId: string | undefined, hrefs: string[]): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(`${RECENTS_KEY}:${userId}`, JSON.stringify(hrefs));
  } catch {
    /* storage full or blocked — recents are a nicety, not a requirement */
  }
}

export function CommandPalette() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthUser();
  const selectedOrgId = useSelectedOrganization();

  // The store is the single source of truth for open state, so the palette can
  // be opened from anywhere in the tree (dashboard search button, navbar) without
  // those callers having to synthesise a keystroke.
  const open = useCommandPaletteStore((s) => s.open);
  const openPalette = useCommandPaletteStore((s) => s.openPalette);
  const closePalette = useCommandPaletteStore((s) => s.closePalette);
  const togglePalette = useCommandPaletteStore((s) => s.togglePalette);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  // Seeded from localStorage once, then kept in sync by `select`. A lazy
  // initialiser rather than an effect: this component is mounted by the shell
  // only once `hydrated && user` is true, so the id is already available on the
  // first render and there is no server pass to mismatch.
  const [recents, setRecents] = useState<string[]>(() => readRecents(user?.id));

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const role = (user?.role ?? 'employee') as UserRole;
  const orgId = (selectedOrgId ?? user?.organizationId) as Id<'organizations'> | undefined;

  useGlobalShortcut({ key: 'k', meta: true }, togglePalette);

  // Roster is fetched only while the palette is open, and only once the user has
  // typed something a name could match. Without both guards, mounting this in
  // the app shell would add an org-wide subscription to every page.
  const shouldSearchPeople = open && query.trim().length >= 2 && Boolean(orgId);
  const roster = useQuery(
    api.users.queries.getUsersByOrganizationId,
    shouldSearchPeople && orgId ? { organizationId: orgId, limit: 100 } : 'skip',
  );

  const { isEnabled } = useFeatureFlags();

  const destinations = useMemo(
    () =>
      flattenNavDestinations(role).filter(
        (d) => !MODULE_TOGGLE_BY_HREF[d.href] || isEnabled(MODULE_TOGGLE_BY_HREF[d.href]),
      ),
    [role, isEnabled],
  );

  const quickActions = useMemo(
    () => QUICK_ACTIONS.filter((a) => !a.roles || a.roles.includes(role)),
    [role],
  );

  const results = useMemo<Result[]>(() => {
    const trimmed = query.trim();

    // ── Empty query: recents first, then quick actions, then top destinations.
    if (!trimmed) {
      const byHref = new Map(destinations.map((d) => [d.href, d]));
      const recentResults: Result[] = recents
        .map((href) => byHref.get(href))
        .filter((d): d is NonNullable<typeof d> => Boolean(d))
        .slice(0, MAX_RECENTS)
        .map((d, i) => ({
          id: `recent-${d.href}`,
          kind: 'nav' as const,
          label: t(d.labelKey, d.labelKey),
          hint: t('commandPalette.recent', 'Recent'),
          href: d.href,
          icon: d.icon,
          score: 1000 - i,
        }));

      const actionResults: Result[] = quickActions.map((a, i) => ({
        id: a.id,
        kind: 'action' as const,
        label: t(a.labelKey, a.fallback),
        href: a.href,
        icon: a.icon,
        score: 900 - i,
      }));

      const navResults: Result[] = destinations
        .filter((d) => !recents.includes(d.href))
        .slice(0, MAX_NAV_RESULTS)
        .map((d, i) => ({
          id: `nav-${d.href}`,
          kind: 'nav' as const,
          label: t(d.labelKey, d.labelKey),
          hint: d.groupKey ? t(d.groupKey, '') : undefined,
          href: d.href,
          icon: d.icon,
          score: 800 - i,
        }));

      return [...actionResults, ...recentResults, ...navResults];
    }

    // ── Scored search.
    const scored: Result[] = [];

    for (const action of quickActions) {
      const label = t(action.labelKey, action.fallback);
      const match = fuzzyMatchAny(trimmed, [label, action.href]);
      if (match) {
        scored.push({
          id: action.id,
          kind: 'action',
          label,
          href: action.href,
          icon: action.icon,
          // Verbs outrank nouns: someone typing "task" while the palette is open
          // more often wants to create one than to browse the list.
          score: match.score + 20,
        });
      }
    }

    const navMatches: Result[] = [];
    for (const dest of destinations) {
      const label = t(dest.labelKey, dest.labelKey);
      const group = dest.groupKey ? t(dest.groupKey, '') : undefined;
      const match = fuzzyMatchAny(trimmed, [label, group, dest.href]);
      if (match) {
        navMatches.push({
          id: `nav-${dest.href}`,
          kind: 'nav',
          label,
          hint: group || undefined,
          href: dest.href,
          icon: dest.icon,
          score: match.score,
        });
      }
    }
    navMatches.sort((a, b) => b.score - a.score);
    scored.push(...navMatches.slice(0, MAX_NAV_RESULTS));

    const peopleMatches: Result[] = [];
    for (const person of roster ?? []) {
      const name = person.name ?? '';
      const match = fuzzyMatchAny(trimmed, [name, person.email, person.department ?? undefined]);
      if (match) {
        peopleMatches.push({
          id: `person-${person._id}`,
          kind: 'person',
          label: name || person.email,
          hint: person.position || person.department || undefined,
          href: `/employees/${person._id}`,
          icon: UserRound,
          avatarUrl: person.avatarUrl ?? undefined,
          score: match.score,
        });
      }
    }
    peopleMatches.sort((a, b) => b.score - a.score);
    scored.push(...peopleMatches.slice(0, MAX_PEOPLE_RESULTS));

    return scored.sort((a, b) => b.score - a.score);
  }, [query, destinations, quickActions, recents, roster, t]);

  // Grouped for rendering, but `results` order drives keyboard navigation, so the
  // flat index and the visual order have to agree — hence the group walk below
  // reuses the same array rather than re-sorting.
  const groups = useMemo(() => {
    const map = new Map<ResultKind, Result[]>();
    for (const result of results) {
      const bucket = map.get(result.kind);
      if (bucket) bucket.push(result);
      else map.set(result.kind, [result]);
    }
    return GROUP_ORDER.filter((kind) => map.has(kind)).map((kind) => ({
      kind,
      items: map.get(kind) as Result[],
    }));
  }, [results]);

  /** Visual order, which is what ↑/↓ must follow. */
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Note: the selection is reset where the query changes (the input's onChange),
  // not in an effect watching `query`. An effect would render once with a stale
  // highlight and again with the reset one, which is visible as a flicker on the
  // first keystroke.

  const close = useCallback(() => {
    closePalette();
    setQuery('');
    setActiveIndex(0);
  }, [closePalette]);

  const select = useCallback(
    (result: Result | undefined) => {
      if (!result) return;
      if (result.kind === 'nav') {
        const next = [result.href, ...recents.filter((h) => h !== result.href)].slice(
          0,
          MAX_RECENTS,
        );
        writeRecents(user?.id, next);
        setRecents(next);
      }
      close();
      router.push(result.href);
    },
    [close, recents, router, user?.id],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      select(flat[activeIndex]);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(flat.length - 1, 0));
    }
  };

  // Keep the active row in view during keyboard navigation. `block: 'nearest'`
  // scrolls the minimum amount, so the list does not jump when moving one row.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const groupLabel = (kind: ResultKind): string => {
    if (kind === 'action') return t('commandPalette.groups.actions', 'Actions');
    if (kind === 'person') return t('commandPalette.groups.people', 'People');
    return query.trim()
      ? t('commandPalette.groups.navigate', 'Go to')
      : t('commandPalette.groups.suggested', 'Suggested');
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => (next ? openPalette() : close())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="spark-scrim fixed inset-0 z-(--z-command)" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(event) => {
            // Focus the input rather than the dialog itself, so the first
            // keystroke after ⌘K is already a search character.
            event.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            'command-panel fixed left-1/2 top-[12vh] z-(--z-command) w-[min(40rem,calc(100vw-2rem))]',
            '-translate-x-1/2 overflow-hidden rounded-sheet border border-(--border-default)',
          )}
        >
          <VisuallyHidden asChild>
            <DialogPrimitive.Title>
              {t('commandPalette.open', 'Open command palette')}
            </DialogPrimitive.Title>
          </VisuallyHidden>

          {/* Search row. No box around the input: the panel *is* the input. */}
          <div className="flex items-center gap-3 border-b border-(--border-subtle) px-4">
            <Search className="size-4 shrink-0 text-(--text-3)" aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder={t('commandPalette.placeholder', 'Search or jump to…')}
              aria-label={t('commandPalette.placeholder', 'Search or jump to…')}
              autoComplete="off"
              spellCheck={false}
              className={cn(
                'h-13 w-full min-w-0 bg-transparent text-[15px] text-(--text-1)',
                'placeholder:text-(--text-4) focus:outline-none',
              )}
            />
            <kbd className="kbd shrink-0">esc</kbd>
          </div>

          <div
            ref={listRef}
            className="max-h-[min(24rem,52vh)] overflow-y-auto overscroll-contain py-2"
          >
            {flat.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Search className="mx-auto mb-3 size-5 text-(--text-4)" aria-hidden="true" />
                <p className="text-body text-(--text-2)">
                  {t('commandPalette.noResults', 'Nothing found.')}
                </p>
                <p className="mt-1 text-caption text-(--text-3)">
                  {t('commandPalette.tryDifferent', 'Try a different query')}
                </p>
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.kind} className="px-2 pb-1">
                  <div className="eyebrow px-2 pb-1.5 pt-2">{groupLabel(group.kind)}</div>
                  {group.items.map((item) => {
                    const index = flat.indexOf(item);
                    const isActive = index === activeIndex;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-active={isActive}
                        // Pointer and keyboard drive the same single selection,
                        // so moving the mouse cannot leave two rows highlighted.
                        onMouseMove={() => setActiveIndex(index)}
                        onClick={() => select(item)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-control px-2 py-2 text-left',
                          'transition-colors duration-100 ease-spark',
                          isActive ? 'bg-(--brand-quiet)' : 'hover:bg-(--surface-2)',
                        )}
                      >
                        {item.kind === 'person' ? (
                          <Avatar className="size-7 shrink-0">
                            {item.avatarUrl && <AvatarImage src={item.avatarUrl} alt="" />}
                            <AvatarFallback className="text-[10px]">
                              {item.label.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <span
                            className={cn(
                              'flex size-7 shrink-0 items-center justify-center rounded-control',
                              isActive
                                ? 'bg-(--brand) text-(--brand-contrast)'
                                : 'bg-(--surface-2) text-(--text-3)',
                            )}
                          >
                            <Icon className="size-3.5" aria-hidden="true" />
                          </span>
                        )}

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body text-(--text-1)">
                            {item.label}
                          </span>
                          {item.hint && (
                            <span className="block truncate text-caption text-(--text-3)">
                              {item.hint}
                            </span>
                          )}
                        </span>

                        <ArrowRight
                          className={cn(
                            'size-3.5 shrink-0 text-(--text-4) transition-opacity duration-100',
                            isActive ? 'opacity-100' : 'opacity-0',
                          )}
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Hint bar. Its only job is to teach the shortcuts that make the
              palette faster than the sidebar. */}
          <div className="flex items-center gap-4 border-t border-(--border-subtle) bg-(--surface-2) px-4 py-2">
            <span className="flex items-center gap-1.5 text-caption text-(--text-3)">
              <kbd className="kbd">↑</kbd>
              <kbd className="kbd">↓</kbd>
              {t('commandPalette.navigate', 'to navigate')}
            </span>
            <span className="flex items-center gap-1.5 text-caption text-(--text-3)">
              <kbd className="kbd">
                <CornerDownLeft className="size-2.5" aria-hidden="true" />
              </kbd>
              {t('commandPalette.select', 'to select')}
            </span>
            <span className="ml-auto text-caption text-(--text-4)">
              {flat.length > 0 &&
                t('commandPalette.resultCount', '{{count}} results', { count: flat.length })}
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default CommandPalette;
