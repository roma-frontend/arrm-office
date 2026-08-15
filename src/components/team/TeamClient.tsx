'use client';

/**
 * /team — the people-facing side of the directory.
 *
 * Deliberately *not* a second /employees. That page is the HR console: create,
 * edit, deactivate, assign managers, page through everyone. This one answers the
 * questions a colleague actually has — who is here, who is away, who sits in
 * which department, whose birthday is coming up, and where do I sit in the
 * hierarchy — so it is read-only, filterable in one keystroke, and safe for
 * every role.
 *
 * Data comes from queries that already exist and are already org-scoped and
 * redacted server-side (`getAllUsers` strips credentials via `redactUser`), so
 * nothing new is exposed by this page.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import {
  Building2,
  Cake,
  CheckCircle2,
  Crown,
  Grid2X2,
  LayoutList,
  Mail,
  MapPin,
  Phone,
  PlaneTakeoff,
  Search,
  Shield,
  SlidersHorizontal,
  User,
  UserCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { motion } from '@/lib/cssMotion';
import { cn } from '@/lib/utils';
import { useAuthUser } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

// ─────────────────────────────────────────────────────────────────────────────
// Shared vocabulary — kept in sync with Navbar (presence) and
// ReportingLineWidget (roles) so the same person reads the same way everywhere.
// ─────────────────────────────────────────────────────────────────────────────

type PresenceStatus = 'available' | 'in_meeting' | 'in_call' | 'out_of_office' | 'busy';

const PRESENCE: Record<PresenceStatus, { labelKey: string; dot: string }> = {
  available: { labelKey: 'presence.available', dot: '#10b981' },
  in_meeting: { labelKey: 'presence.inMeeting', dot: '#f59e0b' },
  in_call: { labelKey: 'presence.inCall', dot: '#3b82f6' },
  out_of_office: { labelKey: 'presence.outOfOffice', dot: '#f43f5e' },
  busy: { labelKey: 'presence.busy', dot: '#f97316' },
};

type Role = 'superadmin' | 'admin' | 'supervisor' | 'employee' | 'driver';

const ROLE_COLOR: Record<string, string> = {
  admin: '#2563eb',
  supervisor: '#f59e0b',
  employee: '#10b981',
  driver: '#06b6d4',
  superadmin: '#9333ea',
};

const ROLE_ICON: Record<string, LucideIcon> = {
  admin: Crown,
  supervisor: UserCheck,
  employee: User,
  driver: User,
  superadmin: Shield,
};

/** Only the fields this page reads. `getAllUsers` returns the redacted doc. */
type Member = {
  _id: Id<'users'>;
  name: string;
  email: string;
  role: Role;
  department?: string;
  position?: string;
  location?: string;
  phone?: string;
  avatarUrl?: string;
  faceImageUrl?: string;
  presenceStatus?: PresenceStatus;
  isActive?: boolean;
  createdAt?: number;
};

type Birthday = {
  _id: Id<'users'>;
  name: string;
  avatarUrl?: string;
  department?: string;
  day: number;
  month: number;
  daysUntil: number;
  isToday: boolean;
};

type AwayEntry = {
  _id: string;
  userId: Id<'users'>;
  name: string;
  avatarUrl?: string;
  department?: string;
  type: string;
  startDate: string;
  endDate: string;
  isOutToday: boolean;
};

type SortKey = 'name' | 'department' | 'newest';
type ViewMode = 'grid' | 'list';
const VIEW_STORAGE_KEY = 'team.viewMode';

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

/** Deterministic tint per person so avatarless rows still look intentional. */
const roleTint = (role: string) => ROLE_COLOR[role] ?? '#64748b';

