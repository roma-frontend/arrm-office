'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useNow } from '@/hooks/useNow';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
// framer-motion removed — replaced with CSS transitions to reduce main-thread work,
// eliminate forced reflow from JS-driven animations, and defer the framer-motion bundle
import {
  Menu,
  Bell,
  LogOut,
  User,
  Settings,
  ChevronDown,
  Check,
  X,
  Plus,
  Calendar,
  Clock,
  FileText,
  Keyboard,
  Home,
} from 'lucide-react';

type PresenceStatus = 'available' | 'in_meeting' | 'in_call' | 'out_of_office' | 'busy';
const PRESENCE_CONFIG: Record<PresenceStatus, { labelKey: string; dot: string; icon: string }> = {
  available: { labelKey: 'presence.available', dot: 'bg-(--success-solid)', icon: '🟢' },
  in_meeting: { labelKey: 'presence.inMeeting', dot: 'bg-(--warning-solid)', icon: '📅' },
  in_call: { labelKey: 'presence.inCall', dot: 'bg-(--brand)', icon: '📞' },
  out_of_office: { labelKey: 'presence.outOfOffice', dot: 'bg-(--danger-solid)', icon: '🏠' },
  busy: { labelKey: 'presence.busy', dot: 'bg-(--warning-solid)', icon: '⛔' },
};

interface NotificationItem {
  _id: Id<'notifications'>;
  title: string;
  message: string;
  isRead: boolean;
  type: string;
  relatedId?: string;
  metadata?: string;
  route?: string;
  _creationTime: number;
}

/**
 * Where clicking a notification lands, by type. Only covers types whose
 * destination isn't already stored on the row — `notify()` writes an explicit
 * `route`, which always wins.
 */
const NOTIFICATION_ROUTES: Record<string, string> = {
  join_request: '/join-requests',
  join_approved: '/dashboard',
  join_rejected: '/dashboard',
  leave_request: '/leaves',
  leave_approved: '/leaves',
  leave_rejected: '/leaves',
  driver_request: '/drivers',
  driver_request_approved: '/drivers',
  driver_request_rejected: '/drivers',
  status_change: '/drivers',
  employee_added: '/employees',
  message_mention: '/chat',
  review_deadline: '/performance',
  okr_checkin_reminder: '/goals',
  survey_auto_activated: '/surveys',
  survey_auto_closed: '/surveys',
  onboarding_task_due: '/onboarding',
  onboarding_started: '/onboarding',
  onboarding_manager_assigned: '/onboarding',
  onboarding_buddy_assigned: '/onboarding',
  onboarding_task_overdue: '/onboarding',
  asset_assigned: '/assets',
  room_booked: '/rooms',
  room_booking_cancelled: '/rooms',
  announcement_published: '/news',
};

/**
 * Resolves the click destination for a notification.
 *
 * Prefers cases that need more than the type alone (a specific alert page, or a
 * support ticket whose destination depends on the reader's role), then the
 * row's own `route`, then the per-type map. Deliberately never inspects `title`
 * or `message`: those are localized, so matching English words in them broke as
 * soon as the reader switched language.
 */
export function notificationTarget(n: NotificationItem, role?: string): string | null {
  if (n.type === 'security_alert' && n.relatedId && !n.relatedId.includes(':')) {
    return `/superadmin/security/alert/${n.relatedId}`;
  }
  if (n.relatedId?.startsWith('support_ticket:')) {
    return role === 'superadmin' ? '/superadmin/support' : '/help';
  }
  return n.route ?? NOTIFICATION_ROUTES[n.type] ?? null;
}

// Accessibility: emoji icon component with aria-hidden
function PresenceEmoji({ emoji }: { emoji: string }) {
  return <span aria-hidden="true">{emoji}</span>;
}
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useNavBadges } from '@/components/layout/NavBadgesProvider';
import { useSidebarStore } from '@/store/useSidebarStore';
import { useAuthStore } from '@/store/useAuthStore';
import type { User as UserType } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import { logoutAction } from '@/actions/auth';
import { signOut } from 'next-auth/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import type { Id } from '../../../convex/_generated/dataModel';
import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal';
import { ModulesMenu } from '@/components/layout/ModulesMenu';
import { QuickStatsWidget } from '@/components/productivity/QuickStatsWidget';
import { TeamPresence } from '@/components/productivity/TeamPresence';
import { PomodoroTimer } from '@/components/productivity/PomodoroTimer';
import { FocusMode } from '@/components/productivity/FocusMode';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { useStatusUpdate } from '@/context/StatusUpdateContext';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { logger } from '@/lib/logger';
import { notificationMessage, notificationTitle } from '@/lib/notificationText';
import Link from 'next/link';

