'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Building2, ChevronLeft, ChevronRight, FolderKanban, Lock, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/store/useSidebarStore';
import { useSwipe } from '@/hooks/useSwipe';
import { useAuthUser } from '@/store/useAuthStore';
import { MODULE_TOGGLE_BY_HREF, useFeatureFlags } from '@/hooks/useFeatureFlags';
import { isHrefLocked, usePlanGatedNav } from '@/lib/planGating';
import { OrganizationSelector } from '@/components/layout/OrganizationSelector';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { QuickActionsPalette } from '@/components/superadmin/QuickActionsPalette';
import { useNavBadges } from '@/components/layout/NavBadgesProvider';

// The destination list itself lives in @/lib/nav so the command palette can read
// the same one instead of keeping a second, drifting copy.
import { isSeparator, navItems, type NavEntry, type NavItem } from '@/lib/nav';

// ── Plan-gating chrome (lock overlay + Upgrade pill) ───────────────────────────
// Plan-locked destinations stay in the nav so users can see what a higher
// tariff unlocks: the row shows a small lock on the icon and an Upgrade pill,
// and clicking it goes to /pricing instead of the module.

function PlanLockOverlay() {
  return (
    <span
      className="absolute -top-1 -right-1 rounded-full bg-linear-to-r from-(--brand) to-(--cyan) text-white shadow-lg p-0.5"
      aria-hidden="true"
    >
      <Lock className="w-2.5 h-2.5" />
    </span>
  );
}

function UpgradePill() {
  const { t } = useTranslation();
  return (
    <span className="ml-1 shrink-0 rounded bg-linear-to-r from-(--brand) to-(--cyan) px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white shadow-sm whitespace-nowrap">
      {t('plan.upgrade', 'Upgrade')}
    </span>
  );
}

