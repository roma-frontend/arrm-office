"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/store/useSidebarStore";
import { useAuthStore } from "@/store/useAuthStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OrganizationSelector } from "@/components/layout/OrganizationSelector";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const navItems = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, roles: ["superadmin", "admin", "supervisor", "employee"] },
  { href: "/attendance", labelKey: "nav.attendance", icon: Clock, roles: ["superadmin", "admin", "supervisor", "employee"] },
  { href: "/analytics", labelKey: "nav.analytics", icon: BarChart3, roles: ["superadmin", "admin", "supervisor"] },
  { href: "/leaves", labelKey: "nav.leaves", icon: ClipboardList, roles: ["superadmin", "admin", "supervisor", "employee"] },
  { href: "/employees", labelKey: "nav.employees", icon: Users, roles: ["superadmin", "admin", "supervisor", "employee"] },
  { href: "/calendar", labelKey: "nav.calendar", icon: CalendarDays, roles: ["superadmin", "admin", "supervisor", "employee"] },
  { href: "/reports", labelKey: "nav.reports", icon: FileText, roles: ["superadmin", "admin", "supervisor"] },
  { href: "/tasks", labelKey: "nav.tasks", icon: CheckSquare, roles: ["superadmin", "admin", "supervisor", "employee"] },
  { href: "/chat", labelKey: "nav.chat", icon: MessageCircle, roles: ["superadmin", "admin", "supervisor", "employee"], badge: "CHAT" },
  { href: "/approvals", labelKey: "nav.approvals", icon: UserCheck, roles: ["superadmin", "admin"] },
  { href: "/superadmin/subscriptions", labelKey: "nav.subscriptions", icon: CreditCard, roles: ["superadmin"] },
  { href: "/superadmin/security", labelKey: "nav.security", icon: ShieldCheck, roles: ["superadmin"], badge: "SEC" },
  { href: "/ai-site-editor", labelKey: "nav.aiSiteEditor", icon: Sparkles, roles: ["superadmin", "admin", "supervisor", "employee"], badge: "AI" },
  { href: "/profile", labelKey: "nav.profile", icon: User, roles: ["superadmin", "admin", "supervisor", "employee"] },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, roles: ["superadmin", "admin", "supervisor", "employee"] },
];

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

