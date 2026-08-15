'use client';

/**
 * Full-height "all sections" sheet behind the mobile dock's centre button.
 *
 * The dock (see MobileTabBar) only carries the four hottest destinations; every
 * other route in the product lives here, grouped and searchable. The sheet is
 * deliberately rendered *under* the dock (z-index 104 vs 105) so the centre
 * button stays reachable and can morph into a close affordance instead of the
 * sheet having to grow its own — one control, two states.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  Calendar,
  CalendarDays,
  Car,
  CheckSquare,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Cpu,
  CreditCard,
  Crosshair,
  Database,
  DollarSign,
  DoorOpen,
  FileText,
  GraduationCap,
  Heart,
  HelpCircle,
  Key,
  Layers,
  LayoutDashboard,
  Library,
  Megaphone,
  Monitor,
  Network,
  Package,
  PenTool,
  Receipt,
  Rocket,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Table2,
  Target,
  Ticket,
  ToggleLeft,
  User,
  UserCheck,
  UserMinus,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODULE_TOGGLE_BY_HREF, useFeatureFlags } from '@/hooks/useFeatureFlags';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';

/** How long the enter/leave keyframes run — keep in sync with globals.css. */
const SHEET_ANIM_MS = 260;

type MenuItem = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  /** Omitted means "every role". */
  roles?: readonly string[];
};

type MenuGroup = { titleKey: string; items: readonly MenuItem[] };

const ADMINS = ['superadmin', 'admin'] as const;
const MANAGERS = ['superadmin', 'admin', 'supervisor'] as const;
const SUPERADMIN = ['superadmin'] as const;

/**
 * Mirrors the sidebar's routes, flattened: on a phone a two-level tree costs a
 * tap per level, while a labelled grid is one tap plus one glance.
 */