export function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function Navbar() {
  const { t } = useTranslation();
  const router = useRouter();
  const { setMobileOpen } = useSidebarStore();
  const user = useAuthStore(useShallow((state: { user: UserType | null }) => state.user));
  const logout = useAuthStore((state) => state.logout);
  const [showNotifications, setShowNotifications] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [statusExpanded, setStatusExpanded] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const prevUnreadCount = useRef<number>(-1);
  const prevNotifIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);
  // Pathname resets the hide-on-scroll state: a new route starts at the top, and
  // routes without a scroll container (e.g. /chat) can never scroll the header
  // back into view on their own.
  const pathname = usePathname();
  const scrollDirection = useScrollDirection(64, pathname);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Notifications come from the shared NavBadgesProvider subscription (latest
  // 50) — the navbar used to keep its own always-on paginated subscription on
  // top of the four other components subscribed to the same table.
  const { notifications: sharedNotifications } = useNavBadges();
  const notifications = React.useMemo(() => sharedNotifications ?? [], [sharedNotifications]);
  const markRead = useMutation(api.notifications.markAsRead);
  const markAllRead = useMutation(api.notifications.markAllAsRead);
  const updatePresence = useMutation(api.users.mutations.updatePresenceStatus);
  const { showNotification } = useStatusUpdate();
  const currentUserData = useQuery(
    api.users.queries.getUserById,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  const currentPresence = ((currentUserData as { presenceStatus?: PresenceStatus } | null)
    ?.presenceStatus ?? 'available') as PresenceStatus;
  const presenceCfg = PRESENCE_CONFIG[currentPresence];
  const presenceLabel = t(presenceCfg.labelKey);

  const unreadCount = notifications.filter((n: { isRead: boolean }) => !n.isRead).length;

  // Detect new notifications and play sound + show toast
  useEffect(() => {
    if (!notifications || notifications.length === 0) return;

    // Skip very first load to avoid sound on page refresh
    if (isFirstLoad.current) {
      notifications.forEach((n: NotificationItem) => prevNotifIds.current.add(n._id));
      prevUnreadCount.current = unreadCount;
      isFirstLoad.current = false;
      return;
    }

    // Find truly new notifications (not seen before)
    const newNotifs = notifications.filter(
      (n: NotificationItem) => !n.isRead && !prevNotifIds.current.has(n._id),
    );

    if (newNotifs.length > 0) {
      // Check for join_approved notification — auto-redirect user to dashboard
      const joinApprovedNotif = newNotifs.find((n: NotificationItem) => n.type === 'join_approved');
      if (joinApprovedNotif && user?.id) {
        logger.log('[Navbar] Join request approved! Updating user state...');
        // Update user's isApproved status in useAuthStore
        const { setUser } = useAuthStore.getState();
        setUser({
          ...user,
          isApproved: true,
        });
      }
      // Sound + banner are handled by NotificationBanner — just track seen IDs here
      newNotifs.forEach((n: NotificationItem) => prevNotifIds.current.add(n._id));
    }

    // Also track all IDs
    notifications.forEach((n: NotificationItem) => prevNotifIds.current.add(n._id));
    prevUnreadCount.current = unreadCount;
  }, [notifications, unreadCount, user]);

  const handleLogout = async () => {
    try {
      // Clear client state FIRST to stop queries from firing with stale userId
      logout();
      document.cookie = 'hr-auth-token=; path=/; max-age=0';

      // Then logout from server session
      await logoutAction();

      // Logout from NextAuth (OAuth)
      await signOut({ redirect: false });

      // Redirect to home
      router.push('/');
    } catch (error) {
      logger.error('Logout error:', error);
      // Force logout even if error
      logout();
      router.push('/');
    }
  };

  const handleMarkAllRead = async () => {
    if (!user?.id) return;
    await markAllRead({ userId: user.id as Id<'users'> });
  };

  const handleMarkRead = async (id: Id<'notifications'>) => {
    await markRead({ notificationId: id });
  };

  const now = useNow();

  const timeAgo = (timestamp: number) => {
    const diff = now - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (days > 0) return t('time.daysAgo', { count: days });
    if (hours > 0) return t('time.hoursAgo', { count: hours });
    if (mins > 0) return t('time.minutesAgo', { count: mins });
    return t('time.justNow');
  };

  const notifRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!showNotifications) return;
    const handleClick = (e: MouseEvent) => {
      if (
        notifRef.current &&
        !notifRef.current.contains(e.target as Node) &&
        bellRef.current &&
        !bellRef.current.contains(e.target as Node)
      ) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showNotifications]);

  return (
    <>
      {showNotifications && (
        <div
          ref={notifRef}
          className="fixed top-16 right-4 w-[calc(100vw-2rem)] sm:w-80 bg-(--card) border border-(--border) rounded-xl shadow-2xl z-55 overflow-hidden"
          style={{
            animation: 'notif-dropdown 0.15s ease both',
          }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-(--border)">
            <p className="text-sm font-semibold text-(--text-primary)">
              {t('notifications.title')}
            </p>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Badge variant="default" className="text-xs px-1.5 py-0 bg-(--brand)">
                  {unreadCount}
                </Badge>
              )}
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-(--brand-text) hover:underline flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> {t('notifications.markAllAsRead')}
                </button>
              )}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-(--border)">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Bell className="w-8 h-8 text-(--text-muted) mx-auto mb-2 opacity-40" />
                <p className="text-sm text-(--text-muted)">{t('notifications.noNotifications')}</p>
              </div>
            ) : (
              notifications.map((n: NotificationItem) => (
                <div
                  key={n._id}
                  onClick={async () => {
                    await handleMarkRead(n._id);
                    const target = notificationTarget(n, user?.role);
                    if (target) router.push(target);
                    setShowNotifications(false);
                  }}
                  className={`px-4 py-3 hover:bg-(--background-subtle) cursor-pointer transition-colors ${
                    !n.isRead ? 'bg-(--brand)/5 border-l-2 border-(--brand)' : ''
                  }`}
                >
                  <p className="text-sm font-semibold text-(--text-primary) leading-snug">
                    {notificationTitle(t, n)}
                  </p>
                  <p className="text-xs text-(--text-muted) mt-1">{notificationMessage(t, n)}</p>
                  <p className="text-xs text-(--text-muted) mt-1">{timeAgo(n._creationTime)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {/* Hide-on-scroll (mobile): the header is a flex row in the column, and the
          content below scrolls in its own box — so `sticky` never engages and a
          bare `-translate-y-full` slid the bar away while *keeping* its 64px slot
          in the flow. That empty slot rendered as a solid band of the wrapper
          background between the vanished header and the unmoved content.
          `-mb-16` collapses the slot in step with the transform, so `main`
          (flex-1) grows into the freed space and there is no gap to reveal. */}
      <header
        className={`h-16 border-b border-(--border) bg-(--navbar-bg) flex items-center px-4 gap-4 sticky top-0 z-50 transition-[transform,margin,colors] duration-300 ${scrollDirection === 'down' ? 'max-lg:-translate-y-full max-lg:-mb-16' : 'translate-y-0'}`}
      >
        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden text-(--text-muted) hover:text-(--text-primary)"
          onClick={() => {
            setShowNotifications(false);
            setMobileOpen(true);
          }}
          aria-label={t('nav.openMenu', { defaultValue: 'Open menu' })}
        >
          <Menu className="w-5 h-5" />
        </Button>

        {/* Home button */}
        <Button
          variant="ghost"
          size="icon"
          className="text-(--text-muted) hover:text-(--text-primary)"
          onClick={() => router.push('/')}
          aria-label={t('nav.home', { defaultValue: 'Home' })}
          title={t('nav.home') || 'Home'}
        >
          <Home className="w-5 h-5" />
        </Button>

        {/* All-modules mega menu (desktop) + page title spacer */}
        <div className="flex-1 flex items-center gap-2">
          <div className="hidden lg:block">
            <ModulesMenu />
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-1">
          {/* Notifications */}
          <div className="relative">
            <span ref={bellRef}>
              <Button
                variant="ghost"
                size="icon"
                className="relative text-(--text-muted) hover:text-(--text-primary)"
                onClick={() => setShowNotifications(!showNotifications)}
                title={t('notifications.title', { defaultValue: 'Notifications' })}
                aria-label={t('notifications.title', { defaultValue: 'Notifications' })}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-(--brand) rounded-full animate-pulse" />
                )}
              </Button>
            </span>
          </div>

          {/* Language Switcher */}
          <LanguageSwitcher />

          {/* Theme selector */}
          <ThemeSwitcher />

          {/* User dropdown - only show when logged in */}
          {user ? (
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-(--background-subtle) transition-colors outline-none focus-visible:outline-none focus:outline-none"
                  aria-label={t('nav.userMenu', { defaultValue: 'User menu' })}
                >
                  <div className="relative">
                    <Avatar className="w-8 h-8">
                      {user?.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                      <AvatarFallback className="text-xs bg-linear-to-br from-(--brand-hover) to-(--brand-hover) text-white font-semibold">
                        {user?.name ? getInitials(user.name) : 'U'}
                      </AvatarFallback>
                    </Avatar>
                    {/* Presence dot */}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-(--navbar-bg) ${presenceCfg.dot}`}
                    />
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-semibold text-(--text-primary) leading-tight">
                      {user?.name ?? t('common.user')}
                    </p>
                    <p className="text-[10px] text-(--text-muted) capitalize">
                      <PresenceEmoji emoji={presenceCfg.icon} /> {presenceLabel}
                    </p>
                  </div>
                  <ChevronDown className="w-3 h-3 text-(--text-muted) hidden sm:block" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={8}
                collisionPadding={{ top: 72, bottom: 16, left: 16, right: 16 }}
                className="w-80 max-h-[calc(100vh-90px)] overflow-y-auto bg-(--card) border-(--border) shadow-xl"
              >
                {/* Close button */}
                <button
                  className="absolute top-1 right-3 p-1.5 rounded-lg text-(--text-muted) hover:text-(--text-primary) hover:bg-(--background-subtle) transition-colors"
                  style={{ zIndex: 999 }}
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
                {/* Productivity Widgets */}
                {mounted && user && (
                  <>
                    {/* Quick Stats Widget */}
                    <QuickStatsWidget />
                    <DropdownMenuSeparator className="bg-(--border)" />

                    {/* Focus Mode */}
                    <FocusMode currentPresence={currentPresence} />
                    <DropdownMenuSeparator className="bg-(--border)" />

                    {/* Pomodoro Timer */}
                    <PomodoroTimer />
                    <DropdownMenuSeparator className="bg-(--border)" />

                    {/* Team Presence */}
                    <TeamPresence />
                    <DropdownMenuSeparator className="bg-(--border)" />
                  </>
                )}
                <DropdownMenuLabel className="text-(--text-muted) text-xs">
                  {t('nav.quickActions')}
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-(--border)" />
                <DropdownMenuItem
                  className="text-(--text-primary) cursor-pointer hover:bg-(--background-subtle) focus:bg-(--background-subtle) gap-2 font-medium"
                  onClick={() => router.push('/tasks?new=true')}
                >
                  <Plus className="w-4 h-4 text-(--brand-text)" />
                  <span>{t('shortcuts.newTask')}</span>
                  <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-mono bg-(--background-subtle) border border-(--border) rounded">
                    ⌘T
                  </kbd>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-(--text-primary) cursor-pointer hover:bg-(--background-subtle) focus:bg-(--background-subtle) gap-2"
                  onClick={() => router.push('/leaves?new=true')}
                >
                  <Calendar className="w-4 h-4 text-(--purple-text)" />
                  <span>{t('leave.requestLeave')}</span>
                  <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-mono bg-(--background-subtle) border border-(--border) rounded">
                    ⌘L
                  </kbd>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-(--text-primary) cursor-pointer hover:bg-(--background-subtle) focus:bg-(--background-subtle) gap-2"
                  onClick={() => router.push('/attendance')}
                >
                  <Clock className="w-4 h-4 text-(--success-text)" />
                  <span>{t('navbar.clockInOut')}</span>
                  <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-mono bg-(--background-subtle) border border-(--border) rounded">
                    ⌘A
                  </kbd>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-(--text-primary) cursor-pointer hover:bg-(--background-subtle) focus:bg-(--background-subtle) gap-2"
                  onClick={() => router.push('/reports')}
                >
                  <FileText className="w-4 h-4 text-(--warning-text)" />
                  {t('navbar.myReports')}
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-(--border)" />
                <DropdownMenuLabel className="text-(--text-muted) text-xs">
                  {t('nav.accountSettings')}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className="text-(--text-primary) cursor-pointer hover:bg-(--background-subtle) focus:bg-(--background-subtle) gap-2"
                  onClick={() => router.push('/profile')}
                >
                  <User className="w-4 h-4 text-(--text-muted)" />
                  {t('nav.profile')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-(--text-primary) cursor-pointer hover:bg-(--background-subtle) focus:bg-(--background-subtle) gap-2"
                  onClick={() => router.push('/settings')}
                >
                  <Settings className="w-4 h-4 text-(--text-muted)" />
                  {t('nav.settings')}
                </DropdownMenuItem>

                {/* Status selector - collapsible */}

                {/* Status trigger button */}
                <div
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setStatusExpanded(!statusExpanded);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-all duration-200 hover:bg-(--background-subtle)/60 hover:translate-x-0.5 cursor-pointer"
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${presenceCfg.dot}`} />
                  <span className="flex-1 text-left font-medium text-(--text-primary)">
                    <PresenceEmoji emoji={presenceCfg.icon} /> {presenceLabel}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-(--text-muted) transition-transform duration-200 ${
                      statusExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </div>

                {/* Expandable status list */}
                <div
                  className={`overflow-hidden transition-all duration-300 ease-out ${
                    statusExpanded ? 'max-h-75 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="py-1">
                    {(
                      Object.entries(PRESENCE_CONFIG) as [
                        PresenceStatus,
                        (typeof PRESENCE_CONFIG)[PresenceStatus],
                      ][]
                    ).map(([key, cfg]) => (
                      <DropdownMenuItem
                        key={key}
                        onClick={async () => {
                          if (user?.id) {
                            await updatePresence({
                              userId: user.id as Id<'users'>,
                              presenceStatus: key,
                            });
                            showNotification(key, t(cfg.labelKey));
                            setStatusExpanded(false); // Close after selection
                          }
                        }}
                        className={`ml-4 ${currentPresence === key ? 'bg-(--background-subtle)/40' : ''}`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
                        <span
                          className={`text-sm flex-1 ${currentPresence === key ? 'font-semibold text-(--text-primary)' : 'text-(--text-muted)'}`}
                        >
                          {t(cfg.labelKey)}
                        </span>
                        {currentPresence === key && (
                          <Check className="w-3.5 h-3.5 text-(--brand-text)" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </div>
                </div>

                {/* Keyboard Shortcuts hint */}
                <DropdownMenuItem
                  className="text-(--text-primary) cursor-pointer hover:bg-(--background-subtle) focus:bg-(--background-subtle) gap-2"
                  onClick={() => setShowShortcutsModal(true)}
                >
                  <Keyboard className="w-4 h-4 text-(--text-muted)" />
                  <span>{t('shortcuts.keyboardShortcuts')}</span>
                  <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-mono bg-(--background-subtle) border border-(--border) rounded">
                    ⌘/
                  </kbd>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-(--border)" />
                <DropdownMenuItem
                  className="text-(--danger-text) focus:text-(--danger-text) focus:bg-(--danger-quiet) cursor-pointer gap-2"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4" />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            /* Not logged in — show login/signup buttons */
            <>
              <Link
                href="/login"
                className="hidden lg:inline-flex text-sm transition-colors font-medium px-3 lg:px-4 py-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-(--brand-text)"
                style={{ color: 'var(--landing-navbar-text)', backgroundColor: 'transparent' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--landing-navbar-text-hover)';
                  e.currentTarget.style.backgroundColor = 'var(--landing-card-bg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--landing-navbar-text)';
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                {mounted ? t('landingExtra.signIn') : 'Sign In'}
              </Link>
              <Link
                href="/register"
                className="hidden lg:inline-flex items-center gap-2 text-sm font-semibold px-4 lg:px-5 py-2.5 rounded-xl transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/50 focus:outline-none focus:ring-2 focus:ring-(--brand-text)"
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #93c5fd)',
                  color: 'var(--primary-foreground)',
                }}
              >
                {mounted ? t('landingExtra.getStarted') : 'Get Started'}
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            </>
          )}
        </div>
      </header>
      {/* Notification toasts removed — NotificationBanner handles visual + sound */}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
    </>
  );
}

export default Navbar;
