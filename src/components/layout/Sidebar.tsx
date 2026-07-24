'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  CalendarDays,
  Calendar,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Building2,
  UserCheck,
  BarChart3,
  Clock,
  CheckSquare,
  User,
  Sparkles,
  X,
  CreditCard,
  ShieldCheck,
  MessageCircle,
  Car,
  Ticket,
  AlertTriangle,
  HelpCircle,
  Cpu,
  Wallet,
  DollarSign,
  Heart,
  ClipboardList,
  Target,
  PenTool,
  Crosshair,
  Briefcase,
  Rocket,
  UserMinus,
  Network,
  GraduationCap,
  FileText,
  Library,
  Database,
  ClipboardCheck,
  Receipt,
  Key,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/store/useSidebarStore';
import { useSwipe } from '@/hooks/useSwipe';
import { useAuthUser } from '@/store/useAuthStore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OrganizationSelector } from '@/components/layout/OrganizationSelector';
import { QuickActionsPalette } from '@/components/superadmin/QuickActionsPalette';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

type NavItem = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  roles: string[];
  badge?: string;
  children?: {
    href: string;
    labelKey: string;
    icon?: LucideIcon;
    roles?: string[];
  }[];
};

type NavSeparator = { type: 'separator'; labelKey?: string };

type NavEntry = NavItem | NavSeparator;

const isSeparator = (entry: NavEntry): entry is NavSeparator =>
  'type' in entry && entry.type === 'separator';

const navItems: NavEntry[] = [
  // ── Core (direct links, most used) ──
  {
    href: '/dashboard',
    labelKey: 'nav.dashboard',
    icon: LayoutDashboard,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },
  {
    href: '/employees',
    labelKey: 'nav.employees',
    icon: Users,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
    children: [
      { href: '/employees', labelKey: 'nav.employees.all', icon: Users },
      { href: '/employees/departments', labelKey: 'nav.employees.departments', icon: Building2 },
      { href: '/employees/positions', labelKey: 'nav.employees.positions', icon: Briefcase },
    ],
  },
  {
    href: '/attendance',
    labelKey: 'nav.attendance',
    icon: Clock,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },
  {
    href: '/leaves',
    labelKey: 'nav.leaves',
    icon: ClipboardList,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },
  {
    href: '/calendar',
    labelKey: 'nav.calendar',
    icon: CalendarDays,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },
  {
    href: '/tasks',
    labelKey: 'nav.tasks',
    icon: CheckSquare,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },
  {
    href: '/chat',
    labelKey: 'nav.chat',
    icon: MessageCircle,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
    badge: 'CHAT',
  },

  // ── Performance ──
  { type: 'separator', labelKey: 'nav.groups.performance' },
  {
    href: '/performance',
    labelKey: 'nav.performance',
    icon: Target,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
    children: [
      { href: '/performance', labelKey: 'nav.performance', icon: Target },
      { href: '/goals', labelKey: 'nav.goals', icon: Crosshair },
      { href: '/signatures', labelKey: 'nav.signatures', icon: PenTool },
      { href: '/recognition', labelKey: 'nav.recognition', icon: Heart },
    ],
  },

  // ── Talent ──
  { type: 'separator', labelKey: 'nav.groups.talent' },
  {
    href: '/recruitment',
    labelKey: 'nav.talent',
    icon: Briefcase,
    roles: ['superadmin', 'admin', 'supervisor'],
    children: [
      { href: '/recruitment', labelKey: 'nav.recruitment', icon: Briefcase },
      { href: '/onboarding', labelKey: 'nav.onboarding', icon: Rocket },
      { href: '/offboarding', labelKey: 'nav.offboarding', icon: UserMinus },
      { href: '/learning', labelKey: 'nav.learning', icon: GraduationCap },
    ],
  },

  // ── Finance ──
  { type: 'separator', labelKey: 'nav.groups.finance' },
  {
    href: '/payroll',
    labelKey: 'nav.finance',
    icon: Wallet,
    roles: ['superadmin', 'admin', 'supervisor'],
    children: [
      { href: '/payroll', labelKey: 'nav.payroll', icon: Wallet },
      { href: '/compensation', labelKey: 'nav.compensation', icon: DollarSign },
      {
        href: '/expenses',
        labelKey: 'nav.expenses',
        icon: Receipt,
        roles: ['superadmin', 'admin', 'supervisor'],
      },
    ],
  },

  // ── Reports ──
  { type: 'separator', labelKey: 'nav.groups.reports' },
  {
    href: '/reports',
    labelKey: 'nav.reports',
    icon: BarChart3,
    roles: ['superadmin', 'admin', 'supervisor'],
    children: [
      { href: '/reports', labelKey: 'nav.reports', icon: FileText },
      { href: '/analytics', labelKey: 'nav.analytics', icon: BarChart3 },
    ],
  },

  // ── Organization ──
  { type: 'separator', labelKey: 'nav.groups.organization' },
  {
    href: '/org-chart',
    labelKey: 'nav.organization',
    icon: Building2,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
    children: [
      { href: '/org-chart', labelKey: 'nav.orgChart', icon: Network },
      { href: '/documents', labelKey: 'nav.documents', icon: FileText },
      {
        href: '/documents/library',
        labelKey: 'nav.documentLibrary',
        icon: Library,
        roles: ['superadmin', 'admin'],
      },
      {
        href: '/admin/events',
        labelKey: 'nav.events',
        icon: Calendar,
        roles: ['superadmin', 'admin'],
      },
    ],
  },

  // ── People ──
  { type: 'separator', labelKey: 'nav.groups.people' },
  {
    href: '/drivers',
    labelKey: 'nav.people',
    icon: User,
    roles: ['superadmin', 'admin', 'supervisor', 'driver'],
    children: [
      { href: '/drivers', labelKey: 'nav.drivers', icon: Car },
      {
        href: '/join-requests',
        labelKey: 'nav.joinRequests',
        icon: UserCheck,
        roles: ['superadmin', 'admin'],
      },
    ],
  },

  // ── Approvals ──
  { type: 'separator', labelKey: 'nav.groups.communication' },
  {
    href: '/approvals',
    labelKey: 'nav.approvals',
    icon: UserCheck,
    roles: ['superadmin', 'admin'],
  },
  {
    href: '/surveys',
    labelKey: 'nav.surveys',
    icon: ClipboardList,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
  },

  // ── Settings & Admin ──
  { type: 'separator', labelKey: 'nav.groups.admin' },
  {
    href: '/settings',
    labelKey: 'nav.settings',
    icon: Settings,
    roles: ['superadmin', 'admin', 'supervisor', 'employee', 'driver'],
    children: [
      { href: '/profile', labelKey: 'nav.profile', icon: User },
      { href: '/settings', labelKey: 'nav.settings', icon: Settings },
      { href: '/admin', labelKey: 'nav.admin', icon: ShieldCheck, roles: ['superadmin'] },
      {
        href: '/superadmin/automation',
        labelKey: 'nav.automation',
        icon: Cpu,
        roles: ['superadmin'],
      },
      { href: '/superadmin/support', labelKey: 'nav.support', icon: Ticket, roles: ['superadmin'] },
      {
        href: '/superadmin/emergency',
        labelKey: 'nav.emergency',
        icon: AlertTriangle,
        roles: ['superadmin'],
      },
      {
        href: '/superadmin/impersonate',
        labelKey: 'nav.impersonate',
        icon: User,
        roles: ['superadmin'],
      },
      {
        href: '/superadmin/access-tokens',
        labelKey: 'nav.accessTokens',
        icon: Key,
        roles: ['superadmin'],
      },
      {
        href: '/superadmin/bulk-actions',
        labelKey: 'nav.bulkActions',
        icon: CheckSquare,
        roles: ['superadmin'],
      },
      {
        href: '/superadmin/subscriptions',
        labelKey: 'nav.subscriptions',
        icon: CreditCard,
        roles: ['superadmin'],
      },
      {
        href: '/superadmin/backups',
        labelKey: 'nav.backups',
        icon: Database,
        roles: ['superadmin'],
      },
      {
        href: '/superadmin/security',
        labelKey: 'nav.security',
        icon: ShieldCheck,
        roles: ['superadmin'],
      },
      {
        href: '/compliance',
        labelKey: 'nav.compliance',
        icon: ClipboardCheck,
        roles: ['superadmin', 'admin'],
      },
      {
        href: '/ai-site-editor',
        labelKey: 'nav.aiSiteEditor',
        icon: Sparkles,
        roles: ['superadmin'],
      },
    ],
  },
];

