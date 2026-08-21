'use client';

/**
 * Unified Navbar — single component for both landing and dashboard.
 *
 * Detects context from pathname:
 * - Landing routes (/, /pricing, /features*, /careers*, /contact*):
 *   Shield logo + Strata text, mega menus, scroll effects, CTA buttons
 * - Dashboard routes (everything else):
 *   Shield icon, modules menu, notification bell, productivity widgets
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import type { User as UserType } from '@/store/useAuthStore';
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
import {
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
  Menu,
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { useHydrated } from '@/hooks/useHydrated';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { useNavBadges } from '@/components/layout/NavBadgesProvider';
import { useSidebarStore } from '@/store/useSidebarStore';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useStatusUpdate } from '@/context/StatusUpdateContext';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { useNow } from '@/hooks/useNow';
import { logger } from '@/lib/logger';
import {
  notificationMessage,
  notificationTitle,
  parseNotificationMeta,
} from '@/lib/notificationText';
import { EventInviteButtons } from '@/components/calendar/EventInviteActions';
import { KeyboardShortcutsModal } from '@/components/KeyboardShortcutsModal';
import { ModulesMenu } from '@/components/layout/ModulesMenu';
import { QuickStatsWidget } from '@/components/productivity/QuickStatsWidget';
import { TeamPresence } from '@/components/productivity/TeamPresence';
import { PomodoroTimer } from '@/components/productivity/PomodoroTimer';
import { FocusMode } from '@/components/productivity/FocusMode';
import { useActiveSection } from '@/hooks/useActiveSection';

// Landing-only dynamic imports
const LandingMobileMenu = dynamic(() => import('@/components/landing/MobileMenu'), {
  ssr: false,
  loading: () => null,
});
const PlatformMegaMenu = dynamic(() => import('@/components/landing/PlatformMegaMenu'), {
  ssr: false,
  loading: () => null,
});
const ResourcesMenu = dynamic(
  () => import('@/components/landing/PlatformMegaMenu').then((m) => m.ResourcesMenu),
  { ssr: false, loading: () => null },
);
const SolutionsMenu = dynamic(
  () => import('@/components/landing/SolutionMenus').then((m) => m.SolutionsMenu),
  { ssr: false, loading: () => null },
);
const WhyMenu = dynamic(() => import('@/components/landing/SolutionMenus').then((m) => m.WhyMenu), {
  ssr: false,
  loading: () => null,
});

// Presence
type PresenceStatus = 'available' | 'in_meeting' | 'in_call' | 'out_of_office' | 'busy';
const PRESENCE_CONFIG: Record<PresenceStatus, { labelKey: string; dot: string; icon: string }> = {
  available: { labelKey: 'presence.available', dot: 'bg-(--success-solid)', icon: '🟢' },
  in_meeting: { labelKey: 'presence.inMeeting', dot: 'bg-(--warning-solid)', icon: '📅' },
  in_call: { labelKey: 'presence.inCall', dot: 'bg-(--brand)', icon: '📞' },
  out_of_office: { labelKey: 'presence.outOfOffice', dot: 'bg-(--danger-solid)', icon: '🏠' },
  busy: { labelKey: 'presence.busy', dot: 'bg-(--warning-solid)', icon: '⛔' },
};

// Notifications
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

export function notificationTarget(n: NotificationItem, role?: string): string | null {
  if (n.type === 'security_alert' && n.relatedId && !n.relatedId.includes(':')) {
    return `/superadmin/security/alert/${n.relatedId}`;
  }
  if (n.relatedId?.startsWith('support_ticket:')) {
    return role === 'superadmin' ? '/superadmin/support' : '/help';
  }
  return n.route ?? NOTIFICATION_ROUTES[n.type] ?? null;
}

function PresenceEmoji({ emoji }: { emoji: string }) {
  return <span aria-hidden="true">{emoji}</span>;
}

function ShieldIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Landing route detection
const LANDING_PREFIXES = ['/', '/pricing', '/features', '/careers', '/contact'];
function isLandingPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return LANDING_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/') || pathname.startsWith(p + '?'),
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function Navbar({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useHydrated();
  const { user, logout } = useAuthStore();
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);
  const isLanding = isLandingPath(pathname);

  // Landing state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Dashboard state
  const [showNotifications, setShowNotifications] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusExpanded, setStatusExpanded] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const prevUnreadCount = useRef<number>(-1);
  const prevNotifIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);
  const scrollDirection = useScrollDirection(64, pathname);

  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {}, []);

  useEffect(() => {
    const checkScreenSize = () => setIsDesktop(window.innerWidth >= 1024);
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Landing scroll tracking
  const navRef = useRef<HTMLElement>(null);
  const scrollContainerRef = useRef<HTMLElement | Window | null>(null);

  useEffect(() => {
    if (!embedded || !isLanding) return;
    let el: HTMLElement | null = navRef.current?.parentElement ?? null;
    while (el) {
      const s = getComputedStyle(el);
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') {
        scrollContainerRef.current = el;
        return;
      }
      el = el.parentElement;
    }
    scrollContainerRef.current = window;
  }, [embedded, isLanding]);

  useEffect(() => {
    if (!isLanding) return;
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const container = embedded ? (scrollContainerRef.current ?? window) : window;
        const top = container === window ? window.scrollY : (container as HTMLElement).scrollTop;
        setScrolled(top > 20);
        const max =
          container === window
            ? document.documentElement.scrollHeight - window.innerHeight
            : (container as HTMLElement).scrollHeight - (container as HTMLElement).clientHeight;
        setScrollProgress(max > 0 ? Math.min(100, (top / max) * 100) : 0);
        ticking = false;
      });
    };
    const container = embedded ? (scrollContainerRef.current ?? window) : window;
    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
  }, [embedded, isLanding]);

  // Landing section tracking
  const sectionIds = useMemo(
    () => (pathname === '/' ? ['home', 'pricing', 'testimonials', 'faq'] : []),
    [pathname],
  );
  const activeSection = useActiveSection(sectionIds);

  // Dashboard notifications
  const { notifications: sharedNotifications } = useNavBadges();
  const notifications = useMemo(() => sharedNotifications ?? [], [sharedNotifications]);
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

  useEffect(() => {
    if (!notifications || notifications.length === 0) return;
    if (isFirstLoad.current) {
      notifications.forEach((n: NotificationItem) => prevNotifIds.current.add(n._id));
      prevUnreadCount.current = unreadCount;
      isFirstLoad.current = false;
      return;
    }
    const newNotifs = notifications.filter(
      (n: NotificationItem) => !n.isRead && !prevNotifIds.current.has(n._id),
    );
    if (newNotifs.length > 0) {
      const joinApprovedNotif = newNotifs.find((n: NotificationItem) => n.type === 'join_approved');
      if (joinApprovedNotif && user?.id) {
        const { setUser } = useAuthStore.getState();
        setUser({ ...user, isApproved: true });
      }
      newNotifs.forEach((n: NotificationItem) => prevNotifIds.current.add(n._id));
    }
    notifications.forEach((n: NotificationItem) => prevNotifIds.current.add(n._id));
    prevUnreadCount.current = unreadCount;
  }, [notifications, unreadCount, user]);

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

  const handleLogout = async () => {
    try {
      logout();
      document.cookie = 'hr-auth-token=; path=/; max-age=0';
      await logoutAction();
      await signOut({ redirect: false });
      router.push('/');
    } catch (error) {
      logger.error('Logout error:', error);
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

  return (
    <>
      {/* Notification panel (dashboard only) */}
      {!isLanding && showNotifications && (
        <div
          ref={notifRef}
          className="fixed top-16 right-4 w-[calc(100vw-2rem)] sm:w-80 bg-(--card) border border-(--border) rounded-xl shadow-2xl z-55 overflow-hidden"
          style={{ animation: 'notif-dropdown 0.15s ease both' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-(--border)">
            <p className="text-sm font-semibold text-(--text-primary)">
              {t('notifications.title')}
            </p>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Badge variant="default" className="text-xs px-1.5 py-0 bg-(--brand) text-white">
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
                    const meta = parseNotificationMeta(n.metadata);
                    const target =
                      meta.type === 'calendar_invite' && meta.date
                        ? `/calendar?date=${meta.date}`
                        : notificationTarget(n, user?.role);
                    if (target) router.push(target);
                    setShowNotifications(false);
                  }}
                  className={`px-4 py-3 hover:bg-(--background-subtle) cursor-pointer transition-colors ${!n.isRead ? 'bg-(--brand)/5 border-l-2 border-(--brand)' : ''}`}
                >
                  <p className="text-sm font-semibold text-(--text-primary) leading-snug">
                    {notificationTitle(t, n)}
                  </p>
                  <p className="text-xs text-(--text-muted) mt-1">{notificationMessage(t, n)}</p>
                  {parseNotificationMeta(n.metadata).type === 'calendar_invite' && n.relatedId && (
                    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
                      <EventInviteButtons
                        eventId={n.relatedId}
                        onResponded={() => void handleMarkRead(n._id)}
                      />
                    </div>
                  )}
                  <p className="text-xs text-(--text-muted) mt-1">{timeAgo(n._creationTime)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {isLanding ? (
        /* ── LANDING MODE ──────────────────────────────────────────── */
        <nav
          ref={navRef}
          className={`${embedded ? 'sticky top-0 z-10' : 'fixed top-0 left-0 right-0 z-[100]'} flex items-center justify-between px-4 md:px-8 lg:px-12 transition-all duration-500 ease-in-out border-b ${scrolled ? 'py-2 md:py-3 shadow-lg' : 'py-3 md:py-4'}`}
          role="navigation"
          aria-label="Main navigation"
          style={{
            borderColor: 'var(--landing-card-border)',
            willChange: 'padding, box-shadow, background-color',
            transitionProperty: 'padding, box-shadow, background-color, backdrop-filter',
          }}
        >
          <div
            className="absolute inset-0 backdrop-blur-xl border-b transition-all duration-500 ease-in-out"
            style={{
              background: scrolled
                ? 'rgba(var(--landing-navbar-bg-rgb, 15, 23, 42), 0.98)'
                : 'rgba(var(--landing-navbar-bg-rgb, 15, 23, 42), 0.7)',
              borderColor: 'var(--landing-card-border)',
              transition:
                'box-shadow 0.5s cubic-bezier(0.4, 0, 0.2, 1), background 0.5s ease-in-out, backdrop-filter 0.5s ease',
              backdropFilter: scrolled ? 'blur(24px) saturate(180%)' : 'blur(16px) saturate(140%)',
              WebkitBackdropFilter: scrolled
                ? 'blur(24px) saturate(180%)'
                : 'blur(16px) saturate(140%)',
              boxShadow: scrolled
                ? '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)'
                : '0 0 0 0 rgba(0, 0, 0, 0)',
            }}
          />
          <div
            className="absolute bottom-0 left-0 h-0.5 pointer-events-none"
            style={{
              width: `${scrollProgress}%`,
              background: 'linear-gradient(90deg, #2563eb, #06b6d4, #8b5cf6)',
              boxShadow: '0 0 8px rgba(37, 99, 235, 0.5)',
              transition: 'width 0.1s linear',
              zIndex: 2,
            }}
            aria-hidden="true"
          />

          <Link
            href="/"
            className="relative flex items-center gap-3 group"
            title={t('auth.logoTooltip')}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center logo-spin"
              style={{ background: 'linear-gradient(135deg, var(--brand), var(--brand-hover))' }}
              aria-hidden="true"
            >
              <ShieldIcon />
            </div>
            <span
              className="font-bold text-lg tracking-tight transition-colors"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              <span style={{ color: 'var(--primary)' }}>Strata</span>
            </span>
          </Link>

          <div className="relative hidden lg:flex items-center gap-4 xl:gap-6">
            {mounted && <PlatformMegaMenu />}
            {mounted && <SolutionsMenu />}
            {mounted && <WhyMenu />}
            {mounted && <ResourcesMenu activeSection={activeSection} />}
          </div>

          <div className="relative flex items-center gap-2 md:gap-3">
            {mounted && (
              <span
                style={{ color: 'var(--landing-text-primary)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--landing-text-primary)';
                }}
              >
                <LanguageSwitcher />
              </span>
            )}
            {mounted && <ThemeSwitcher />}
            {mounted && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-xl px-2 py-1.5 md:px-3 md:py-2 transition-all outline-none focus-visible:outline-none focus:outline-none hover:bg-(--background-subtle)">
                    <Avatar className="w-7 h-7 md:w-8 md:h-8">
                      {user.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                      <AvatarFallback className="text-xs bg-linear-to-br from-(--brand) to-(--brand) text-white font-semibold">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  className="z-[9999] w-56 rounded-2xl border border-(--border)/50 bg-(--card) p-2 shadow-2xl"
                >
                  <DropdownMenuLabel className="px-3 py-2.5 text-(--text-primary) font-semibold text-sm">
                    {t('landingExtra.myAccount')}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-(--border)/50 my-1" />
                  <DropdownMenuItem
                    className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3"
                    onClick={() => router.push('/dashboard')}
                  >
                    <span className="font-medium">{t('nav.dashboard')}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3"
                    onClick={() => router.push('/settings')}
                  >
                    <span className="font-medium">{t('nav.settings')}</span>
                  </DropdownMenuItem>
                  {!isDesktop && (
                    <>
                      <DropdownMenuSeparator className="bg-(--border)/50 my-1" />
                      <DropdownMenuItem
                        className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3"
                        onClick={() => router.push('/features')}
                      >
                        <span className="font-medium">{t('landing.features')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3"
                        onClick={() => router.push(pathname === '/' ? '/#pricing' : '/pricing')}
                      >
                        <span className="font-medium">{t('landing.pricing')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3"
                        onClick={() => router.push('/#testimonials')}
                      >
                        <span className="font-medium">{t('landing.testimonials')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3"
                        onClick={() => router.push('/#faq')}
                      >
                        <span className="font-medium">{t('landing.faq')}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-(--text-primary) cursor-pointer rounded-xl px-3 py-2.5 gap-3"
                        onClick={() => router.push('/careers')}
                      >
                        <span className="font-medium">{t('nav.recruitment', 'Careers')}</span>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator className="bg-(--border)/50 my-1" />
                  <DropdownMenuItem
                    className="text-(--danger-text) cursor-pointer rounded-xl px-3 py-2.5 gap-3 hover:bg-(--danger-quiet) focus:bg-(--danger-quiet)"
                    onClick={handleLogout}
                  >
                    <span className="font-medium">{t('landingExtra.logOut')}</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
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
                    background: 'linear-gradient(135deg, var(--brand), var(--brand-hover))',
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
                <button
                  onClick={() => setIsMobileMenuOpen(true)}
                  className="lg:hidden w-11 h-11 rounded-xl transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-(--brand-text)"
                  style={{
                    backgroundColor: 'var(--landing-card-bg)',
                    border: '1px solid var(--landing-card-border)',
                  }}
                  aria-label="Open mobile menu"
                >
                  <svg
                    className="w-6 h-6"
                    style={{ color: 'var(--landing-text-primary)' }}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </nav>
      ) : (
        /* ── DASHBOARD MODE ────────────────────────────────────────── */
        <header
          className={`h-16 border-b border-(--border) bg-(--navbar-bg) flex items-center px-4 gap-4 sticky top-0 z-50 transition-[translate,margin,colors] duration-300 ${scrollDirection === 'down' ? 'max-lg:-translate-y-full max-lg:-mb-16' : 'translate-y-0'}`}
        >
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

          <Link href="/" className="flex items-center gap-2 group" title={t('nav.home')}>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--brand), var(--brand-hover))' }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
          </Link>

          <div className="flex-1 flex items-center gap-2">
            <div className="hidden lg:block">
              <ModulesMenu />
            </div>
          </div>

          <div className="flex items-center gap-1">
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
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-(--brand) text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Button>
              </span>
            </div>

            <LanguageSwitcher />
            <ThemeSwitcher />

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
                  <button
                    className="absolute top-1 right-3 p-1.5 rounded-lg text-(--text-muted) hover:text-(--text-primary) hover:bg-(--background-subtle) transition-colors"
                    style={{ zIndex: 999 }}
                    onClick={() => setMenuOpen(false)}
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  {mounted && user && (
                    <>
                      <QuickStatsWidget />
                      <DropdownMenuSeparator className="bg-(--border)" />
                      <FocusMode currentPresence={currentPresence} />
                      <DropdownMenuSeparator className="bg-(--border)" />
                      <PomodoroTimer />
                      <DropdownMenuSeparator className="bg-(--border)" />
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
                      className={`h-4 w-4 text-(--text-muted) transition-transform duration-200 ${statusExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                  <div
                    className={`overflow-hidden transition-all duration-300 ease-out ${statusExpanded ? 'max-h-75 opacity-100' : 'max-h-0 opacity-0'}`}
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
                              setStatusExpanded(false);
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
      )}

      {/* Landing mobile menu */}
      {isLanding && isMobileMenuOpen && (
        <LandingMobileMenu
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
          activeSection={activeSection}
        />
      )}

      {/* Dashboard shortcuts modal */}
      {!isLanding && (
        <KeyboardShortcutsModal
          isOpen={showShortcutsModal}
          onClose={() => setShowShortcutsModal(false)}
        />
      )}
    </>
  );
}

export default Navbar;