// ─── Desktop Sidebar ───────────────────────────────────────────────────────────
export function Sidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebarStore();
  const { user } = useAuthStore();
  const [mounted, setMounted] = React.useState(false);
  const [hoveredItem, setHoveredItem] = React.useState<string | null>(null);

  React.useEffect(() => setMounted(true), []);

  // Unread task notifications badge
  const notifications = useQuery(
    api.notifications.getUserNotifications,
    mounted && user?.id ? { userId: user.id as Id<"users"> } : "skip"
  );
  
  // Unread leaves count
  const unreadLeavesCount = useQuery(
    api.leaves.getUnreadCount,
    mounted && user?.id && (user.role === "admin" || user.role === "supervisor" || user.role === "superadmin")
      ? { requesterId: user.id as Id<"users"> }
      : "skip"
  );

  // Unread chat messages count
  const chatUnreadCount = useQuery(
    api.chat.getTotalUnread,
    mounted && user?.id && user?.organizationId
      ? { userId: user.id as Id<"users">, organizationId: user.organizationId as Id<"organizations"> }
      : "skip"
  );
  
  const taskUnreadCount = (notifications ?? []).filter(
    (n: any) => !n.isRead && n.type === "system" && (n.title?.includes("Task") || n.title?.includes("task"))
  ).length;

  // Update browser tab title with unread chat count
  React.useEffect(() => {
    const count = chatUnreadCount ?? 0;
    document.title = count > 0 ? `(${count}) Shield HR` : "Shield HR";
  }, [chatUnreadCount]);

  if (!mounted) return null;

  const visibleItems = navItems.filter((item) => 
    item.roles.includes(user?.role ?? "employee")
  );

  return (
    <aside
      className={cn(
        "relative hidden lg:flex flex-col h-screen border-r z-60 shrink-0",
        collapsed ? "w-[72px]" : "w-60"
      )}
      style={{
        background: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
        transition: "width 600ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        willChange: "width",
      }}
    >
      {/* Header with Logo */}
      <div
        className="flex items-center justify-center h-16 px-4 border-b"
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        {!collapsed ? (
          <div 
            className="flex items-center justify-between w-full gap-3"
            style={{
              transition: "all 600ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            {/* Logo with text */}
            <Link
              href="/"
              className="flex items-center gap-2 hover:opacity-80 cursor-pointer transition-opacity duration-300"
            >
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-all duration-300"
                style={{
                  background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)",
                }}
              >
                <span className="text-white font-bold text-sm">HR</span>
              </div>
              <div>
                <h1 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  HRLeave
                </h1>
                <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {t('sidebar.subtitle')}
                </p>
              </div>
            </Link>
            
            {/* Toggle Button */}
            <button
              onClick={toggle}
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                "border transition-all duration-300 hover:scale-105",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 group",
                "shadow-sm hover:shadow-md"
              )}
              style={{
                borderColor: "var(--border)",
                color: "var(--text-muted)",
                backgroundColor: "var(--background)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--sidebar-item-hover)";
                e.currentTarget.style.borderColor = "var(--primary)";
                e.currentTarget.style.color = "var(--primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "var(--background)";
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
              onFocus={(e) => {
                e.currentTarget.style.outlineColor = "var(--primary)";
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
              "w-9 h-9 rounded-lg flex items-center justify-center",
              "border transition-all duration-300 hover:scale-105",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 group",
              "shadow-sm hover:shadow-md"
            )}
            style={{
              borderColor: "var(--border)",
              color: "var(--text-muted)",
              backgroundColor: "var(--background)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--sidebar-item-hover)";
              e.currentTarget.style.borderColor = "var(--primary)";
              e.currentTarget.style.color = "var(--primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--background)";
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
            onFocus={(e) => {
              e.currentTarget.style.outlineColor = "var(--primary)";
            }}
            aria-label={t('sidebar.expandSidebar')}
            title={t('sidebar.expandSidebar')}
          >
            <ChevronRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </button>
        )}
      </div>

      {/* Organization Selector - Top Position */}
      <div className="px-2 py-3 border-b" style={{ borderColor: "var(--sidebar-border)" }}>
        <OrganizationSelector collapsed={collapsed} />
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 custom-scrollbar">
        <div className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const taskBadgeCount = taskUnreadCount;
            const leaveBadgeCount = unreadLeavesCount ?? 0;
            const chatBadgeCount = chatUnreadCount ?? 0;
            const showTaskBadge = item.href === "/tasks" && taskBadgeCount > 0;
            const showLeaveBadge = item.href === "/leaves" && leaveBadgeCount > 0 && user?.role !== "superadmin";
            const showChatBadge = item.href === "/chat" && chatBadgeCount > 0;
            const showBadge = showTaskBadge || showLeaveBadge || showChatBadge;
            const badgeCount = item.href === "/leaves" ? leaveBadgeCount : item.href === "/tasks" ? taskBadgeCount : item.href === "/chat" ? chatBadgeCount : 0;

            return (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={() => setHoveredItem(item.href)}
                onMouseLeave={() => setHoveredItem(null)}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                  "focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30",
                  isActive && "shadow-sm"
                )}
                style={{
                  backgroundColor: isActive 
                    ? "var(--sidebar-item-active)" 
                    : hoveredItem === item.href 
                    ? "var(--sidebar-item-hover)" 
                    : "transparent",
                  color: isActive ? "var(--sidebar-item-active-text)" : "var(--text-muted)",
                }}
              >
                {/* Active Indicator */}
                {isActive && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                    style={{
                      background: "linear-gradient(180deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)",
                      animation: "slideIn 0.3s ease-out",
                    }}
                  />
                )}

                {/* Icon */}
                <div className="relative">
                  <Icon 
                    className={cn(
                      "w-5 h-5 transition-all duration-200",
                      isActive && "scale-110"
                    )} 
                    style={{ 
                      color: isActive ? "var(--sidebar-item-active-text)" : "var(--text-disabled)" 
                    }} 
                  />
                  
                  {/* Badge */}
                  {showBadge && (
                    <span className={cn(
                      "absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center shadow-lg",
                      item.href === "/chat"
                        ? "bg-gradient-to-r from-red-500 to-red-600 animate-chat-badge"
                        : "bg-gradient-to-r from-red-500 to-red-600 animate-pulse"
                    )}>
                      {badgeCount > 9 ? "9+" : badgeCount}
                    </span>
                  )}

                  {/* AI Badge */}
                  {item.badge === "AI" && (
                    <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[8px] font-bold shadow-lg">
                      AI
                    </span>
                  )}
                  {/* Security Badge */}
                  {item.badge === "SEC" && (
                    <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-gradient-to-r from-blue-600 to-cyan-500 text-white text-[8px] font-bold shadow-lg">
                      🛡
                    </span>
                  )}
                </div>

                {/* Label */}
                <span className="flex-1 text-sm font-medium truncate">
                  {t(item.labelKey)}
                </span>

                {/* Chat unread badge (next to label, shown when sidebar expanded) */}
                {item.href === "/chat" && chatBadgeCount > 0 && !collapsed && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-red-500 to-red-600 text-white text-[9px] font-bold flex items-center justify-center shadow-lg animate-chat-badge">
                    {chatBadgeCount > 99 ? "99+" : chatBadgeCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Organization Branding */}
      <div className="px-3 py-2 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-300",
            collapsed && "justify-center"
          )}
          style={{ backgroundColor: "var(--background-subtle)" }}
        >
          <Building2 className="w-4 h-4 flex-shrink-0" style={{ color: "var(--primary)" }} />
          <div
            className={cn(
              "min-w-0 flex-1",
              collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}
            style={{
              transition: "opacity 600ms cubic-bezier(0.34, 1.56, 0.64, 1) 100ms, width 600ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <p className="text-[10px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              {t('sidebar.orgName')}
            </p>
            <p className="text-[9px] truncate" style={{ color: "var(--text-muted)" }}>
              {t('sidebar.orgSubtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="border-t p-3" style={{ borderColor: "var(--sidebar-border)" }}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <Avatar 
            className="w-8 h-8 shrink-0 ring-2 transition-all duration-200"
            style={{
              borderColor: "var(--primary)",
              opacity: 0.3,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = "0.6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "0.3";
            }}
          >
            {user?.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
            <AvatarFallback 
              className="text-xs text-white font-bold"
              style={{
                background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)",
              }}
            >
              {user?.name ? getInitials(user.name) : "U"}
            </AvatarFallback>
          </Avatar>
          <div
            className={cn(
              "min-w-0 flex-1",
              collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}
            style={{
              transition: "opacity 600ms cubic-bezier(0.34, 1.56, 0.64, 1) 100ms, width 600ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {user?.name ?? "User"}
            </p>
          </div>
        </div>
      </div>

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: var(--border);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: var(--text-disabled);
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-50%) translateX(-10px); }
          to   { opacity: 1; transform: translateY(-50%) translateX(0); }
        }
        @keyframes chat-badge {
          0%, 100% { transform: scale(1); opacity: 1; }
          25%       { transform: scale(1.3); opacity: 1; }
          50%       { transform: scale(1); opacity: 0.6; }
          75%       { transform: scale(1.2); opacity: 1; }
        }
        .animate-chat-badge {
          animation: chat-badge 1.2s ease-in-out infinite;
        }
      `}</style>
    </aside>
  );
}

export default Sidebar;

// ─── Mobile Sidebar ────────────────────────────────────────────────────────────
export function MobileSidebar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { mobileOpen, setMobileOpen } = useSidebarStore();
  const { user } = useAuthStore();
  const [mounted, setMounted] = React.useState(false);
  const sidebarRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => setMounted(true), []);

  const mobileNotifications = useQuery(
    api.notifications.getUserNotifications,
    mounted && user?.id ? { userId: user.id as Id<"users"> } : "skip"
  );
  
  // Mobile Unread leaves count
  const mobileUnreadLeavesCount = useQuery(
    api.leaves.getUnreadCount,
    mounted && user?.id && (user.role === "admin" || user.role === "supervisor" || user.role === "superadmin")
      ? { requesterId: user.id as Id<"users"> }
      : "skip"
  );

  // Mobile unread chat count
  const mobileChatUnreadCount = useQuery(
    api.chat.getTotalUnread,
    mounted && user?.id && user?.organizationId
      ? { userId: user.id as Id<"users">, organizationId: user.organizationId as Id<"organizations"> }
      : "skip"
  );
  
  const mobileTaskBadge = (mobileNotifications ?? []).filter(
    (n: any) => !n.isRead && n.type === "system" && (n.title?.includes("Task") || n.title?.includes("task"))
  ).length;

  // Lock body scroll when mobile sidebar is open
  React.useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Close on escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && mobileOpen) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [mobileOpen, setMobileOpen]);

  if (!mounted) return null;

  const visibleItems = navItems.filter((item) => 
    item.roles.includes(user?.role ?? "employee")
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-60 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-500",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        aria-hidden="true"
      />

      {/* Sidebar Panel */}
      <aside
        ref={sidebarRef}
        className={cn(
          "fixed top-0 left-0 bottom-0 z-70 w-[280px] lg:hidden flex flex-col",
          "transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-2xl",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{
          background: "var(--sidebar-bg)",
          borderRight: "1px solid var(--sidebar-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between h-16 px-4 border-b"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 cursor-pointer">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-all duration-300"
              style={{
                background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)",
              }}
            >
              <span className="text-white font-bold text-sm">HR</span>
            </div>
            <div>
              <h1 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                HRLeave
              </h1>
              <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {t('sidebar.subtitle')}
              </p>
            </div>
          </Link>

          {/* Close Button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-(--primary)/30 border"
            style={{
              backgroundColor: "var(--sidebar-bg)",
              borderColor: "var(--sidebar-border)",
              color: "var(--text-muted)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--sidebar-item-hover)";
              e.currentTarget.style.borderColor = "var(--primary)";
              e.currentTarget.style.color = "var(--primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--sidebar-bg)";
              e.currentTarget.style.borderColor = "var(--sidebar-border)";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
            aria-label={t('sidebar.closeSidebar')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Organization Selector - Top Position Mobile */}
        <div
          className="px-2 py-3 border-b"
          style={{
            borderColor: "var(--sidebar-border)",
            opacity: mobileOpen ? 1 : 0,
            transition: "opacity 0.25s ease",
          }}
        >
          <OrganizationSelector collapsed={false} />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 custom-scrollbar">
          <div className="space-y-1">
            {visibleItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              const mobileTaskCount = mobileTaskBadge;
              const mobileLeaveCount = mobileUnreadLeavesCount ?? 0;
              const mobileChatCount = mobileChatUnreadCount ?? 0;
              const mobileBadge = item.href === "/tasks" ? mobileTaskCount : item.href === "/leaves" && user?.role !== "superadmin" ? mobileLeaveCount : item.href === "/chat" ? mobileChatCount : 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-(--primary)/30",
                    isActive && "shadow-sm"
                  )}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "var(--sidebar-item-hover)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }
                  }}
                  style={{
                    backgroundColor: isActive ? "var(--sidebar-item-active)" : "transparent",
                    color: isActive ? "var(--sidebar-item-active-text)" : "var(--text-muted)",
                    opacity: mobileOpen ? 1 : 0,
                    transform: mobileOpen ? "translateX(0)" : "translateX(-20px)",
                    transition: `all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) ${index * 0.05}s`,
                  }}
                >
                  {/* Active Indicator */}
                  {isActive && (
                    <div 
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                      style={{
                        background: "linear-gradient(180deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)",
                      }}
                    />
                  )}

                  {/* Icon */}
                  <div className="relative">
                    <Icon
                      className={cn("w-5 h-5 transition-transform", isActive && "scale-110")}
                      style={{ color: isActive ? "var(--sidebar-item-active-text)" : "var(--text-disabled)" }}
                    />
                    
                    {/* Badge */}
                    {mobileBadge > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-linear-to-r from-red-500 to-red-600 text-white text-[9px] font-bold flex items-center justify-center shadow-lg animate-pulse">
                        {mobileBadge > 9 ? "9+" : mobileBadge}
                      </span>
                    )}

                    {/* AI Badge */}
                    {item.badge === "AI" && (
                      <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-purple-500 to-pink-500 text-white text-[8px] font-bold shadow-lg">
                        AI
                      </span>
                    )}
                    {/* Security Badge */}
                    {item.badge === "SEC" && (
                      <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-linear-to-r from-blue-600 to-cyan-500 text-white text-[8px] font-bold shadow-lg">
                        🛡
                      </span>
                    )}
                  </div>

                  <span className="flex-1 text-sm font-medium">{t(item.labelKey)}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Organization Branding */}
        <div className="px-3 py-2 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              backgroundColor: "var(--background-subtle)",
              opacity: mobileOpen ? 1 : 0,
              transition: "opacity 0.4s ease 0.3s",
            }}
          >
            <Building2 className="w-4 h-4 shrink-0" style={{ color: "var(--primary)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                {t('sidebar.orgName')}
              </p>
              <p className="text-[9px] truncate" style={{ color: "var(--text-muted)" }}>
                {t('sidebar.orgSubtitleFull')}
              </p>
            </div>
          </div>
        </div>

        {/* User Info */}
        <div
          className="border-t p-3"
          style={{
            borderColor: "var(--sidebar-border)",
            opacity: mobileOpen ? 1 : 0,
            transition: "opacity 0.4s ease 0.35s",
          }}
        >
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8 ring-2" style={{ borderColor: "var(--primary-light, var(--primary))", opacity: 0.2 }}>
              {user?.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
              <AvatarFallback 
                className="text-xs text-white font-bold"
                style={{
                  background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)",
                }}
              >
                {user?.name ? getInitials(user.name) : "U"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                {user?.name ?? "User"}
              </p>
            </div>
          </div>
        </div>

        {/* Custom Scrollbar */}
        <style jsx>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: var(--border);
            border-radius: 3px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: var(--text-disabled);
          }
        `}</style>
      </aside>
    </>
  );
}