// ─── Desktop Sidebar ───────────────────────────────────────────────────────────
export function Sidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarStore();
  const user = useAuthUser();
  const [mounted, setMounted] = React.useState(false);
  const [hoveredItem, setHoveredItem] = React.useState<string | null>(null);
  const [activeSubNav, setActiveSubNav] = React.useState<NavItem | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');

  React.useEffect(() => setMounted(true), []);

  // Close sub-nav when sidebar collapses
  React.useEffect(() => {
    if (collapsed) setActiveSubNav(null);
  }, [collapsed]);

  // Get user's organization
  const userOrg = useQuery(
    api.organizations.getMyOrganization,
    mounted && user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  // Unread task notifications badge
  const notifications = useQuery(
    api.notifications.getUserNotifications,
    mounted && user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  // Unread leaves count (only for admin role)
  const unreadLeavesCount = useQuery(
    api.leaves.getUnreadCount,
    mounted && user?.id && user.role === 'admin' ? {} : 'skip',
  );

  // Unread chat messages count
  const chatUnreadCount = useQuery(
    api.chat.queries.getTotalUnread,
    mounted && user?.id && user?.organizationId
      ? {
          userId: user.id as Id<'users'>,
          organizationId: user.organizationId as Id<'organizations'>,
        }
      : 'skip',
  );

  // Pending signature requests count
  const pendingSignaturesCount = useQuery(
    api.signatures.getMyPendingSignatures,
    mounted && user?.id && user?.organizationId
      ? {
          userId: user.id as Id<'users'>,
          organizationId: user.organizationId as Id<'organizations'>,
        }
      : 'skip',
  );

  const taskUnreadCount = (notifications ?? []).filter(
    (n: any) =>
      !n.isRead && n.type === 'system' && (n.title?.includes('Task') || n.title?.includes('task')),
  ).length;

  const signatureBadgeCount = (pendingSignaturesCount ?? []).length;

  // Update browser tab title with unread chat count
  React.useEffect(() => {
    const count = chatUnreadCount ?? 0;
    document.title = count > 0 ? `(${count}) Shield HR` : 'Shield HR';
  }, [chatUnreadCount]);

  // Get user role with fallback
  const userRole = user?.role ?? 'employee';
  const isSuperadmin = user?.role === 'superadmin';

  const visibleItems = navItems.filter((item, index, arr) => {
    if (isSeparator(item)) {
      if (userRole === 'driver' || userRole === 'employee') return false;
      let hasVisibleItem = false;
      for (let i = index + 1; i < arr.length; i++) {
        const next = arr[i];
        if (!next) break;
        if (isSeparator(next)) break;
        if (next.roles.includes(userRole)) {
          hasVisibleItem = true;
          break;
        }
      }
      return hasVisibleItem;
    }
    return item.roles.includes(userRole);
  }) as NavEntry[];

  // Filter items based on search query
  const filteredItems = (() => {
    if (!searchQuery.trim()) return visibleItems;
    const query = searchQuery.toLowerCase();
    const result: NavEntry[] = [];
    for (const entry of visibleItems) {
      if (isSeparator(entry)) {
        const idx = visibleItems.indexOf(entry);
        const next = visibleItems[idx + 1];
        if (next && !isSeparator(next)) {
          const label = t(next.labelKey).toLowerCase();
          const childMatch = next.children?.some((c) =>
            t(c.labelKey).toLowerCase().includes(query),
          );
          if (label.includes(query) || childMatch) {
            result.push(entry);
          }
        }
      } else {
        const label = t(entry.labelKey).toLowerCase();
        const childMatch = entry.children?.some((c) => t(c.labelKey).toLowerCase().includes(query));
        if (label.includes(query) || childMatch) {
          result.push(entry);
        }
      }
    }
    return result;
  })();

  if (!mounted) return null;

  return (
    <aside
      data-tour="sidebar"
      className={cn(
        'relative hidden lg:flex flex-col h-screen border-r z-60 shrink-0 bg-sidebar-bg border-sidebar-border',
        collapsed ? 'w-18' : 'w-60',
      )}
      style={{
        transition: 'width 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        willChange: 'width',
      }}
    >
      {/* Header with Logo */}
      <div className="flex items-center justify-center h-16 px-4 border-b border-sidebar-border">
        {!collapsed ? (
          <div
            className="flex items-center justify-between w-full gap-3"
            style={{
              transition: 'all 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {/* Logo with text */}
            <Link
              href="/"
              className="flex items-center gap-2 hover:opacity-80 cursor-pointer transition-opacity duration-300"
            >
              <div className="btn-gradient w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-all duration-300">
                <span className="text-white font-bold text-sm">HR</span>
              </div>
              <div
                className="overflow-hidden whitespace-nowrap"
                style={{
                  opacity: collapsed ? 0 : 1,
                  transform: collapsed ? 'translateX(-8px)' : 'translateX(0)',
                  // Text appears AFTER sidebar opens (350ms delay = sidebar is mostly open)
                  transition: `opacity 250ms ease-in-out ${collapsed ? '0ms' : '350ms'}, transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1) ${collapsed ? '0ms' : '350ms'}`,
                  width: collapsed ? 0 : 'auto',
                }}
              >
                <h1 className="text-sm font-bold text-text-primary">{t('sidebar.appName')}</h1>
                <p className="text-[10px] text-text-muted">{t('sidebar.subtitle')}</p>
              </div>
            </Link>

            {/* Toggle Button */}
            <button
              onClick={toggle}
              className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                'border transition-all duration-300 hover:scale-105',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 group',
                'shadow-sm hover:shadow-md',
                'border-border text-text-muted bg-background',
                'hover:bg-sidebar-item-hover hover:border-primary hover:text-primary',
              )}
              onFocus={(e) => {
                e.currentTarget.style.outlineColor = 'var(--primary)';
              }}
              aria-label={t('sidebar.collapseSidebar')}
              title={t('sidebar.collapseSidebar')}
            >
              <ChevronLeft className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-0.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={toggle}
            className={cn(
              'w-9 h-9 rounded-lg flex items-center justify-center',
              'border transition-all duration-300 hover:scale-105',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 group',
              'shadow-sm hover:shadow-md',
              'border-border text-text-muted bg-background',
              'hover:bg-sidebar-item-hover hover:border-primary hover:text-primary',
            )}
            aria-label={t('sidebar.expandSidebar')}
            title={t('sidebar.expandSidebar')}
          >
            <ChevronRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </button>
        )}
      </div>

      {/* Quick Actions Palette (Cmd+K) - Only when expanded */}
      {!collapsed && (
        <div className="px-4 py-[12.9px] border-b border-sidebar-border">
          <QuickActionsPalette />
        </div>
      )}

      {/* Organization Selector - Top Position */}
      <div className={cn(isSuperadmin && 'px-2 py-3 border-b border-sidebar-border')}>
        <OrganizationSelector collapsed={collapsed} />
      </div>

      {/* Search Input */}
      {!collapsed && (
        <div className="px-2 py-3 border-b border-sidebar-border">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('sidebar.search', 'Search...')}
              className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-sidebar-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navigation Links */}
      <nav className="flex-1 overflow-hidden relative">
        <div className="relative h-full">
          {/* Main navigation view */}
          <div
            className="space-y-1 overflow-y-auto overflow-x-hidden   absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] p-2"
            style={{
              transform: activeSubNav ? 'translateX(-100%) scale(0.95)' : 'translateX(0) scale(1)',
              opacity: activeSubNav ? 0 : 1,
              pointerEvents: activeSubNav ? 'none' : 'auto',
            }}
          >
            {filteredItems.map((entry, index) => {
              if (isSeparator(entry)) {
                return (
                  <div
                    key={`sep-${entry.labelKey || index}`}
                    className={cn('pt-4 pb-1', collapsed ? 'px-1' : 'px-3')}
                    style={{
                      opacity: activeSubNav ? 0 : 1,
                      transform: activeSubNav ? 'translateX(-20px)' : 'translateX(0)',
                      transition: `all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${index * 0.02}s`,
                    }}
                  >
                    {!collapsed && entry.labelKey && (
                      <p
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {t(entry.labelKey)}
                      </p>
                    )}
                    {(collapsed || !entry.labelKey) && (
                      <div className="h-px" style={{ backgroundColor: 'var(--sidebar-border)' }} />
                    )}
                  </div>
                );
              }

              const item = entry as NavItem;
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              const taskBadgeCount = taskUnreadCount;
              const leaveBadgeCount = (unreadLeavesCount as number) ?? 0;
              const chatBadgeCount = chatUnreadCount ?? 0;
              const showTaskBadge = item.href === '/tasks' && taskBadgeCount > 0;
              const showLeaveBadge =
                item.href === '/leaves' && leaveBadgeCount > 0 && user?.role === 'admin';
              const showChatBadge = item.href === '/chat' && chatBadgeCount > 0;
              const showSignatureBadge = item.href === '/performance' && signatureBadgeCount > 0;
              const showBadge =
                showTaskBadge || showLeaveBadge || showChatBadge || showSignatureBadge;
              const badgeCount =
                item.href === '/leaves'
                  ? leaveBadgeCount
                  : item.href === '/tasks'
                    ? taskBadgeCount
                    : item.href === '/chat'
                      ? chatBadgeCount
                      : item.href === '/performance'
                        ? signatureBadgeCount
                        : 0;
              const hasChildren = item.children && item.children.length > 0;
              const activeClass = isActive ? 'scale-110' : '';

              return (
                <div
                  key={item.href}
                  style={{
                    opacity: activeSubNav ? 0 : 1,
                    transform: activeSubNav ? 'translateX(-20px)' : 'translateX(0)',
                    transition: `all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) ${index * 0.02}s`,
                  }}
                >
                  {hasChildren ? (
                    collapsed ? (
                      <Link
                        href={item.href}
                        onMouseEnter={() => setHoveredItem(item.href)}
                        onMouseLeave={() => setHoveredItem(null)}
                        className={cn(
                          'group relative flex items-center px-3 py-2.5 rounded-xl transition-all duration-200 w-full',
                          'focus:outline-none focus:ring-2 focus:ring-primary/30',
                          isActive
                            ? 'bg-sidebar-item-active shadow-sm text-sidebar-item-active-text'
                            : cn(
                                'text-sidebar-text',
                                hoveredItem === item.href
                                  ? 'bg-sidebar-item-hover'
                                  : 'bg-transparent',
                              ),
                        )}
                        title={t(item.labelKey)}
                      >
                        {isActive && (
                          <div
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                            style={{
                              background:
                                'linear-gradient(180deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)',
                              animation: 'slideIn 0.3s ease-out',
                            }}
                          />
                        )}
                        <div className="relative">
                          <Icon
                            className={cn(
                              'w-5 h-5 transition-all duration-200',
                              isActive ? 'scale-110' : '',
                            )}
                            style={{
                              color: isActive
                                ? 'var(--sidebar-item-active-text)'
                                : 'var(--text-disabled)',
                            }}
                          />
                          {showBadge && (
                            <span
                              className={cn(
                                'absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center shadow-lg',
                                item.href === '/chat'
                                  ? 'bg-linear-to-r from-red-500 to-red-600 animate-chat-badge'
                                  : 'bg-linear-to-r from-red-500 to-red-600 animate-pulse',
                              )}
                            >
                              {badgeCount > 9 ? '9+' : badgeCount}
                            </span>
                          )}
                          {item.badge === 'AI' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-purple-500 to-pink-500 text-white text-[8px] font-bold shadow-lg">
                              AI
                            </span>
                          )}
                          {item.badge === 'SEC' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-blue-600 to-cyan-500 text-white text-[8px] font-bold shadow-lg">
                              🛡
                            </span>
                          )}
                        </div>
                      </Link>
                    ) : (
                      <button
                        onClick={() => setActiveSubNav(item)}
                        onMouseEnter={() => setHoveredItem(item.href)}
                        onMouseLeave={() => setHoveredItem(null)}
                        className={cn(
                          'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 w-full',
                          'focus:outline-none focus:ring-2 focus:ring-primary/30',
                          isActive
                            ? 'bg-sidebar-item-active shadow-sm text-sidebar-item-active-text'
                            : cn(
                                'text-sidebar-text',
                                hoveredItem === item.href
                                  ? 'bg-sidebar-item-hover'
                                  : 'bg-transparent',
                              ),
                        )}
                      >
                        {isActive && (
                          <div
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                            style={{
                              background:
                                'linear-gradient(180deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)',
                              animation: 'slideIn 0.3s ease-out',
                            }}
                          />
                        )}
                        <div className="relative">
                          <Icon
                            className={cn(
                              'w-5 h-5 transition-all duration-200',
                              isActive ? 'scale-110' : '',
                            )}
                            style={{
                              color: isActive
                                ? 'var(--sidebar-item-active-text)'
                                : 'var(--text-disabled)',
                            }}
                          />
                          {showBadge && (
                            <span
                              className={cn(
                                'absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center shadow-lg',
                                item.href === '/chat'
                                  ? 'bg-linear-to-r from-red-500 to-red-600 animate-chat-badge'
                                  : 'bg-linear-to-r from-red-500 to-red-600 animate-pulse',
                              )}
                            >
                              {badgeCount > 9 ? '9+' : badgeCount}
                            </span>
                          )}
                          {item.badge === 'AI' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-purple-500 to-pink-500 text-white text-[8px] font-bold shadow-lg">
                              AI
                            </span>
                          )}
                          {item.badge === 'SEC' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-blue-600 to-cyan-500 text-white text-[8px] font-bold shadow-lg">
                              🛡
                            </span>
                          )}
                        </div>
                        <span className="flex-1 text-sm font-medium truncate text-left">
                          {t(item.labelKey)}
                        </span>
                        <ChevronRight className="w-4 h-4 text-text-muted transition-transform duration-300 group-hover:translate-x-0.5" />
                      </button>
                    )
                  ) : (
                    <Link
                      href={item.href}
                      onMouseEnter={() => setHoveredItem(item.href)}
                      onMouseLeave={() => setHoveredItem(null)}
                      className={cn(
                        'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
                        'focus:outline-none focus:ring-2 focus:ring-primary/30',
                        isActive
                          ? 'bg-sidebar-item-active shadow-sm text-sidebar-item-active-text'
                          : cn(
                              'text-sidebar-text',
                              hoveredItem === item.href
                                ? 'bg-sidebar-item-hover'
                                : 'bg-transparent',
                            ),
                      )}
                    >
                      {isActive && (
                        <div
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                          style={{
                            background:
                              'linear-gradient(180deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)',
                            animation: 'slideIn 0.3s ease-out',
                          }}
                        />
                      )}
                      <div className="relative">
                        <Icon
                          className={cn(
                            'w-5 h-5 transition-all duration-200',
                            isActive ? 'scale-110' : '',
                          )}
                          style={{
                            color: isActive
                              ? 'var(--sidebar-item-active-text)'
                              : 'var(--text-disabled)',
                          }}
                        />
                        {showBadge && (
                          <span
                            className={cn(
                              'absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center shadow-lg',
                              item.href === '/chat'
                                ? 'bg-linear-to-r from-red-500 to-red-600 animate-chat-badge'
                                : 'bg-linear-to-r from-red-500 to-red-600 animate-pulse',
                            )}
                          >
                            {badgeCount > 9 ? '9+' : badgeCount}
                          </span>
                        )}
                        {item.badge === 'AI' && (
                          <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-purple-500 to-pink-500 text-white text-[8px] font-bold shadow-lg">
                            AI
                          </span>
                        )}
                        {item.badge === 'SEC' && (
                          <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-blue-600 to-cyan-500 text-white text-[8px] font-bold shadow-lg">
                            🛡
                          </span>
                        )}
                      </div>
                      <span className="flex-1 text-sm font-medium truncate">
                        {t(item.labelKey)}
                      </span>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sub-navigation view */}
          {!collapsed && (
            <div
              className="space-y-1 overflow-y-auto overflow-x-hidden   absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] p-2"
              style={{
                transform: activeSubNav ? 'translateX(0) scale(1)' : 'translateX(100%) scale(0.95)',
                opacity: activeSubNav ? 1 : 0,
                pointerEvents: activeSubNav ? 'auto' : 'none',
              }}
            >
              {/* Back button */}
              <button
                onClick={() => setActiveSubNav(null)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-xl text-text-muted hover:bg-sidebar-item-hover transition-all duration-300 w-full mb-2',
                  'group/back',
                )}
                style={{
                  opacity: activeSubNav ? 1 : 0,
                  transform: activeSubNav ? 'translateX(0)' : 'translateX(20px)',
                  transition: `all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${activeSubNav ? '0.1s' : '0ms'}`,
                }}
              >
                <ChevronLeft className="w-4 h-4 transition-transform duration-300 group-hover/back:-translate-x-0.5" />
                <span className="text-sm font-medium">
                  {activeSubNav ? t(activeSubNav.labelKey) : ''}
                </span>
              </button>

              {/* Sub-nav items */}
              {activeSubNav?.children
                ?.filter((child) => !child.roles || child.roles.includes(userRole))
                .map((child, index) => {
                  const ChildIcon = (child.icon || activeSubNav.icon) as LucideIcon;
                  const isChildActive =
                    pathname === child.href || pathname.startsWith(child.href + '/');
                  const isSignaturesChild = child.href === '/signatures';
                  const showChildBadge = isSignaturesChild && signatureBadgeCount > 0;

                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onMouseEnter={() => setHoveredItem(child.href)}
                      onMouseLeave={() => setHoveredItem(null)}
                      className={cn(
                        'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
                        'focus:outline-none focus:ring-2 focus:ring-primary/30',
                        isChildActive
                          ? 'bg-sidebar-item-active shadow-sm text-sidebar-item-active-text'
                          : cn(
                              'text-sidebar-text',
                              hoveredItem === child.href
                                ? 'bg-sidebar-item-hover'
                                : 'bg-transparent',
                            ),
                      )}
                      style={{
                        opacity: activeSubNav ? 1 : 0,
                        transform: activeSubNav ? 'translateX(0)' : 'translateX(30px)',
                        transition: `all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${activeSubNav ? 0.15 + index * 0.05 : 0}s`,
                      }}
                    >
                      {isChildActive && (
                        <div
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                          style={{
                            background:
                              'linear-gradient(180deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)',
                            animation: 'slideIn 0.3s ease-out',
                          }}
                        />
                      )}
                      <div className="relative">
                        <ChildIcon
                          className={cn(
                            'w-5 h-5 transition-all duration-200',
                            isChildActive && 'scale-110',
                          )}
                          style={{
                            color: isChildActive
                              ? 'var(--sidebar-item-active-text)'
                              : 'var(--text-disabled)',
                          }}
                        />
                        {showChildBadge && (
                          <span
                            className={cn(
                              'absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center shadow-lg bg-linear-to-r from-red-500 to-red-600 animate-pulse',
                            )}
                          >
                            {signatureBadgeCount > 9 ? '9+' : signatureBadgeCount}
                          </span>
                        )}
                      </div>
                      <span className="flex-1 text-sm font-medium truncate">
                        {t(child.labelKey)}
                      </span>
                    </Link>
                  );
                })}
            </div>
          )}
        </div>
      </nav>

      {/* Organization Branding */}
      <div className="px-2 py-3 border-t" style={{ borderColor: 'var(--sidebar-border)' }}>
        <div
          className={cn(
            'bg-[var(--input)] flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300',
            collapsed && 'justify-center',
          )}
        >
          <Building2 className="w-4 h-4 shrink-0" style={{ color: 'var(--primary)' }} />
          <div
            className={cn(
              'min-w-0 flex-1',
              collapsed ? 'opacity-0 w-0 invisible' : 'opacity-100 w-auto visible',
            )}
            style={{
              transition: collapsed
                ? 'opacity 150ms ease-in-out, width 150ms ease-in-out, visibility 150ms ease-in-out'
                : 'opacity 250ms ease-in-out 350ms, width 150ms ease-in-out 350ms, visibility 0ms 350ms',
            }}
          >
            <p
              className="text-[10px] font-semibold truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {userOrg?.name ?? t('sidebar.orgName')}
            </p>
            <p className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>
              {t('sidebar.orgSubtitle')}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;

// ─── Mobile Sidebar ────────────────────────────────────────────────────────────
export function MobileSidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { mobileOpen, setMobileOpen } = useSidebarStore();
  const user = useAuthUser();
  const [mounted, setMounted] = React.useState(false);
  const sidebarRef = React.useRef<HTMLDivElement>(null);
  const [activeSubNav, setActiveSubNav] = React.useState<NavItem | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');

  React.useEffect(() => setMounted(true), []);

  // Get user's organization
  const userOrg = useQuery(
    api.organizations.getMyOrganization,
    mounted && user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  const mobileNotifications = useQuery(
    api.notifications.getUserNotifications,
    mounted && user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  // Mobile Unread leaves count (only for admin role)
  const mobileUnreadLeavesCount = useQuery(
    api.leaves.getUnreadCount,
    mounted && user?.id && user.role === 'admin' ? {} : 'skip',
  );

  // Mobile unread chat count
  const mobileChatUnreadCount = useQuery(
    api.chat.queries.getTotalUnread,
    mounted && user?.id && user?.organizationId
      ? {
          userId: user.id as Id<'users'>,
          organizationId: user.organizationId as Id<'organizations'>,
        }
      : 'skip',
  );

  // Mobile pending signature requests count
  const mobilePendingSignaturesCount = useQuery(
    api.signatures.getMyPendingSignatures,
    mounted && user?.id && user?.organizationId
      ? {
          userId: user.id as Id<'users'>,
          organizationId: user.organizationId as Id<'organizations'>,
        }
      : 'skip',
  );

  const mobileTaskBadge = (mobileNotifications ?? []).filter(
    (n: any) =>
      !n.isRead && n.type === 'system' && (n.title?.includes('Task') || n.title?.includes('task')),
  ).length;

  const mobileSignatureCount = (mobilePendingSignaturesCount ?? []).length;

  // Lock body scroll when mobile sidebar is open
  React.useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  // Close on escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileOpen, setMobileOpen]);

  // Swipe-to-open from left edge, swipe-left-to-close
  useSwipe({
    onSwipeRight: () => {
      if (!mobileOpen) setMobileOpen(true);
    },
    onSwipeLeft: () => {
      if (mobileOpen) setMobileOpen(false);
    },
    edgeSize: 30,
    threshold: 40,
    maxTime: 400,
  });

  // Get user role with fallback
  const userRole = user?.role ?? 'employee';

  const visibleItems = navItems.filter((item, index, arr) => {
    if (isSeparator(item)) {
      // Hide section headers for driver/employee roles
      if (userRole === 'driver' || userRole === 'employee') return false;
      // For other roles, only show separator if there's at least one visible nav item in this section
      let hasVisibleItem = false;
      for (let i = index + 1; i < arr.length; i++) {
        const next = arr[i];
        if (!next) break;
        if (isSeparator(next)) break;
        if (next.roles.includes(userRole)) {
          hasVisibleItem = true;
          break;
        }
      }
      return hasVisibleItem;
    }
    return item.roles.includes(userRole);
  });

  // Filter items based on search query
  const mobileFilteredItems = (() => {
    if (!searchQuery.trim()) return visibleItems;
    const query = searchQuery.toLowerCase();
    const result: NavEntry[] = [];
    for (const entry of visibleItems) {
      if (isSeparator(entry)) {
        const idx = visibleItems.indexOf(entry);
        const next = visibleItems[idx + 1];
        if (next && !isSeparator(next)) {
          const label = t(next.labelKey).toLowerCase();
          const childMatch = next.children?.some((c) =>
            t(c.labelKey).toLowerCase().includes(query),
          );
          if (label.includes(query) || childMatch) {
            result.push(entry);
          }
        }
      } else {
        const label = t(entry.labelKey).toLowerCase();
        const childMatch = entry.children?.some((c) => t(c.labelKey).toLowerCase().includes(query));
        if (label.includes(query) || childMatch) {
          result.push(entry);
        }
      }
    }
    return result;
  })();

  if (!mounted) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={-1}
        onClick={() => setMobileOpen(false)}
        onTouchStart={() => setMobileOpen(false)}
        className={cn(
          'fixed inset-0 z-[199] bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-500 cursor-pointer',
          mobileOpen ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        aria-hidden="true"
      />

      {/* Sidebar Panel */}
      <aside
        ref={sidebarRef}
        className={cn(
          'fixed top-0 left-0 bottom-0 z-[200] w-70 lg:hidden flex flex-col',
          'transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-2xl',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--sidebar-border)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between h-16 px-4 border-b"
          style={{ borderColor: 'var(--sidebar-border)' }}
        >
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 cursor-pointer"
            title={t('auth.logoTooltip')}
          >
            <div className="btn-gradient w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-all duration-300">
              <span className="text-white font-bold text-sm">HR</span>
            </div>
            <div>
              <h1 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {t('sidebar.appName')}
              </h1>
              <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {t('sidebar.subtitle')}
              </p>
            </div>
          </Link>

          {/* Close Button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-(--primary)/30 border"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff',
              backdropFilter: 'blur(8px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.color = '#ffffff';
            }}
            aria-label={t('sidebar.closeSidebar')}
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Organization Selector - Top Position Mobile */}
        <div
          className="py-3 px-2 border-b"
          style={{
            borderColor: 'var(--sidebar-border)',
            opacity: mobileOpen ? 1 : 0,
            transition: 'opacity 0.25s ease',
          }}
        >
          <OrganizationSelector collapsed={false} />
        </div>

        {/* Search Input Mobile */}
        <div
          className="px-2 py-2 border-b"
          style={{
            borderColor: 'var(--sidebar-border)',
            opacity: mobileOpen ? 1 : 0,
            transition: 'opacity 0.25s ease 0.05s',
          }}
        >
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('sidebar.search', 'Search...')}
              className="w-full px-3 py-2 rounded-lg text-sm bg-background border border-sidebar-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-text-muted hover:text-text-primary"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-hidden relative">
          <div className="relative h-full">
            {/* Main navigation view */}
            <div
              className="space-y-1 overflow-y-auto overflow-x-hidden   absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] p-2"
              style={{
                transform: activeSubNav
                  ? 'translateX(-100%) scale(0.95)'
                  : 'translateX(0) scale(1)',
                opacity: activeSubNav ? 0 : 1,
                pointerEvents: activeSubNav ? 'none' : 'auto',
              }}
            >
              {mobileFilteredItems.map((entry, index) => {
                if (isSeparator(entry)) {
                  return (
                    <div
                      key={`sep-${entry.labelKey || index}`}
                      className="pt-4 pb-1 px-3"
                      style={{
                        opacity: mobileOpen ? 1 : 0,
                        transform: mobileOpen ? 'translateX(0)' : 'translateX(-20px)',
                        transition: `all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)`,
                      }}
                    >
                      {entry.labelKey && (
                        <p
                          className="text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {t(entry.labelKey)}
                        </p>
                      )}
                      {!entry.labelKey && (
                        <div
                          className="h-px"
                          style={{ backgroundColor: 'var(--sidebar-border)' }}
                        />
                      )}
                    </div>
                  );
                }

                const item = entry as NavItem;
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                const mobileTaskCount = mobileTaskBadge;
                const mobileLeaveCount = (mobileUnreadLeavesCount as number) ?? 0;
                const mobileChatCount = mobileChatUnreadCount ?? 0;
                const mobileSignatureCount = (mobilePendingSignaturesCount ?? []).length;
                const mobileBadge =
                  item.href === '/tasks'
                    ? mobileTaskCount
                    : item.href === '/leaves' && user?.role === 'admin'
                      ? mobileLeaveCount
                      : item.href === '/chat'
                        ? mobileChatCount
                        : item.href === '/performance'
                          ? mobileSignatureCount
                          : 0;
                const hasChildren = item.children && item.children.length > 0;

                return (
                  <div
                    key={item.href}
                    style={{
                      opacity: mobileOpen && !activeSubNav ? 1 : 0,
                      transform:
                        mobileOpen && !activeSubNav ? 'translateX(0)' : 'translateX(-20px)',
                      transition: `all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)`,
                    }}
                  >
                    {hasChildren ? (
                      <button
                        onClick={() => setActiveSubNav(item)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 w-full group',
                          'focus:outline-none focus:ring-2 focus:ring-(--primary)/30',
                          isActive && 'shadow-sm',
                        )}
                        style={{
                          backgroundColor: isActive ? 'var(--sidebar-item-active)' : 'transparent',
                          color: isActive ? 'var(--sidebar-item-active-text)' : 'var(--text-muted)',
                        }}
                      >
                        {isActive && (
                          <div
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                            style={{
                              background:
                                'linear-gradient(180deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)',
                            }}
                          />
                        )}
                        <div className="relative">
                          <Icon
                            className={cn('w-5 h-5 transition-transform', isActive && 'scale-110')}
                            style={{
                              color: isActive
                                ? 'var(--sidebar-item-active-text)'
                                : 'var(--text-disabled)',
                            }}
                          />
                          {mobileBadge > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-linear-to-r from-red-500 to-red-600 text-white text-[9px] font-bold flex items-center justify-center shadow-lg animate-pulse">
                              {mobileBadge > 9 ? '9+' : mobileBadge}
                            </span>
                          )}
                          {item.badge === 'AI' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-purple-500 to-pink-500 text-white text-[8px] font-bold shadow-lg">
                              AI
                            </span>
                          )}
                          {item.badge === 'SEC' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-blue-600 to-cyan-500 text-white text-[8px] font-bold shadow-lg">
                              🛡
                            </span>
                          )}
                        </div>
                        <span className="flex-1 text-sm font-medium text-left">
                          {t(item.labelKey)}
                        </span>
                        <ChevronRight className="w-4 h-4 text-text-muted transition-transform duration-300 group-hover:translate-x-0.5" />
                      </button>
                    ) : (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          'flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200',
                          'focus:outline-none focus:ring-2 focus:ring-(--primary)/30',
                          isActive && 'shadow-sm',
                        )}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.backgroundColor = 'var(--sidebar-item-hover)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }
                        }}
                        style={{
                          backgroundColor: isActive ? 'var(--sidebar-item-active)' : 'transparent',
                          color: isActive ? 'var(--sidebar-item-active-text)' : 'var(--text-muted)',
                        }}
                      >
                        {isActive && (
                          <div
                            className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                            style={{
                              background:
                                'linear-gradient(180deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)',
                            }}
                          />
                        )}
                        <div className="relative">
                          <Icon
                            className={cn('w-5 h-5 transition-transform', isActive && 'scale-110')}
                            style={{
                              color: isActive
                                ? 'var(--sidebar-item-active-text)'
                                : 'var(--text-disabled)',
                            }}
                          />
                          {mobileBadge > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-linear-to-r from-red-500 to-red-600 text-white text-[9px] font-bold flex items-center justify-center shadow-lg animate-pulse">
                              {mobileBadge > 9 ? '9+' : mobileBadge}
                            </span>
                          )}
                          {item.badge === 'AI' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-purple-500 to-pink-500 text-white text-[8px] font-bold shadow-lg">
                              AI
                            </span>
                          )}
                          {item.badge === 'SEC' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-blue-600 to-cyan-500 text-white text-[8px] font-bold shadow-lg">
                              🛡
                            </span>
                          )}
                        </div>
                        <span className="flex-1 text-sm font-medium">{t(item.labelKey)}</span>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Sub-navigation view */}
            <div
              className="space-y-1 overflow-y-auto overflow-x-hidden   absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] p-2"
              style={{
                transform: activeSubNav ? 'translateX(0) scale(1)' : 'translateX(100%) scale(0.95)',
                opacity: activeSubNav ? 1 : 0,
                pointerEvents: activeSubNav ? 'auto' : 'none',
              }}
            >
              <button
                onClick={() => setActiveSubNav(null)}
                className={cn(
                  'flex items-center gap-2 px-3 py-3 rounded-xl text-text-muted hover:bg-sidebar-item-hover transition-all duration-300 w-full mb-2 group/back',
                )}
                style={{
                  opacity: activeSubNav ? 1 : 0,
                  transform: activeSubNav ? 'translateX(0)' : 'translateX(20px)',
                  transition: `all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${activeSubNav ? '0.1s' : '0ms'}`,
                }}
              >
                <ChevronLeft className="w-4 h-4 transition-transform duration-300 group-hover/back:-translate-x-0.5" />
                <span className="text-sm font-medium">
                  {activeSubNav ? t(activeSubNav.labelKey) : ''}
                </span>
              </button>

              {activeSubNav?.children
                ?.filter((child) => !child.roles || child.roles.includes(userRole))
                .map((child, index) => {
                  const ChildIcon = (child.icon || activeSubNav.icon) as LucideIcon;
                  const isChildActive =
                    pathname === child.href || pathname.startsWith(child.href + '/');
                  const isSignaturesChild = child.href === '/signatures';
                  const showChildBadge = isSignaturesChild && mobileSignatureCount > 0;

                  return (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200',
                        'focus:outline-none focus:ring-2 focus:ring-(--primary)/30',
                        isChildActive && 'shadow-sm',
                      )}
                      style={{
                        backgroundColor: isChildActive
                          ? 'var(--sidebar-item-active)'
                          : 'transparent',
                        color: isChildActive
                          ? 'var(--sidebar-item-active-text)'
                          : 'var(--text-muted)',
                        opacity: activeSubNav ? 1 : 0,
                        transform: activeSubNav ? 'translateX(0)' : 'translateX(30px)',
                        transition: `all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${activeSubNav ? 0.15 + index * 0.05 : 0}s`,
                      }}
                    >
                      {isChildActive && (
                        <div
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                          style={{
                            background:
                              'linear-gradient(180deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)',
                          }}
                        />
                      )}
                      <div className="relative">
                        <ChildIcon
                          className={cn(
                            'w-5 h-5 transition-transform',
                            isChildActive && 'scale-110',
                          )}
                          style={{
                            color: isChildActive
                              ? 'var(--sidebar-item-active-text)'
                              : 'var(--text-disabled)',
                          }}
                        />
                        {showChildBadge && (
                          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-linear-to-r from-red-500 to-red-600 text-white text-[9px] font-bold flex items-center justify-center shadow-lg animate-pulse">
                            {mobileSignatureCount > 9 ? '9+' : mobileSignatureCount}
                          </span>
                        )}
                      </div>
                      <span className="flex-1 text-sm font-medium">{t(child.labelKey)}</span>
                    </Link>
                  );
                })}
            </div>
          </div>
        </nav>

        {/* Organization Branding */}
        <div className="px-2 py-3 border-t" style={{ borderColor: 'var(--sidebar-border)' }}>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              backgroundColor: 'var(--background-subtle)',
              opacity: mobileOpen ? 1 : 0,
              transition: 'opacity 0.4s ease 0.3s',
            }}
          >
            <Building2 className="w-4 h-4 shrink-0" style={{ color: 'var(--primary)' }} />
            <div className="min-w-0 flex-1">
              <p
                className="text-[11px] font-semibold truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {userOrg?.name ?? t('sidebar.orgName')}
              </p>
              <p className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>
                {user?.name ?? t('common.user')}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