// ─── Desktop Sidebar ───────────────────────────────────────────────────────────
export function Sidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebarStore();
  const user = useAuthUser();
  const { isEnabled } = useFeatureFlags();
  const { entitlements } = usePlanGatedNav();
  const [mounted, setMounted] = React.useState(false);
  const [hoveredItem, setHoveredItem] = React.useState<string | null>(null);
  const [activeSubNav, setActiveSubNav] = React.useState<NavItem | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');

  // Org branding — null means no branding configured (use defaults).
  const branding = useQuery(api.branding.getBranding, user?.organizationId ? {} : 'skip');

  // Projects for dynamic sidebar items under Tasks sub-nav
  const projects = useQuery(
    api.projects.listProjects,
    user?.organizationId ? { organizationId: user.organizationId as never } : 'skip',
  );

  React.useEffect(() => setMounted(true), []);

  // Close sub-nav when sidebar collapses
  React.useEffect(() => {
    if (collapsed) setActiveSubNav(null);
  }, [collapsed]);

  // Auto-open Tasks sub-nav when navigating to /tasks
  React.useEffect(() => {
    if (pathname.startsWith('/tasks')) {
      const tasksItem = navItems.find(
        (e) => !isSeparator(e) && (e as NavItem).href === '/tasks',
      ) as NavItem | undefined;
      if (tasksItem?.children) setActiveSubNav(tasksItem);
    }
  }, [pathname]);

  // Every badge below comes from the shared NavBadgesProvider — one set of
  // Convex subscriptions for the whole shell instead of a duplicated set per
  // component (this sidebar alone used to hold seven of its own).
  const {
    userOrg,
    taskUnread: taskUnreadCount,
    calendarUnread: calendarUnreadCount,
    leavesUnread,
    chatUnread: chatUnreadCount,
    pendingSignatures: signatureBadgeCount,
    pendingApprovals: approvalBadgeCount,
    newsUnread,
  } = useNavBadges();

  // Update browser tab title with unread chat count
  React.useEffect(() => {
    document.title = chatUnreadCount > 0 ? `(${chatUnreadCount}) Shield HR` : 'Shield HR';
  }, [chatUnreadCount]);

  // Get user role with fallback
  const userRole = user?.role ?? 'employee';
  const isSuperadmin = user?.role === 'superadmin';

  // Toggled-off modules disappear from the nav in real time (see
  // useFeatureFlags); plan-locked modules stay visible with a lock + Upgrade
  // badge (isHrefLocked). Items are cloned — never mutated — so flipping a
  // toggle back on restores the original children.
  const withModuleChildren = (item: NavItem): NavItem => {
    if (MODULE_TOGGLE_BY_HREF[item.href]) return item;
    if (!item.children?.some((c) => !('type' in c) && MODULE_TOGGLE_BY_HREF[c.href])) return item;
    return {
      ...item,
      children: item.children.filter(
        (c) =>
          ('type' in c && c.type === 'separator') ||
          (!('type' in c) &&
            (!MODULE_TOGGLE_BY_HREF[c.href] || isEnabled(MODULE_TOGGLE_BY_HREF[c.href]))),
      ),
    };
  };
  const moduleVisible = (item: NavItem) =>
    !MODULE_TOGGLE_BY_HREF[item.href] || isEnabled(MODULE_TOGGLE_BY_HREF[item.href]);

  const visibleItems = navItems
    .map((entry) => (isSeparator(entry) ? entry : withModuleChildren(entry)))
    .filter((item, index, arr) => {
      if (isSeparator(item)) {
        if (userRole === 'driver' || userRole === 'employee') return false;
        let hasVisibleItem = false;
        for (let i = index + 1; i < arr.length; i++) {
          const next = arr[i];
          if (!next) break;
          if (isSeparator(next)) break;
          if (next.roles.includes(userRole) && moduleVisible(next)) {
            hasVisibleItem = true;
            break;
          }
        }
        return hasVisibleItem;
      }
      return item.roles.includes(userRole) && moduleVisible(item);
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
          const childMatch = next.children?.some(
            (c) => !('type' in c) && t(c.labelKey).toLowerCase().includes(query),
          );
          if (label.includes(query) || childMatch) {
            result.push(entry);
          }
        }
      } else {
        const label = t(entry.labelKey).toLowerCase();
        const childMatch = entry.children?.some(
          (c) => !('type' in c) && t(c.labelKey).toLowerCase().includes(query),
        );
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
              {branding?.logoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- org branding logo */
                <img src={branding.logoUrl} alt="" className="w-8 h-8 rounded-lg object-contain" />
              ) : (
                <div className="btn-gradient w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-all duration-300">
                  <span className="text-white font-bold text-sm">HR</span>
                </div>
              )}
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
                <h1 className="text-sm font-bold text-text-primary">
                  {branding?.brandName || t('sidebar.appName')}
                </h1>
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
              const calendarBadgeCount = calendarUnreadCount;
              const leaveBadgeCount = leavesUnread;
              const chatBadgeCount = chatUnreadCount;
              const newsBadgeCount = newsUnread;
              const showTaskBadge = item.href === '/tasks' && taskBadgeCount > 0;
              const showCalendarBadge = item.href === '/calendar' && calendarBadgeCount > 0;
              const showLeaveBadge =
                item.href === '/leaves' && leaveBadgeCount > 0 && user?.role === 'admin';
              const showChatBadge = item.href === '/chat' && chatBadgeCount > 0;
              const showSignatureBadge = item.href === '/performance' && signatureBadgeCount > 0;
              const showNewsBadge = item.href === '/news' && newsBadgeCount > 0;
              const showApprovalBadge = item.href === '/approvals' && approvalBadgeCount > 0;
              const showBadge =
                showTaskBadge ||
                showCalendarBadge ||
                showLeaveBadge ||
                showChatBadge ||
                showSignatureBadge ||
                showNewsBadge ||
                showApprovalBadge;
              const badgeCount =
                item.href === '/leaves'
                  ? leaveBadgeCount
                  : item.href === '/tasks'
                    ? taskBadgeCount
                    : item.href === '/calendar'
                      ? calendarBadgeCount
                      : item.href === '/chat'
                        ? chatBadgeCount
                        : item.href === '/performance'
                          ? signatureBadgeCount
                          : item.href === '/news'
                            ? newsBadgeCount
                            : item.href === '/approvals'
                              ? approvalBadgeCount
                              : 0;
              // Surfaces where a new item needs to actively catch the eye blink;
              // the rest settle for a steady pulse.
              const badgeBlinks =
                item.href === '/chat' ||
                item.href === '/news' ||
                item.href === '/approvals' ||
                item.href === '/calendar';
              const hasChildren = item.children && item.children.length > 0;
              const locked = isHrefLocked(entitlements, item.href);

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
                        href={locked ? '/pricing' : item.href}
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
                          {locked && <PlanLockOverlay />}
                          {showBadge && (
                            <span
                              className={cn(
                                'absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center shadow-lg',
                                badgeBlinks
                                  ? 'bg-linear-to-r from-(--danger-solid) to-(--danger-solid) animate-chat-badge'
                                  : 'bg-linear-to-r from-(--danger-solid) to-(--danger-solid) animate-pulse',
                              )}
                            >
                              {badgeCount > 9 ? '9+' : badgeCount}
                            </span>
                          )}
                          {item.badge === 'AI' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-(--purple) to-(--pink) text-white text-[8px] font-bold shadow-lg">
                              AI
                            </span>
                          )}
                          {item.badge === 'SEC' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-(--brand) to-(--cyan) text-white text-[8px] font-bold shadow-lg">
                              🛡
                            </span>
                          )}
                        </div>
                      </Link>
                    ) : (
                      <button
                        onClick={() => (locked ? router.push('/pricing') : setActiveSubNav(item))}
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
                          {locked && <PlanLockOverlay />}
                          {showBadge && (
                            <span
                              className={cn(
                                'absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center shadow-lg',
                                badgeBlinks
                                  ? 'bg-linear-to-r from-(--danger-solid) to-(--danger-solid) animate-chat-badge'
                                  : 'bg-linear-to-r from-(--danger-solid) to-(--danger-solid) animate-pulse',
                              )}
                            >
                              {badgeCount > 9 ? '9+' : badgeCount}
                            </span>
                          )}
                          {item.badge === 'AI' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-(--purple) to-(--pink) text-white text-[8px] font-bold shadow-lg">
                              AI
                            </span>
                          )}
                          {item.badge === 'SEC' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-(--brand) to-(--cyan) text-white text-[8px] font-bold shadow-lg">
                              🛡
                            </span>
                          )}
                        </div>
                        <span className="flex-1 min-w-0 flex items-center gap-1">
                          <span className="text-sm font-medium truncate">{t(item.labelKey)}</span>
                          {locked && <UpgradePill />}
                        </span>
                        {!locked && (
                          <ChevronRight className="w-4 h-4 text-text-muted transition-transform duration-300 group-hover:translate-x-0.5" />
                        )}
                      </button>
                    )
                  ) : (
                    <Link
                      href={locked ? '/pricing' : item.href}
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
                              badgeBlinks
                                ? 'bg-linear-to-r from-(--danger-solid) to-(--danger-solid) animate-chat-badge'
                                : 'bg-linear-to-r from-(--danger-solid) to-(--danger-solid) animate-pulse',
                            )}
                          >
                            {badgeCount > 9 ? '9+' : badgeCount}
                          </span>
                        )}
                        {item.badge === 'AI' && (
                          <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-(--purple) to-(--pink) text-white text-[8px] font-bold shadow-lg">
                            AI
                          </span>
                        )}
                        {item.badge === 'SEC' && (
                          <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-(--brand) to-(--cyan) text-white text-[8px] font-bold shadow-lg">
                            🛡
                          </span>
                        )}
                      </div>
                      <span className="flex-1 min-w-0 flex items-center gap-1">
                        <span className="text-sm font-medium truncate">{t(item.labelKey)}</span>
                        {locked && <UpgradePill />}
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
              {(() => {
                const children =
                  activeSubNav?.children?.filter((child) => {
                    if ('type' in child && child.type === 'separator') return true;
                    return (
                      !(child as NavItem).roles || (child as NavItem).roles!.includes(userRole)
                    );
                  }) ?? [];

                // Find the second separator index to insert projects after it
                let separatorCount = 0;
                let secondSeparatorIndex = -1;
                children.forEach((child, idx) => {
                  if ('type' in child && child.type === 'separator') {
                    separatorCount++;
                    if (separatorCount === 2) secondSeparatorIndex = idx;
                  }
                });

                // Split: static items + dynamic projects after second separator
                const staticItems =
                  secondSeparatorIndex >= 0
                    ? children.slice(0, secondSeparatorIndex + 1)
                    : children;
                const afterSeparator =
                  secondSeparatorIndex >= 0 ? children.slice(secondSeparatorIndex + 1) : [];

                return (
                  <>
                    {/* Static items from nav config */}
                    {staticItems.map((child, index) => {
                      // Separator
                      if ('type' in child && child.type === 'separator') {
                        return (
                          <div
                            key={`sep-${index}`}
                            className="pt-2 pb-1 px-3"
                            style={{
                              opacity: activeSubNav ? 1 : 0,
                              transform: activeSubNav ? 'translateX(0)' : 'translateX(20px)',
                              transition: `all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${activeSubNav ? 0.1 + index * 0.05 : 0}s`,
                            }}
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
                              {child.labelKey}
                            </p>
                          </div>
                        );
                      }

                      const navChild = child as {
                        href: string;
                        labelKey: string;
                        icon?: LucideIcon;
                        roles?: string[];
                      };
                      const ChildIcon = (navChild.icon || activeSubNav?.icon) as LucideIcon;
                      const isChildActive =
                        pathname === navChild.href || pathname.startsWith(navChild.href + '/');
                      const childLocked = isHrefLocked(entitlements, navChild.href);

                      return (
                        <Link
                          key={navChild.href}
                          href={childLocked ? '/pricing' : navChild.href}
                          onMouseEnter={() => setHoveredItem(navChild.href)}
                          onMouseLeave={() => setHoveredItem(null)}
                          className={cn(
                            'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
                            'focus:outline-none focus:ring-2 focus:ring-primary/30',
                            isChildActive
                              ? 'bg-sidebar-item-active shadow-sm text-sidebar-item-active-text'
                              : cn(
                                  'text-sidebar-text',
                                  hoveredItem === navChild.href
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
                            {childLocked && <PlanLockOverlay />}
                          </div>
                          <span className="flex-1 min-w-0 flex items-center gap-1">
                            <span className="text-sm font-medium truncate">
                              {t(navChild.labelKey)}
                            </span>
                            {childLocked && <UpgradePill />}
                          </span>
                        </Link>
                      );
                    })}

                    {/* Dynamic projects from database */}
                    {afterSeparator.map((child, index) => {
                      if ('type' in child && child.type === 'separator') {
                        return (
                          <div
                            key={`sep-after-${index}`}
                            className="pt-4 pb-1 px-3"
                            style={{
                              opacity: activeSubNav ? 1 : 0,
                              transform: activeSubNav ? 'translateX(0)' : 'translateX(20px)',
                              transition: `all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${activeSubNav ? 0.1 + (staticItems.length + index) * 0.05 : 0}s`,
                            }}
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
                              {child.labelKey}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    })}

                    {/* Render actual projects from database */}
                    {secondSeparatorIndex >= 0 &&
                      projects?.slice(0, 5).map((project, index) => {
                        const projectHref = `/projects/${project._id}`;
                        const isProjectActive =
                          pathname === projectHref || pathname.startsWith(projectHref + '/');
                        const baseIndex = staticItems.length + index;

                        return (
                          <Link
                            key={project._id}
                            href={projectHref}
                            onMouseEnter={() => setHoveredItem(projectHref)}
                            onMouseLeave={() => setHoveredItem(null)}
                            className={cn(
                              'group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200',
                              'focus:outline-none focus:ring-2 focus:ring-primary/30',
                              isProjectActive
                                ? 'bg-sidebar-item-active shadow-sm text-sidebar-item-active-text'
                                : cn(
                                    'text-sidebar-text',
                                    hoveredItem === projectHref
                                      ? 'bg-sidebar-item-hover'
                                      : 'bg-transparent',
                                  ),
                            )}
                            style={{
                              opacity: activeSubNav ? 1 : 0,
                              transform: activeSubNav ? 'translateX(0)' : 'translateX(30px)',
                              transition: `all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${activeSubNav ? 0.15 + baseIndex * 0.05 : 0}s`,
                            }}
                          >
                            {isProjectActive && (
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
                              <FolderKanban
                                className={cn(
                                  'w-5 h-5 transition-all duration-200',
                                  isProjectActive && 'scale-110',
                                )}
                                style={{
                                  color: isProjectActive
                                    ? 'var(--sidebar-item-active-text)'
                                    : 'var(--text-disabled)',
                                }}
                              />
                            </div>
                            <span className="flex-1 min-w-0 flex items-center gap-1">
                              <span className="text-sm font-medium truncate">{project.name}</span>
                            </span>
                          </Link>
                        );
                      })}
                  </>
                );
              })()}
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
  const router = useRouter();
  const { mobileOpen, setMobileOpen } = useSidebarStore();
  const user = useAuthUser();
  const { isEnabled } = useFeatureFlags();
  const { entitlements } = usePlanGatedNav();
  const [mounted, setMounted] = React.useState(false);
  const sidebarRef = React.useRef<HTMLDivElement>(null);
  const [activeSubNav, setActiveSubNav] = React.useState<NavItem | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const branding = useQuery(api.branding.getBranding, user?.organizationId ? {} : 'skip');

  // Projects for dynamic sidebar items under Tasks sub-nav
  const projects = useQuery(
    api.projects.listProjects,
    user?.organizationId ? { organizationId: user.organizationId as never } : 'skip',
  );

  React.useEffect(() => setMounted(true), []);

  // Shared badge subscriptions (NavBadgesProvider) — this mobile sidebar used
  // to duplicate five of the desktop sidebar's Convex subscriptions.
  const {
    userOrg,
    taskUnread: mobileTaskBadge,
    calendarUnread: mobileCalendarBadge,
    leavesUnread: mobileUnreadLeavesCount,
    chatUnread: mobileChatUnreadCount,
    pendingSignatures: mobileSignatureCount,
  } = useNavBadges();

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

  // Same module-toggle filtering as the desktop sidebar (see useFeatureFlags).
  const withModuleChildren = (item: NavItem): NavItem => {
    if (MODULE_TOGGLE_BY_HREF[item.href]) return item;
    if (!item.children?.some((c) => !('type' in c) && MODULE_TOGGLE_BY_HREF[c.href])) return item;
    return {
      ...item,
      children: item.children.filter(
        (c) =>
          ('type' in c && c.type === 'separator') ||
          (!('type' in c) &&
            (!MODULE_TOGGLE_BY_HREF[c.href] || isEnabled(MODULE_TOGGLE_BY_HREF[c.href]))),
      ),
    };
  };
  const moduleVisible = (item: NavItem) =>
    !MODULE_TOGGLE_BY_HREF[item.href] || isEnabled(MODULE_TOGGLE_BY_HREF[item.href]);

  const visibleItems = navItems
    .map((entry) => (isSeparator(entry) ? entry : withModuleChildren(entry)))
    .filter((item, index, arr) => {
      if (isSeparator(item)) {
        // Hide section headers for driver/employee roles
        if (userRole === 'driver' || userRole === 'employee') return false;
        // For other roles, only show separator if there's at least one visible nav item in this section
        let hasVisibleItem = false;
        for (let i = index + 1; i < arr.length; i++) {
          const next = arr[i];
          if (!next) break;
          if (isSeparator(next)) break;
          if (next.roles.includes(userRole) && moduleVisible(next)) {
            hasVisibleItem = true;
            break;
          }
        }
        return hasVisibleItem;
      }
      return item.roles.includes(userRole) && moduleVisible(item);
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
          const childMatch = next.children?.some(
            (c) => !('type' in c) && t(c.labelKey).toLowerCase().includes(query),
          );
          if (label.includes(query) || childMatch) {
            result.push(entry);
          }
        }
      } else {
        const label = t(entry.labelKey).toLowerCase();
        const childMatch = entry.children?.some(
          (c) => !('type' in c) && t(c.labelKey).toLowerCase().includes(query),
        );
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
            {branding?.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- org branding logo */
              <img src={branding.logoUrl} alt="" className="w-8 h-8 rounded-lg object-contain" />
            ) : (
              <div className="btn-gradient w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-all duration-300">
                <span className="text-white font-bold text-sm">HR</span>
              </div>
            )}
            <div>
              <h1 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {branding?.brandName || t('sidebar.appName')}
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
                const mobileLeaveCount = mobileUnreadLeavesCount;
                const mobileChatCount = mobileChatUnreadCount;
                const mobileBadge =
                  item.href === '/tasks'
                    ? mobileTaskCount
                    : item.href === '/calendar'
                      ? mobileCalendarBadge
                      : item.href === '/leaves' && user?.role === 'admin'
                        ? mobileLeaveCount
                        : item.href === '/chat'
                          ? mobileChatCount
                          : item.href === '/performance'
                            ? mobileSignatureCount
                            : 0;
                const hasChildren = item.children && item.children.length > 0;
                const locked = isHrefLocked(entitlements, item.href);

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
                        onClick={() => (locked ? router.push('/pricing') : setActiveSubNav(item))}
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
                          {locked && <PlanLockOverlay />}
                          {mobileBadge > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-linear-to-r from-(--danger-solid) to-(--danger-solid) text-white text-[9px] font-bold flex items-center justify-center shadow-lg animate-pulse">
                              {mobileBadge > 9 ? '9+' : mobileBadge}
                            </span>
                          )}
                          {item.badge === 'AI' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-(--purple) to-(--pink) text-white text-[8px] font-bold shadow-lg">
                              AI
                            </span>
                          )}
                          {item.badge === 'SEC' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-(--brand) to-(--cyan) text-white text-[8px] font-bold shadow-lg">
                              🛡
                            </span>
                          )}
                        </div>
                        <span className="flex-1 min-w-0 flex items-center gap-1 text-left">
                          <span className="text-sm font-medium truncate">{t(item.labelKey)}</span>
                          {locked && <UpgradePill />}
                        </span>
                        {!locked && (
                          <ChevronRight className="w-4 h-4 text-text-muted transition-transform duration-300 group-hover:translate-x-0.5" />
                        )}
                      </button>
                    ) : (
                      <Link
                        key={item.href}
                        href={locked ? '/pricing' : item.href}
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
                          {locked && <PlanLockOverlay />}
                          {mobileBadge > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-linear-to-r from-(--danger-solid) to-(--danger-solid) text-white text-[9px] font-bold flex items-center justify-center shadow-lg animate-pulse">
                              {mobileBadge > 9 ? '9+' : mobileBadge}
                            </span>
                          )}
                          {item.badge === 'AI' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-(--purple) to-(--pink) text-white text-[8px] font-bold shadow-lg">
                              AI
                            </span>
                          )}
                          {item.badge === 'SEC' && (
                            <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-(--brand) to-(--cyan) text-white text-[8px] font-bold shadow-lg">
                              🛡
                            </span>
                          )}
                        </div>
                        <span className="flex-1 min-w-0 flex items-center gap-1">
                          <span className="text-sm font-medium truncate">{t(item.labelKey)}</span>
                          {locked && <UpgradePill />}
                        </span>
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

              {(() => {
                const children =
                  activeSubNav?.children?.filter((child) => {
                    if ('type' in child && child.type === 'separator') return true;
                    return (
                      !(child as NavItem).roles || (child as NavItem).roles!.includes(userRole)
                    );
                  }) ?? [];

                // Find the second separator index to insert projects after it
                let separatorCount = 0;
                let secondSeparatorIndex = -1;
                children.forEach((child, idx) => {
                  if ('type' in child && child.type === 'separator') {
                    separatorCount++;
                    if (separatorCount === 2) secondSeparatorIndex = idx;
                  }
                });

                // Split: static items + dynamic projects after second separator
                const staticItems =
                  secondSeparatorIndex >= 0
                    ? children.slice(0, secondSeparatorIndex + 1)
                    : children;

                return (
                  <>
                    {/* Static items from nav config */}
                    {staticItems.map((child, index) => {
                      if ('type' in child && child.type === 'separator') {
                        return (
                          <div
                            key={`sep-${index}`}
                            className="pt-4 pb-1 px-3"
                            style={{
                              opacity: activeSubNav ? 1 : 0,
                              transform: activeSubNav ? 'translateX(0)' : 'translateX(20px)',
                              transition: `all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${activeSubNav ? 0.1 + index * 0.05 : 0}s`,
                            }}
                          >
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)">
                              {child.labelKey}
                            </p>
                          </div>
                        );
                      }

                      const navChild = child as {
                        href: string;
                        labelKey: string;
                        icon?: LucideIcon;
                        roles?: string[];
                      };
                      const ChildIcon = (navChild.icon || activeSubNav?.icon) as LucideIcon;
                      const isChildActive =
                        pathname === navChild.href || pathname.startsWith(navChild.href + '/');
                      const childLocked = isHrefLocked(entitlements, navChild.href);

                      return (
                        <Link
                          key={navChild.href}
                          href={childLocked ? '/pricing' : navChild.href}
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
                            {childLocked && <PlanLockOverlay />}
                          </div>
                          <span className="flex-1 min-w-0 flex items-center gap-1">
                            <span className="text-sm font-medium truncate">
                              {t(navChild.labelKey)}
                            </span>
                            {childLocked && <UpgradePill />}
                          </span>
                        </Link>
                      );
                    })}

                    {/* Dynamic projects from database */}
                    {secondSeparatorIndex >= 0 &&
                      projects?.slice(0, 5).map((project, index) => {
                        const projectHref = `/projects/${project._id}`;
                        const isProjectActive =
                          pathname === projectHref || pathname.startsWith(projectHref + '/');
                        const baseIndex = staticItems.length + index;

                        return (
                          <Link
                            key={project._id}
                            href={projectHref}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                              'flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200',
                              'focus:outline-none focus:ring-2 focus:ring-(--primary)/30',
                              isProjectActive && 'shadow-sm',
                            )}
                            style={{
                              backgroundColor: isProjectActive
                                ? 'var(--sidebar-item-active)'
                                : 'transparent',
                              color: isProjectActive
                                ? 'var(--sidebar-item-active-text)'
                                : 'var(--text-muted)',
                              opacity: activeSubNav ? 1 : 0,
                              transform: activeSubNav ? 'translateX(0)' : 'translateX(30px)',
                              transition: `all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${activeSubNav ? 0.15 + baseIndex * 0.05 : 0}s`,
                            }}
                          >
                            {isProjectActive && (
                              <div
                                className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                                style={{
                                  background:
                                    'linear-gradient(180deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)',
                                }}
                              />
                            )}
                            <div className="relative">
                              <FolderKanban
                                className={cn(
                                  'w-5 h-5 transition-transform',
                                  isProjectActive && 'scale-110',
                                )}
                                style={{
                                  color: isProjectActive
                                    ? 'var(--sidebar-item-active-text)'
                                    : 'var(--text-disabled)',
                                }}
                              />
                            </div>
                            <span className="flex-1 min-w-0 flex items-center gap-1">
                              <span className="text-sm font-medium truncate">{project.name}</span>
                            </span>
                          </Link>
                        );
                      })}
                  </>
                );
              })()}
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
