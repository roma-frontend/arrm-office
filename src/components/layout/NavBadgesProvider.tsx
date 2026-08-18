'use client';

/**
 * Shared nav-badge subscriptions.
 *
 * Before this provider, the desktop sidebar, mobile sidebar, mobile dock,
 * navbar and notification banner each held their own copies of the same Convex
 * subscriptions (~20 live subscriptions per page). Every notification insert or
 * chat message re-ran three to five identical queries per connected client —
 * the single largest source of Convex bandwidth in the app.
 *
 * Now the whole shell shares exactly four subscriptions:
 *   1. `notifications.getUserNotifications` — feeds the navbar dropdown, the
 *      banner (sound + toast) and the task badge.
 *   2. `chat.queries.getTotalUnread` — kept separate from the grouped badges
 *      because chatMembers is the highest-write table; grouping it would re-run
 *      the whole badge read set on every message.
 *   3. `badges.getNavBadges` — leaves / signatures / approvals / news counters,
 *      each with a bounded read set (see convex/badges.ts).
 *   4. `organizations.getMyOrganization` — org name for both sidebars.
 */

import React, { createContext, useContext, useMemo } from 'react';
import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useAuthUser } from '@/store/useAuthStore';

type NotificationsList = FunctionReturnType<typeof api.notifications.getUserNotifications>;
type UserOrg = FunctionReturnType<typeof api.organizations.getMyOrganization>;

export interface NavBadgesValue {
  /** Latest 50 notifications — `undefined` while loading. */
  notifications: NotificationsList | undefined;
  /** Caller's organization — `undefined` while loading. */
  userOrg: UserOrg | undefined;
  /** Total unread chat messages across conversations. */
  chatUnread: number;
  /** Unread notifications routed to /tasks. */
  taskUnread: number;
  /** Unread notifications routed to /calendar (meeting invites and updates). */
  calendarUnread: number;
  /** All unread notifications (navbar bell). */
  notificationsUnread: number;
  /** Pending leave requests awaiting review (staff only). */
  leavesUnread: number;
  /** Signature requests waiting on the caller. */
  pendingSignatures: number;
  /** Users awaiting approval (org admins only). */
  pendingApprovals: number;
  /** Unread announcements. */
  newsUnread: number;
}

const EMPTY: NavBadgesValue = {
  notifications: undefined,
  userOrg: undefined,
  chatUnread: 0,
  taskUnread: 0,
  calendarUnread: 0,
  notificationsUnread: 0,
  leavesUnread: 0,
  pendingSignatures: 0,
  pendingApprovals: 0,
  newsUnread: 0,
};

const NavBadgesContext = createContext<NavBadgesValue>(EMPTY);

/** Safe outside the provider too — returns zeroed counters. */
export function useNavBadges(): NavBadgesValue {
  return useContext(NavBadgesContext);
}

export function NavBadgesProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthUser();
  const userId = user?.id as Id<'users'> | undefined;
  const organizationId = user?.organizationId as Id<'organizations'> | undefined;

  const notifications = useQuery(
    api.notifications.getUserNotifications,
    userId ? { userId } : 'skip',
  );
  const chatUnread = useQuery(
    api.chat.queries.getTotalUnread,
    userId && organizationId ? { userId, organizationId } : 'skip',
  );
  const badges = useQuery(api.badges.getNavBadges, userId ? {} : 'skip');
  const userOrg = useQuery(api.organizations.getMyOrganization, userId ? { userId } : 'skip');

  const value = useMemo<NavBadgesValue>(() => {
    const list = notifications ?? [];
    return {
      notifications,
      userOrg,
      chatUnread: chatUnread ?? 0,
      // Task notifications are typed `system`, so they are identified by route —
      // titles are localized and matching English words silently zeroed this
      // badge in every other language.
      taskUnread: list.filter((n) => !n.isRead && n.route === '/tasks').length,
      calendarUnread: list.filter((n) => !n.isRead && n.route === '/calendar').length,
      notificationsUnread: list.filter((n) => !n.isRead).length,
      leavesUnread: badges?.leavesUnread ?? 0,
      pendingSignatures: badges?.pendingSignatures ?? 0,
      pendingApprovals: badges?.pendingApprovals ?? 0,
      newsUnread: badges?.newsUnread ?? 0,
    };
  }, [notifications, userOrg, chatUnread, badges]);

  return <NavBadgesContext.Provider value={value}>{children}</NavBadgesContext.Provider>;
}
