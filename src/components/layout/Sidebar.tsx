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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarStore } from "@/store/useSidebarStore";
import { useAuthStore } from "@/store/useAuthStore";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const navItems = [
  { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard, roles: ["admin", "supervisor", "employee"] },
  { href: "/attendance", labelKey: "nav.attendance", icon: Clock, roles: ["admin", "supervisor", "employee"] },
  { href: "/analytics", labelKey: "nav.analytics", icon: BarChart3, roles: ["admin", "supervisor"] },
  { href: "/leaves", labelKey: "nav.leaves", icon: ClipboardList, roles: ["admin", "supervisor", "employee"] },
  { href: "/employees", labelKey: "nav.employees", icon: Users, roles: ["admin", "supervisor", "employee"] },
  { href: "/calendar", labelKey: "nav.calendar", icon: CalendarDays, roles: ["admin", "supervisor", "employee"] },
  { href: "/reports", labelKey: "nav.reports", icon: FileText, roles: ["admin", "supervisor"] },
  { href: "/tasks", labelKey: "nav.tasks", icon: CheckSquare, roles: ["admin", "supervisor", "employee"] },
  { href: "/approvals", labelKey: "nav.approvals", icon: UserCheck, roles: ["admin"] },
  { href: "/ai-site-editor", labelKey: "nav.aiSiteEditor", icon: Sparkles, roles: ["admin", "supervisor", "employee"], badge: "AI" },
  { href: "/profile", labelKey: "nav.profile", icon: User, roles: ["admin", "supervisor", "employee"] },
  { href: "/settings", labelKey: "nav.settings", icon: Settings, roles: ["admin", "supervisor", "employee"] },
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
  
  const taskUnreadCount = (notifications ?? []).filter(
    (n: any) => !n.isRead && n.type === "system" && (n.title?.includes("Task") || n.title?.includes("task"))
  ).length;

  if (!mounted) return null;

  const visibleItems = navItems.filter((item) => 
    item.roles.includes(user?.role ?? "employee")
  );

  return (
    <aside
      className={cn(
        "relative hidden lg:flex flex-col h-screen border-r z-30 flex-shrink-0 transition-all duration-300 ease-out",
        collapsed ? "w-[72px]" : "w-60"
      )}
      style={{
        background: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      {/* Header with Logo and Toggle */}
      <div
        className="flex items-center h-16 px-4 border-b"
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        <div className="flex items-center justify-between w-full gap-2">
          {/* Logo */}
          <div 
            className={cn(
              "flex items-center gap-2 overflow-hidden transition-all duration-300",
              collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg">
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
          </div>

          {/* Toggle Button */}
          <button
            onClick={toggle}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200 hover:scale-110",
              "focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            )}
            style={{
              backgroundColor: "var(--background-subtle)",
              color: "var(--text-muted)",
            }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 custom-scrollbar">
        <div className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            const badge = item.badge === "AI" ? taskUnreadCount : 0;
            const showBadge = item.href === "/tasks" ? taskUnreadCount > 0 : false;

            return (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={() => setHoveredItem(item.href)}
                onMouseLeave={() => setHoveredItem(null)}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                  "focus:outline-none focus:ring-2 focus:ring-blue-500/50",
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
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-gradient-to-b from-blue-600 to-blue-700"
                    style={{
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
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-gradient-to-r from-red-500 to-red-600 text-white text-[9px] font-bold flex items-center justify-center shadow-lg">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}

                  {/* AI Badge */}
                  {item.badge === "AI" && (
                    <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[8px] font-bold shadow-lg">
                      AI
                    </span>
                  )}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    "flex-1 text-sm font-medium transition-all duration-300 truncate",
                    collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
                  )}
                >
                  {t(item.labelKey)}
                </span>

                {/* Tooltip for collapsed state */}
                {collapsed && (
                  <div
                    className="absolute left-full ml-2 px-3 py-1.5 rounded-lg whitespace-nowrap z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{
                      backgroundColor: "var(--card)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border)",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                    }}
                  >
                    <span className="text-xs font-medium">{t(item.labelKey)}</span>
                  </div>
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
              "min-w-0 flex-1 transition-all duration-300",
              collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}
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
          <Avatar className="w-8 h-8 flex-shrink-0 ring-2 ring-blue-500/20 transition-all duration-200 hover:ring-blue-500/40">
            {user?.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
            <AvatarFallback className="text-xs bg-gradient-to-br from-blue-600 to-blue-700 text-white font-bold">
              {user?.name ? getInitials(user.name) : "U"}
            </AvatarFallback>
          </Avatar>
          <div
            className={cn(
              "min-w-0 flex-1 transition-all duration-300",
              collapsed ? "opacity-0 w-0" : "opacity-100 w-auto"
            )}
          >
            <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {user?.name ?? "User"}
            </p>
            <p className="text-[10px] truncate capitalize" style={{ color: "var(--text-muted)" }}>
              {user?.role ?? "admin"}
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
          from {
            opacity: 0;
            transform: translateY(-50%) translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(-50%) translateX(0);
          }
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
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        aria-hidden="true"
      />

      {/* Sidebar Panel */}
      <aside
        ref={sidebarRef}
        className={cn(
          "fixed top-0 left-0 bottom-0 z-50 w-[280px] lg:hidden flex flex-col",
          "transition-transform duration-300 ease-out shadow-2xl",
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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-lg">
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
          </div>

          {/* Close Button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            style={{
              backgroundColor: "var(--background-subtle)",
              color: "var(--text-muted)",
            }}
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-3 custom-scrollbar">
          <div className="space-y-1">
            {visibleItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              const mobileBadge = item.href === "/tasks" ? mobileTaskBadge : 0;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200",
                    "focus:outline-none focus:ring-2 focus:ring-blue-500/50",
                    isActive && "shadow-sm"
                  )}
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
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-gradient-to-b from-blue-600 to-blue-700" />
                  )}

                  {/* Icon */}
                  <div className="relative">
                    <Icon
                      className={cn("w-5 h-5 transition-transform", isActive && "scale-110")}
                      style={{ color: isActive ? "var(--sidebar-item-active-text)" : "var(--text-disabled)" }}
                    />
                    
                    {/* Badge */}
                    {mobileBadge > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-gradient-to-r from-red-500 to-red-600 text-white text-[9px] font-bold flex items-center justify-center shadow-lg">
                        {mobileBadge > 9 ? "9+" : mobileBadge}
                      </span>
                    )}

                    {/* AI Badge */}
                    {item.badge === "AI" && (
                      <span className="absolute -top-1 -right-1 px-1 py-0.5 rounded bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[8px] font-bold shadow-lg">
                        AI
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
            <Building2 className="w-4 h-4 flex-shrink-0" style={{ color: "var(--primary)" }} />
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
            <Avatar className="w-8 h-8 ring-2 ring-blue-500/20">
              {user?.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
              <AvatarFallback className="text-xs bg-gradient-to-br from-blue-600 to-blue-700 text-white font-bold">
                {user?.name ? getInitials(user.name) : "U"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                {user?.name ?? "User"}
              </p>
              <p className="text-[10px] truncate capitalize" style={{ color: "var(--text-muted)" }}>
                {user?.role ?? "admin"}
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
