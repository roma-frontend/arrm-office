'use client';

/**
 * Mobile bottom dock — data and state wiring.
 *
 * Four destinations plus a raised centre button that opens every remaining
 * section (MobileMenuSheet). Four-plus-one beats the old flat five: the fifth
 * slot used to be another route, which left no room for the ~40 pages that
 * exist beyond it, and the centre button is the easiest target on a phone so it
 * earns the widest surface.
 *
 * All layout lives in MobileDockBar so the bar can be rendered without Convex
 * or auth; this module only decides *what* to show.
 */

import React, { useState } from 'react';
import nextDynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { CheckSquare, ClipboardList, LayoutDashboard, MessageCircle } from 'lucide-react';
import { useAuthUser } from '@/store/useAuthStore';
import { MODULE_TOGGLE_BY_HREF, useFeatureFlags } from '@/hooks/useFeatureFlags';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { MobileDockBar, type DockSlot, type DockTab } from '@/components/layout/MobileDockBar';

const MobileMenuSheet = nextDynamic(
  () => import('@/components/layout/MobileMenuSheet').then((m) => m.MobileMenuSheet),
  { ssr: false, loading: () => null },
);

/** Space the dock occupies, for callers that need to keep content clear of it. */
export const MOBILE_DOCK_INSET = 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)';

/** Best-effort haptic tick; unsupported on iOS Safari, which simply no-ops. */
function tapFeedback(ms = 8): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* vibration is a nicety, never a requirement */
  }
}

/**
 * Dock labels use their own short keys, not the sidebar's `nav.*` strings. A
 * fifth of a 360px phone is ~66px: "Командный чат" / "Besprechungsräume" do not
 * fit there and were ellipsised into nonsense next to the short labels.
 */
const TABS: readonly { href: string; icon: DockTab['icon']; labelKey: string; slot: DockSlot }[] = [
  { href: '/dashboard', icon: LayoutDashboard, labelKey: 'mobileNav.tabHome', slot: 0 },
  { href: '/leaves', icon: ClipboardList, labelKey: 'mobileNav.tabLeaves', slot: 1 },
  { href: '/tasks', icon: CheckSquare, labelKey: 'mobileNav.tabTasks', slot: 3 },
  { href: '/chat', icon: MessageCircle, labelKey: 'mobileNav.tabChat', slot: 4 },
];

export function MobileTabBar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const user = useAuthUser();
  const { isEnabled } = useFeatureFlags();
  const [menuOpen, setMenuOpen] = useState(false);
  // The sheet stays mounted after the first open so its leave animation can run;
  // before that it is not even downloaded.
  const [sheetLoaded, setSheetLoaded] = useState(false);

  const userId = user?.id as Id<'users'> | undefined;
  const organizationId = user?.organizationId as Id<'organizations'> | undefined;

  const chatUnread = useQuery(
    api.chat.queries.getTotalUnread,
    userId && organizationId ? { userId, organizationId } : 'skip',
  );
  const notifications = useQuery(
    api.notifications.getUserNotifications,
    userId ? { userId } : 'skip',
  );
  const leavesUnread = useQuery(api.leaves.getUnreadCount, user?.role === 'admin' ? {} : 'skip');
  const newsStats = useQuery(api.news.getNewsStats, organizationId ? { organizationId } : 'skip');

  // Task notifications are typed `system`, so they are identified by route —
  // matching on the (localized) title silently zeroed this in every language.
  const taskUnread = (notifications ?? []).filter((n) => !n.isRead && n.route === '/tasks').length;
  const newsUnread = (newsStats as { unreadCount?: number } | undefined)?.unreadCount ?? 0;

  const badgeFor = (href: string): number => {
    if (href === '/chat') return chatUnread ?? 0;
    if (href === '/tasks') return taskUnread;
    if (href === '/leaves') return (leavesUnread as number | undefined) ?? 0;
    return 0;
  };

  const isActive = (href: string) => pathname === href || Boolean(pathname?.startsWith(href + '/'));

  // `/chat` and `/ai-chat` hand the bottom edge to their message composer.
  const isConversationPage =
    pathname === '/chat' || pathname === '/ai-chat' || Boolean(pathname?.startsWith('/chat/'));
  if (isConversationPage) return null;

  const tabs: DockTab[] = TABS.filter(
    (tab) => !MODULE_TOGGLE_BY_HREF[tab.href] || isEnabled(MODULE_TOGGLE_BY_HREF[tab.href]),
  ).map((tab) => ({
    href: tab.href,
    icon: tab.icon,
    label: t(tab.labelKey),
    slot: tab.slot,
    badge: badgeFor(tab.href),
  }));

  const activeSlot = TABS.find((tab) => isActive(tab.href))?.slot ?? null;

  return (
    <>
      <MobileDockBar
        tabs={tabs}
        activeSlot={activeSlot}
        menuOpen={menuOpen}
        menuDot={newsUnread > 0}
        onTabClick={() => tapFeedback()}
        onMenuToggle={() => {
          tapFeedback(12);
          setSheetLoaded(true);
          setMenuOpen((open) => !open);
        }}
        menuLabel={t('mobileNav.menu', { defaultValue: 'Menu' })}
        navLabel={t('nav.openMenu', { defaultValue: 'Navigation' })}
      />

      {sheetLoaded && (
        <MobileMenuSheet
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          role={user?.role ?? 'employee'}
          bottomInset={MOBILE_DOCK_INSET}
        />
      )}
    </>
  );
}