function Avatar({
  name,
  src,
  role,
  size,
  ring,
}: {
  name: string;
  src?: string;
  role: string;
  size: number;
  ring?: string;
}) {
  const tint = roleTint(role);
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.36),
        background: `linear-gradient(135deg, ${tint}, ${tint}88)`,
        boxShadow: ring ? `0 0 0 2px var(--card), 0 0 0 4px ${ring}` : undefined,
      }}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          width={size * 2}
          height={size * 2}
          unoptimized
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function TeamClient() {
  const { t, i18n } = useTranslation();
  const me = useAuthUser();

  // The directory describes one organization — its headcount, departments,
  // birthdays and who is away all have to agree. For a superadmin that is the
  // organization picked in the selector, falling back to their own so the page
  // is never a mix of every tenant at once.
  const selectedOrgId = useSelectedOrganization();
  const orgId = (selectedOrgId ?? me?.organizationId ?? undefined) as
    | Id<'organizations'>
    | undefined;

  const usersRaw = useQuery(
    api.users.queries.getAllUsers,
    orgId ? { limit: 100, organizationId: orgId } : 'skip',
  );
  const birthdaysRaw = useQuery(
    api.dashboard.getUpcomingBirthdays,
    orgId ? { withinDays: 45, organizationId: orgId } : 'skip',
  );
  const awayRaw = useQuery(
    api.dashboard.getOutOfOffice,
    orgId ? { withinDays: 14, organizationId: orgId } : 'skip',
  );
  const reportingLine = useQuery(api.dashboard.getReportingLine, {});

  const members = useMemo(
    () => ((usersRaw ?? []) as Member[]).filter((u) => u.isActive !== false),
    [usersRaw],
  );
  const birthdays = useMemo(() => (birthdaysRaw ?? []) as Birthday[], [birthdaysRaw]);
  const away = useMemo(() => (awayRaw ?? []) as AwayEntry[], [awayRaw]);

  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState<string>('all');
  const [role, setRole] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [view, setView] = useState<ViewMode>('grid');
  const searchRef = useRef<HTMLInputElement>(null);

  // Remember the layout choice; it is a preference, not navigation state.
  // Read in an effect rather than a useState initializer: this component is
  // server-rendered, and touching localStorage during render would hydrate a
  // different layout than the server painted.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate one-shot client-side init
      if (stored === 'grid' || stored === 'list') setView(stored);
    } catch {
      /* private mode / storage disabled — the default is fine */
    }
  }, []);

  const changeView = useCallback((next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* non-fatal */
    }
  }, []);

  // "/" jumps to search, the convention every directory on the web shares.
  // Ignored while the caret is already in a field so it never eats a literal "/".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const el = event.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable))
        return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Derived facts ─────────────────────────────────────────────────────────

  const outTodayIds = useMemo(
    () => new Set(away.filter((a) => a.isOutToday).map((a) => a.userId as string)),
    [away],
  );

  const awayByUser = useMemo(() => {
    const map = new Map<string, AwayEntry>();
    // Earliest start wins; the query already sorts ascending by startDate.
    for (const entry of away) if (!map.has(entry.userId)) map.set(entry.userId, entry);
    return map;
  }, [away]);

  const birthdayByUser = useMemo(() => {
    const map = new Map<string, Birthday>();
    for (const b of birthdays) if (!map.has(b._id)) map.set(b._id, b);
    return map;
  }, [birthdays]);

  const departments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) {
      const key = m.department?.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [members]);

  const roles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) counts.set(m.role, (counts.get(m.role) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [members]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = members.filter((m) => {
      if (department !== 'all' && (m.department?.trim() || '') !== department) return false;
      if (role !== 'all' && m.role !== role) return false;
      if (!needle) return true;
      return [m.name, m.email, m.position, m.department, m.location]
        .filter(Boolean)
        .some((field) => (field as string).toLowerCase().includes(needle));
    });

    const collator = new Intl.Collator(i18n.language);
    return filtered.sort((a, b) => {
      if (sort === 'newest') return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      if (sort === 'department') {
        const byDept = collator.compare(a.department ?? '\uffff', b.department ?? '\uffff');
        if (byDept !== 0) return byDept;
      }
      return collator.compare(a.name, b.name);
    });
  }, [members, query, department, role, sort, i18n.language]);

  const isLoading = usersRaw === undefined;
  const filtersActive = query.trim() !== '' || department !== 'all' || role !== 'all';

  const clearFilters = useCallback(() => {
    setQuery('');
    setDepartment('all');
    setRole('all');
  }, []);

  const formatShortDate = useCallback(
    (iso: string) => {
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return iso;
      return date.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
    },
    [i18n.language],
  );

  const formatDayMonth = useCallback(
    (day: number, month: number) =>
      new Date(Date.UTC(2000, month - 1, day)).toLocaleDateString(i18n.language, {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }),
    [i18n.language],
  );

  const stats = [
    {
      key: 'total',
      label: t('team.stat.total', { defaultValue: 'Headcount' }),
      value: members.length,
      icon: Users,
      color: '#2563eb',
    },
    {
      key: 'inOffice',
      label: t('team.stat.inOffice', { defaultValue: 'In today' }),
      value: Math.max(0, members.length - outTodayIds.size),
      icon: CheckCircle2,
      color: '#10b981',
    },
    {
      key: 'away',
      label: t('team.stat.outToday', { defaultValue: 'Away today' }),
      value: outTodayIds.size,
      icon: PlaneTakeoff,
      color: 'var(--danger-text)',
    },
    {
      key: 'departments',
      label: t('team.stat.departments', { defaultValue: 'Departments' }),
      value: departments.length,
      icon: Building2,
      color: '#9333ea',
    },
    {
      key: 'birthdays',
      label: t('team.stat.birthdays', { defaultValue: 'Birthdays soon' }),
      value: birthdays.length,
      icon: Cake,
      color: 'var(--warning-text)',
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="sr-only">{t('team.title', { defaultValue: 'Team' })}</h1>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-(--border) p-5 sm:p-7 my-6"
        style={{ background: 'var(--card)' }}
      >
        {/* Two soft blooms instead of a flat tint: keeps the header interesting
            without competing with the content below it. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.55), transparent 70%)' }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(147,51,234,0.5), transparent 70%)' }}
        />

        <div className="relative flex flex-col gap-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-(--primary)">
                {me?.organizationName ?? t('team.eyebrow', { defaultValue: 'Directory' })}
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-(--text-primary) sm:text-3xl">
                {t('team.title', { defaultValue: 'Team' })}
              </p>
              <p className="mt-1 text-sm text-(--text-muted)">
                {/* `people` rather than `count`: a `count` argument makes
                    i18next resolve plural suffixes, which these keys do not
                    define. */}
                {t('team.subtitle', {
                  defaultValue: '{{people}} colleagues across {{departments}} departments',
                  people: members.length,
                  departments: departments.length,
                })}
              </p>
            </div>

            {/* Overlapping avatar rail — a face-first summary of who is here. */}
            {members.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3">
                  {members.slice(0, 6).map((m) => (
                    <span key={m._id} className="rounded-full ring-2 ring-(--card)">
                      <Avatar
                        name={m.name}
                        src={m.avatarUrl ?? m.faceImageUrl}
                        role={m.role}
                        size={36}
                      />
                    </span>
                  ))}
                </div>
                {members.length > 6 && (
                  <span className="text-sm font-semibold text-(--text-muted)">
                    +{members.length - 6}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ── Pulse tiles ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 sm:gap-3">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + index * 0.04 }}
                  className="rounded-2xl border border-(--border) p-3 transition-colors hover:border-(--primary)/40"
                  style={{ background: 'var(--background-subtle)' }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg"
                      style={{ background: `${stat.color}1f`, color: stat.color }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-(--text-muted)">
                      {stat.label}
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-bold leading-none text-(--text-primary)">
                    {isLoading ? '—' : stat.value}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <Card className="rounded-3xl">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('team.searchPlaceholder', {
                  defaultValue: 'Search by name, role, department…',
                })}
                aria-label={t('team.searchPlaceholder', {
                  defaultValue: 'Search by name, role, department',
                })}
                className="h-11 w-full rounded-2xl border border-(--border) bg-(--input) pl-9 pr-24 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--primary) focus:outline-none focus:ring-2 focus:ring-(--primary)/25"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('common.clear', { defaultValue: 'Clear' })}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-(--text-muted) transition-colors hover:bg-(--background-subtle) hover:text-(--text-primary)"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-(--border) px-1.5 py-0.5 text-[10px] font-semibold text-(--text-muted) sm:block">
                  /
                </kbd>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="sr-only" htmlFor="team-sort">
                {t('team.sortBy', { defaultValue: 'Sort' })}
              </label>
              <div className="relative">
                <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--text-muted)" />
                <select
                  id="team-sort"
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortKey)}
                  className="h-11 appearance-none rounded-2xl border border-(--border) bg-(--input) pl-9 pr-8 text-sm font-medium text-(--text-primary) focus:border-(--primary) focus:outline-none"
                >
                  <option value="name">{t('team.sort.name', { defaultValue: 'Name' })}</option>
                  <option value="department">
                    {t('team.sort.department', { defaultValue: 'Department' })}
                  </option>
                  <option value="newest">
                    {t('team.sort.newest', { defaultValue: 'Newest' })}
                  </option>
                </select>
              </div>

              <div
                role="group"
                aria-label={t('team.viewMode', { defaultValue: 'Layout' })}
                className="flex h-11 items-center gap-1 rounded-2xl border border-(--border) p-1"
                style={{ background: 'var(--input)' }}
              >
                {(
                  [
                    ['grid', Grid2X2, t('team.view.grid', { defaultValue: 'Grid' })],
                    ['list', LayoutList, t('team.view.list', { defaultValue: 'List' })],
                  ] as const
                ).map(([mode, Icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => changeView(mode)}
                    aria-pressed={view === mode}
                    aria-label={label}
                    title={label}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                      view === mode
                        ? 'bg-(--primary) text-white'
                        : 'text-(--text-muted) hover:bg-(--background-subtle) hover:text-(--text-primary)',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Department chips: the filter people reach for most, so it gets the
              widest target and stays one tap away instead of hiding in a menu. */}
          {departments.length > 0 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <FilterChip
                active={department === 'all'}
                onClick={() => setDepartment('all')}
                label={t('team.filter.allDepartments', { defaultValue: 'All departments' })}
                count={members.length}
              />
              {departments.map(([name, count]) => (
                <FilterChip
                  key={name}
                  active={department === name}
                  onClick={() => setDepartment(name)}
                  label={name}
                  count={count}
                />
              ))}
            </div>
          )}

          {roles.length > 1 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
              <FilterChip
                active={role === 'all'}
                onClick={() => setRole('all')}
                label={t('team.filter.allRoles', { defaultValue: 'All roles' })}
                subtle
              />
              {roles.map(([name, count]) => (
                <FilterChip
                  key={name}
                  active={role === name}
                  onClick={() => setRole(name)}
                  label={t(`roles.${name}`, { defaultValue: name })}
                  count={count}
                  tint={roleTint(name)}
                  subtle
                />
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <p className="text-xs text-(--text-muted)">
              {t('team.results', {
                defaultValue: '{{shown}} of {{total}} shown',
                shown: visible.length,
                total: members.length,
              })}
            </p>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-semibold text-(--primary) transition-opacity hover:opacity-75"
              >
                {t('team.clearFilters', { defaultValue: 'Clear filters' })}
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Directory + rails ────────────────────────────────────────────── */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] sm:gap-6">
        <div>
          {isLoading ? (
            <div
              className={cn(
                'grid gap-3',
                view === 'grid' ? 'sm:grid-cols-2 2xl:grid-cols-3' : 'grid-cols-1',
              )}
            >
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-28 animate-pulse rounded-2xl border border-(--border)"
                  style={{ background: 'var(--background-subtle)' }}
                />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <Card className="rounded-3xl">
              <CardContent className="flex flex-col items-center gap-2 px-6 py-14 text-center">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ background: 'var(--background-subtle)' }}
                >
                  <Users className="h-5 w-5 text-(--text-muted)" />
                </span>
                <p className="text-sm font-semibold text-(--text-primary)">
                  {t('team.empty.title', { defaultValue: 'Nobody matches that' })}
                </p>
                <p className="max-w-xs text-xs text-(--text-muted)">
                  {t('team.empty.body', {
                    defaultValue: 'Try another name or department, or clear the filters.',
                  })}
                </p>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-2 rounded-xl px-4 py-2 text-xs font-semibold text-(--primary) transition-colors hover:bg-(--primary)/10"
                  >
                    {t('team.clearFilters', { defaultValue: 'Clear filters' })}
                  </button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div
              className={cn(
                'grid gap-3',
                view === 'grid' ? 'sm:grid-cols-2 2xl:grid-cols-3' : 'grid-cols-1',
              )}
            >
              {visible.map((member, index) => (
                <MemberCard
                  key={member._id}
                  member={member}
                  isMe={member._id === me?.id}
                  away={awayByUser.get(member._id)}
                  outToday={outTodayIds.has(member._id)}
                  birthday={birthdayByUser.get(member._id)}
                  compact={view === 'list'}
                  // Stagger only the first screenful: past that the delay is
                  // just latency the user has to sit through.
                  delay={index < 12 ? index * 0.03 : 0}
                  formatShortDate={formatShortDate}
                />
              ))}
            </div>
          )}
        </div>

        {/* Rails sit last in the DOM so screen readers and phones reach the
            directory first; on wide screens the grid puts them alongside. */}
        <aside className="space-y-4">
          <RailCard
            icon={Cake}
            color="#f59e0b"
            title={t('team.rail.birthdays', { defaultValue: 'Upcoming birthdays' })}
            loading={birthdaysRaw === undefined}
            empty={birthdays.length === 0}
          >
            <ul className="space-y-1">
              {birthdays.slice(0, 6).map((person) => (
                <li key={person._id}>
                  <Link
                    href={`/employees/${person._id}`}
                    className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-(--background-subtle)"
                  >
                    <Avatar name={person.name} src={person.avatarUrl} role="employee" size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-(--text-primary)">
                        {person.name}
                      </span>
                      <span className="block truncate text-xs text-(--text-muted)">
                        {formatDayMonth(person.day, person.month)}
                      </span>
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{
                        background: person.isToday
                          ? 'rgba(245,158,11,0.18)'
                          : 'var(--background-subtle)',
                        color: person.isToday ? '#f59e0b' : 'var(--text-muted)',
                      }}
                    >
                      {person.isToday
                        ? t('team.birthdayToday', { defaultValue: 'Today' })
                        : t('team.inDays', {
                            defaultValue: 'in {{days}}d',
                            days: person.daysUntil,
                          })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </RailCard>

          <RailCard
            icon={PlaneTakeoff}
            color="#f43f5e"
            title={t('team.rail.away', { defaultValue: 'Away soon' })}
            loading={awayRaw === undefined}
            empty={away.length === 0}
          >
            <ul className="space-y-1">
              {away.slice(0, 6).map((entry) => (
                <li key={entry._id}>
                  <Link
                    href={`/employees/${entry.userId}`}
                    className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-(--background-subtle)"
                  >
                    <Avatar name={entry.name} src={entry.avatarUrl} role="employee" size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-(--text-primary)">
                        {entry.name}
                      </span>
                      <span className="block truncate text-xs text-(--text-muted)">
                        {formatShortDate(entry.startDate)} – {formatShortDate(entry.endDate)}
                      </span>
                    </span>
                    {entry.isOutToday && (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                        style={{ background: 'var(--danger-quiet)', color: 'var(--danger-text)' }}
                      >
                        {t('team.now', { defaultValue: 'Now' })}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </RailCard>

          <RailCard
            icon={Crown}
            color="#2563eb"
            title={t('team.rail.reportingLine', { defaultValue: 'Your reporting line' })}
            loading={reportingLine === undefined}
            empty={
              !reportingLine ||
              (reportingLine.managers.length === 0 && reportingLine.directReports.length === 0)
            }
          >
            {reportingLine && (
              <div className="space-y-3">
                {reportingLine.managers.length > 0 && (
                  <RailPeople
                    label={t('team.rail.managers', { defaultValue: 'Managers' })}
                    people={reportingLine.managers}
                  />
                )}
                {reportingLine.directReports.length > 0 && (
                  <RailPeople
                    label={t('team.rail.directReports', { defaultValue: 'Direct reports' })}
                    people={reportingLine.directReports}
                  />
                )}
              </div>
            )}
          </RailCard>
        </aside>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────────────────

function FilterChip({
  active,
  onClick,
  label,
  count,
  tint,
  subtle,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  tint?: string;
  subtle?: boolean;
}) {
  const accent = tint ?? 'var(--primary)';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 font-semibold transition-colors',
        subtle ? 'h-7 text-[11px]' : 'h-8 text-xs',
        active
          ? 'border-transparent text-white'
          : 'border-(--border) text-(--text-muted) hover:border-(--primary)/40 hover:text-(--text-primary)',
      )}
      style={active ? { background: accent } : { background: 'var(--background-subtle)' }}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn('rounded-full px-1.5 py-px text-[10px] font-bold', active && 'bg-white/20')}
          style={active ? undefined : { background: 'var(--card)' }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function MemberCard({
  member,
  isMe,
  away,
  outToday,
  birthday,
  compact,
  delay,
  formatShortDate,
}: {
  member: Member;
  isMe: boolean;
  away?: AwayEntry;
  outToday: boolean;
  birthday?: Birthday;
  compact: boolean;
  delay: number;
  formatShortDate: (iso: string) => string;
}) {
  const { t } = useTranslation();
  const presence: PresenceStatus = outToday
    ? 'out_of_office'
    : (member.presenceStatus ?? 'available');
  const presenceCfg = PRESENCE[presence];
  const RoleIcon = ROLE_ICON[member.role] ?? User;
  const tint = roleTint(member.role);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="group relative overflow-hidden rounded-2xl border border-(--border) transition-all duration-200 hover:-translate-y-0.5 hover:border-(--primary)/45 hover:shadow-lg"
      style={{ background: 'var(--card)' }}
    >
      {/* Role stripe: colour-codes the row without adding another badge. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: tint }}
      />

      <Link
        href={`/employees/${member._id}`}
        className="flex items-start gap-3 p-4 pl-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)/40"
      >
        <span className="relative">
          <Avatar
            name={member.name}
            src={member.avatarUrl ?? member.faceImageUrl}
            role={member.role}
            size={compact ? 40 : 48}
            ring={isMe ? 'rgba(37,99,235,0.35)' : undefined}
          />
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-(--card)"
            style={{ background: presenceCfg.dot }}
          />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-(--text-primary)">
              {member.name}
            </span>
            {isMe && (
              <span
                className="rounded-full px-1.5 py-px text-[10px] font-bold"
                style={{ background: 'rgba(37,99,235,0.14)', color: 'var(--primary)' }}
              >
                {t('team.you', { defaultValue: 'You' })}
              </span>
            )}
          </span>

          <span className="mt-0.5 block truncate text-xs text-(--text-muted)">
            {member.position || t(`roles.${member.role}`, { defaultValue: member.role })}
          </span>

          <span className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: `${tint}1a`, color: tint }}
            >
              <RoleIcon className="h-2.5 w-2.5" />
              {t(`roles.${member.role}`, { defaultValue: member.role })}
            </span>

            {member.department && (
              <span className="inline-flex items-center gap-1 text-[11px] text-(--text-muted)">
                <Building2 className="h-3 w-3" />
                {member.department}
              </span>
            )}

            {member.location && (
              <span className="inline-flex items-center gap-1 text-[11px] text-(--text-muted)">
                <MapPin className="h-3 w-3" />
                {member.location}
              </span>
            )}
          </span>

          {(away || birthday) && (
            <span className="mt-2 flex flex-wrap items-center gap-1.5">
              {away && (
                <span
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ background: 'var(--danger-quiet)', color: 'var(--danger-text)' }}
                >
                  <PlaneTakeoff className="h-2.5 w-2.5" />
                  {outToday
                    ? t('team.backOn', {
                        defaultValue: 'Back {{date}}',
                        date: formatShortDate(away.endDate),
                      })
                    : t('team.awayFrom', {
                        defaultValue: 'Away {{date}}',
                        date: formatShortDate(away.startDate),
                      })}
                </span>
              )}
              {birthday && (
                <span
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ background: 'var(--warning-quiet)', color: 'var(--warning-text)' }}
                >
                  <Cake className="h-2.5 w-2.5" />
                  {birthday.isToday
                    ? t('team.birthdayToday', { defaultValue: 'Today' })
                    : t('team.inDays', { defaultValue: 'in {{days}}d', days: birthday.daysUntil })}
                </span>
              )}
            </span>
          )}
        </span>
      </Link>

      {/* Contact shortcuts live outside the card link so they stay real links
          rather than nested anchors (invalid HTML, and the browser picks one). */}
      <div className="flex items-center gap-1 border-t border-(--border) px-4 py-2 pl-5">
        <a
          href={`mailto:${member.email}`}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-(--text-muted) transition-colors hover:bg-(--background-subtle) hover:text-(--primary)"
        >
          <Mail className="h-3 w-3 shrink-0" />
          <span className="truncate">{member.email}</span>
        </a>
        {member.phone && (
          <a
            href={`tel:${member.phone}`}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-(--text-muted) transition-colors hover:bg-(--background-subtle) hover:text-(--primary)"
          >
            <Phone className="h-3 w-3" />
            {member.phone}
          </a>
        )}
      </div>
    </motion.div>
  );
}

function RailCard({
  icon: Icon,
  color,
  title,
  loading,
  empty,
  children,
}: {
  icon: LucideIcon;
  color: string;
  title: string;
  loading: boolean;
  empty: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Card className="rounded-3xl">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg"
            style={{ background: `${color}1f`, color }}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {loading ? (
          <ShieldLoader size="sm" variant="inline" />
        ) : empty ? (
          <p className="py-3 text-xs text-(--text-muted)">
            {t('team.rail.empty', { defaultValue: 'Nothing here yet' })}
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function RailPeople({
  label,
  people,
}: {
  label: string;
  people: { _id: string; name: string; avatarUrl?: string; position?: string }[];
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-(--text-muted)">
        {label}
      </p>
      <ul className="space-y-1">
        {people.map((person) => (
          <li key={person._id}>
            <Link
              href={`/employees/${person._id}`}
              className="flex items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-(--background-subtle)"
            >
              <Avatar name={person.name} src={person.avatarUrl} role="employee" size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-(--text-primary)">
                  {person.name}
                </span>
                {person.position && (
                  <span className="block truncate text-[11px] text-(--text-muted)">
                    {person.position}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