const GROUPS: readonly MenuGroup[] = [
  {
    titleKey: 'nav.groups.workspace',
    items: [
      { href: '/employees', labelKey: 'nav.employees', icon: Users },
      { href: '/attendance', labelKey: 'nav.attendance', icon: Clock },
      { href: '/calendar', labelKey: 'nav.calendar', icon: CalendarDays },
      { href: '/rooms', labelKey: 'nav.rooms', icon: DoorOpen },
      { href: '/documents', labelKey: 'nav.documents', icon: FileText },
      { href: '/assets', labelKey: 'nav.assets', icon: Package, roles: MANAGERS },
    ],
  },
  {
    titleKey: 'nav.groups.performance',
    items: [
      { href: '/performance', labelKey: 'nav.performance', icon: Target },
      { href: '/goals', labelKey: 'nav.goals', icon: Crosshair },
      { href: '/strategy', labelKey: 'nav.strategyMap', icon: Layers },
      { href: '/signatures', labelKey: 'nav.signatures', icon: PenTool },
      { href: '/recognition', labelKey: 'nav.recognition', icon: Heart },
    ],
  },
  {
    titleKey: 'nav.groups.talent',
    items: [
      { href: '/recruitment', labelKey: 'nav.recruitment', icon: Briefcase, roles: MANAGERS },
      { href: '/onboarding', labelKey: 'nav.onboarding', icon: Rocket, roles: MANAGERS },
      { href: '/offboarding', labelKey: 'nav.offboarding', icon: UserMinus, roles: MANAGERS },
      { href: '/learning', labelKey: 'nav.learning', icon: GraduationCap },
    ],
  },
  {
    titleKey: 'nav.groups.finance',
    items: [
      { href: '/payroll', labelKey: 'nav.payroll', icon: Wallet, roles: MANAGERS },
      { href: '/compensation', labelKey: 'nav.compensation', icon: DollarSign, roles: MANAGERS },
      { href: '/expenses', labelKey: 'nav.expenses', icon: Receipt, roles: MANAGERS },
    ],
  },
  {
    titleKey: 'nav.groups.reports',
    items: [
      { href: '/reports', labelKey: 'nav.reports', icon: FileText, roles: MANAGERS },
      { href: '/analytics', labelKey: 'nav.analytics', icon: BarChart3, roles: MANAGERS },
      {
        href: '/analytics/reports',
        labelKey: 'nav.reportBuilder',
        icon: BarChart3,
        roles: MANAGERS,
      },
    ],
  },
  {
    titleKey: 'nav.groups.organization',
    items: [
      { href: '/org-chart', labelKey: 'nav.orgChart', icon: Network },
      { href: '/news', labelKey: 'nav.news', icon: Megaphone },
      { href: '/surveys', labelKey: 'nav.surveys', icon: ClipboardList },
      { href: '/admin/events', labelKey: 'nav.events', icon: Calendar, roles: ADMINS },
      { href: '/documents/library', labelKey: 'nav.documentLibrary', icon: Library, roles: ADMINS },
    ],
  },
  {
    titleKey: 'nav.groups.people',
    items: [
      {
        href: '/drivers',
        labelKey: 'nav.drivers',
        icon: Car,
        roles: ['superadmin', 'admin', 'supervisor', 'driver'],
      },
      { href: '/join-requests', labelKey: 'nav.joinRequests', icon: UserCheck, roles: ADMINS },
      { href: '/approvals', labelKey: 'nav.approvals', icon: UserCheck, roles: ADMINS },
    ],
  },
  {
    titleKey: 'nav.groups.admin',
    items: [
      { href: '/profile', labelKey: 'nav.profile', icon: User },
      { href: '/settings', labelKey: 'nav.settings', icon: Settings },
      { href: '/help', labelKey: 'nav.help', icon: HelpCircle },
      { href: '/compliance', labelKey: 'nav.compliance', icon: ClipboardCheck, roles: ADMINS },
      {
        href: '/admin/ai-governance',
        labelKey: 'nav.aiGovernance',
        icon: ShieldCheck,
        roles: ADMINS,
      },
    ],
  },
  {
    titleKey: 'nav.groups.superadmin',
    items: [
      {
        href: '/superadmin',
        labelKey: 'nav.superadminHub',
        icon: LayoutDashboard,
        roles: SUPERADMIN,
      },
      { href: '/admin', labelKey: 'nav.admin', icon: ShieldCheck, roles: SUPERADMIN },
      {
        href: '/superadmin/feature-toggles',
        labelKey: 'nav.featureToggles',
        icon: ToggleLeft,
        roles: SUPERADMIN,
      },
      {
        href: '/superadmin/automation',
        labelKey: 'nav.automation',
        icon: Cpu,
        roles: SUPERADMIN,
      },
      { href: '/superadmin/support', labelKey: 'nav.support', icon: Ticket, roles: SUPERADMIN },
      {
        href: '/superadmin/emergency',
        labelKey: 'nav.emergency',
        icon: AlertTriangle,
        roles: SUPERADMIN,
      },
      {
        href: '/superadmin/impersonate',
        labelKey: 'nav.impersonate',
        icon: User,
        roles: SUPERADMIN,
      },
      {
        href: '/superadmin/access-tokens',
        labelKey: 'nav.accessTokens',
        icon: Key,
        roles: SUPERADMIN,
      },
      {
        href: '/superadmin/bulk-actions',
        labelKey: 'nav.bulkActions',
        icon: CheckSquare,
        roles: SUPERADMIN,
      },
      {
        href: '/superadmin/subscriptions',
        labelKey: 'nav.subscriptions',
        icon: CreditCard,
        roles: SUPERADMIN,
      },
      { href: '/superadmin/backups', labelKey: 'nav.backups', icon: Database, roles: SUPERADMIN },
      {
        href: '/superadmin/database',
        labelKey: 'nav.database',
        icon: Table2,
        roles: SUPERADMIN,
      },
      {
        href: '/superadmin/sessions',
        labelKey: 'nav.sessions',
        icon: Monitor,
        roles: SUPERADMIN,
      },
      { href: '/superadmin/audit', labelKey: 'nav.audit', icon: ScrollText, roles: SUPERADMIN },
      {
        href: '/superadmin/security',
        labelKey: 'nav.security',
        icon: ShieldCheck,
        roles: SUPERADMIN,
      },
      { href: '/ai-site-editor', labelKey: 'nav.aiSiteEditor', icon: Sparkles, roles: SUPERADMIN },
    ],
  },
];

export interface MobileMenuSheetProps {
  open: boolean;
  onClose: () => void;
  /** Current user role; unknown roles fall back to `employee` visibility. */
  role: string;
  /** Height to keep clear at the bottom so the dock never covers a tile. */
  bottomInset: string;
}

export function MobileMenuSheet({ open, onClose, role, bottomInset }: MobileMenuSheetProps) {
  const { t } = useTranslation();
  // Kept mounted for the length of the leave animation so the sheet slides out
  // instead of vanishing between frames.
  const [present, setPresent] = useState(open);
  const [query, setQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount before the enter animation
      setPresent(true);
      return undefined;
    }
    const timer = setTimeout(() => setPresent(false), SHEET_ANIM_MS);
    return () => clearTimeout(timer);
  }, [open]);

  // Reset the filter and scroll position between openings — a stale query makes
  // the sheet look empty on the next tap.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fresh sheet on every open
    setQuery('');
    scrollRef.current?.scrollTo({ top: 0 });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const { isEnabled } = useFeatureFlags();

  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const allowed = (item: MenuItem) =>
      !item.roles ||
      (item.roles.includes(role) &&
        (!MODULE_TOGGLE_BY_HREF[item.href] || isEnabled(MODULE_TOGGLE_BY_HREF[item.href])));
    return GROUPS.map((group) => ({
      titleKey: group.titleKey,
      items: group.items.filter(
        (item) => allowed(item) && (!needle || t(item.labelKey).toLowerCase().includes(needle)),
      ),
    })).filter((group) => group.items.length > 0);
  }, [query, role, t, isEnabled]);

  // Loaded through `next/dynamic` with `ssr: false`, so `document` always exists
  // by the time this renders — the guard only covers test environments.
  if (typeof document === 'undefined' || !present) return null;

  return createPortal(
    <div className="fixed inset-0 z-[104] lg:hidden" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label={t('mobileNav.close', { defaultValue: 'Close' })}
        onClick={onClose}
        className={cn(
          'absolute inset-0 w-full bg-black/45 backdrop-blur-[2px]',
          open ? 'mobile-sheet-scrim-in' : 'mobile-sheet-scrim-out',
        )}
      />

      <div
        className={cn(
          // Fixed height, not `max-h`: with a content-driven height the whole
          // sheet jumped every time the filter changed the number of tiles.
          'mobile-sheet-panel absolute inset-x-0 bottom-0 flex h-[92dvh] flex-col rounded-t-[28px] border-t border-(--border)',
          open ? 'mobile-sheet-in' : 'mobile-sheet-out',
        )}
      >
        {/* Grab handle — also the primary "dismiss" target for thumbs. */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('mobileNav.close', { defaultValue: 'Close' })}
          className="mx-auto mt-2.5 mb-1 block h-1.5 w-11 shrink-0 rounded-full bg-(--text-muted)/35 transition-colors active:bg-(--text-muted)/60"
        />

        <div className="flex items-center gap-2 px-4 pt-1 pb-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--text-muted)" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('mobileNav.search', { defaultValue: 'Search sections…' })}
              aria-label={t('mobileNav.search', { defaultValue: 'Search sections' })}
              className="h-11 w-full rounded-2xl border border-(--border) bg-(--input) pl-9 pr-3 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:ring-2 focus:ring-(--primary)/30"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('mobileNav.close', { defaultValue: 'Close' })}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-(--border) text-(--text-muted) transition-transform active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4"
          style={{ paddingBottom: bottomInset }}
        >
          {/* AI assistant gets a full-width lane rather than a tile: it is the
              one entry here that answers a question instead of opening a page. */}
          <Link
            href="/ai-chat"
            onClick={onClose}
            className="mobile-sheet-ai group relative mb-4 flex w-full shrink-0 items-center gap-3 overflow-hidden rounded-2xl border border-(--primary)/30 p-3.5 text-left transition-transform active:scale-[0.99]"
          >
            <span
              aria-hidden
              className="mobile-sheet-ai-sheen pointer-events-none absolute inset-y-0 left-0 w-1/3"
            />
            <span
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-lg"
              style={{ background: 'var(--primary-gradient, var(--primary))' }}
            >
              <Sparkles className="h-5 w-5" />
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-(--success-solid) ring-2 ring-(--card)" />
            </span>
            <span className="relative min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-(--text-primary)">
                {t('nav.aiChat')}
                <span className="rounded-full bg-(--primary)/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-(--primary)">
                  AI
                </span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-(--text-muted)">
                {t('mobileNav.aiSubtitle', { defaultValue: 'Ask anything about HR' })}
              </span>
            </span>
            <ChevronRight className="relative h-4 w-4 shrink-0 text-(--primary)" />
          </Link>

          {visibleGroups.length === 0 ? (
            <p className="shrink-0 py-10 text-center text-sm text-(--text-muted)">
              {t('mobileNav.noResults', { defaultValue: 'Nothing found' })}
            </p>
          ) : (
            visibleGroups.map((group) => (
              <section key={group.titleKey} className="mb-4 shrink-0">
                <h3 className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
                  {t(group.titleKey)}
                </h3>
                <div className="grid grid-cols-3 gap-2.5">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className="flex flex-col items-center justify-start gap-2 rounded-2xl border border-(--border)/70 bg-(--background-subtle) p-3 text-center transition-[transform,background-color] active:scale-[0.97] active:bg-(--card-hover)"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--primary)/10 text-(--primary)">
                        <item.icon className="h-5 w-5" />
                      </span>
                      <span className="line-clamp-2 text-[11px] font-medium leading-tight text-(--text-primary)">
                        {t(item.labelKey)}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))
          )}

          {/* `mt-auto` keeps this pinned to the bottom of the panel when the
              filter leaves the grid short, instead of leaving it stranded in the
              middle of empty space. */}
          <div className="mt-auto flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-(--border)/70 bg-(--background-subtle) p-2">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
export default MobileMenuSheet;
