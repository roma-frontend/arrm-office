"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
// framer-motion removed — replaced with CSS transitions to reduce main-thread work,
// eliminate forced reflow from JS-driven animations, and defer the framer-motion bundle
import {
  Menu, Bell, Sun, Moon, LogOut, User, Settings, ChevronDown, Check, X,
  Plus, Calendar, Clock, FileText, Zap, Keyboard, History, Star, Circle, Home,
} from "lucide-react";

type PresenceStatus = "available" | "in_meeting" | "in_call" | "out_of_office" | "busy";
const PRESENCE_CONFIG: Record<PresenceStatus, { labelKey: string; dot: string; icon: string }> = {
  available:     { labelKey: "presence.available",    dot: "bg-emerald-500", icon: "🟢" },
  in_meeting:    { labelKey: "presence.inMeeting",    dot: "bg-amber-500",   icon: "📅" },
  in_call:       { labelKey: "presence.inCall",       dot: "bg-blue-500",    icon: "📞" },
  out_of_office: { labelKey: "presence.outOfOffice",  dot: "bg-rose-500",    icon: "🏠" },
  busy:          { labelKey: "presence.busy",         dot: "bg-orange-500",  icon: "⛔" },
};
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useSidebarStore } from "@/store/useSidebarStore";
import { useAuthStore } from "@/store/useAuthStore";
import { logoutAction } from "@/actions/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import type { Id } from "../../../convex/_generated/dataModel";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { QuickStatsWidget } from "@/components/productivity/QuickStatsWidget";
import { TeamPresence } from "@/components/productivity/TeamPresence";
import { PomodoroTimer } from "@/components/productivity/PomodoroTimer";
import { FocusMode } from "@/components/productivity/FocusMode";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

// Play a beautiful notification sound using Web Audio API
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    const playTone = (freq: number, startTime: number, duration: number, gain: number) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(gain, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    // Beautiful 3-note chime: C5 → E5 → G5
    playTone(523.25, now, 0.4, 0.3);
    playTone(659.25, now + 0.15, 0.4, 0.25);
    playTone(783.99, now + 0.3, 0.6, 0.2);
  } catch (e) {
    // Silently fail if audio not supported
  }
}

// Page titles mapped to translation keys
const PAGE_TITLE_KEYS: Record<string, string> = {
  "/dashboard": "nav.dashboard",
  "/leaves": "nav.leaveManagement",
  "/employees": "nav.employees",
  "/calendar": "nav.calendar",
  "/reports": "nav.reports",
  "/tasks": "nav.tasks",
  "/attendance": "nav.attendance",
  "/analytics": "nav.analytics",
  "/approvals": "nav.approvals",
  "/profile": "nav.profile",
  "/settings": "nav.settings",
};

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

interface ToastNotif {
  id: string;
  title: string;
  message: string;
}

export function Navbar() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { setMobileOpen } = useSidebarStore();
  const { user, logout } = useAuthStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [toasts, setToasts] = useState<ToastNotif[]>([]);
  const [statusExpanded, setStatusExpanded] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const prevUnreadCount = useRef<number>(-1);
  const prevNotifIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);

  React.useEffect(() => { 
    setMounted(true); 
  }, []);

  // Convex notifications
  const notifications = useQuery(api.notifications.getUserNotifications, 
    user?.id ? { userId: user.id as Id<"users"> } : "skip"
  ) ?? [];
  const markRead = useMutation(api.notifications.markAsRead);
  const markAllRead = useMutation(api.notifications.markAllAsRead);
  const updatePresence = useMutation(api.users.updatePresenceStatus);
  const currentUserData = useQuery(
    api.users.getUserById,
    user?.id ? { userId: user.id as Id<"users"> } : "skip"
  );
  const userStats = useQuery(
    api.userStats.getUserStats,
    user?.id ? { userId: user.id as Id<"users"> } : "skip"
  );
  const currentPresence = ((currentUserData as any)?.presenceStatus ?? "available") as PresenceStatus;
  const presenceCfg = PRESENCE_CONFIG[currentPresence];
  const presenceLabel = t(presenceCfg.labelKey);

  const unreadCount = notifications.filter((n: { isRead: boolean }) => !n.isRead).length;
  const leaveBalance = currentUserData?.paidLeaveBalance || 0;

  // Detect new notifications and play sound + show toast
  useEffect(() => {
    if (!notifications || notifications.length === 0) return;

    // Skip very first load to avoid sound on page refresh
    if (isFirstLoad.current) {
      notifications.forEach((n: any) => prevNotifIds.current.add(n._id));
      prevUnreadCount.current = unreadCount;
      isFirstLoad.current = false;
      return;
    }

    // Find truly new notifications (not seen before)
    const newNotifs = notifications.filter(
      (n: any) => !n.isRead && !prevNotifIds.current.has(n._id)
    );

    if (newNotifs.length > 0) {
      playNotificationSound();

      // Show toast for each new notification
      newNotifs.forEach((n: any) => {
        const toastId = n._id + Date.now();
        setToasts(prev => [...prev, { id: toastId, title: n.title, message: n.message }]);
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toastId));
        }, 5000);
      });

      // Update seen IDs
      newNotifs.forEach((n: any) => prevNotifIds.current.add(n._id));
    }

    // Also track all IDs
    notifications.forEach((n: any) => prevNotifIds.current.add(n._id));
    prevUnreadCount.current = unreadCount;
  }, [notifications, unreadCount]);

  const pageTitleKey = Object.entries(PAGE_TITLE_KEYS).find(([key]) =>
    pathname.startsWith(key)
  )?.[1];
  const pageTitle = pageTitleKey ? t(pageTitleKey) : "HR Office";

  const handleLogout = async () => {
    await logoutAction();
    logout();
    document.cookie = "hr-auth-token=; path=/; max-age=0";
    router.push("/");
  };

  const handleMarkAllRead = async () => {
    if (!user?.id) return;
    await markAllRead({ userId: user.id as Id<"users"> });
  };

  const handleMarkRead = async (id: Id<"notifications">) => {
    await markRead({ notificationId: id });
  };

  const timeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return `${mins}m ago`;
  };

  return (
    <>
    <header className="h-16 border-b border-[var(--border)] bg-[var(--navbar-bg)] flex items-center px-4 gap-4 sticky top-0 z-[50] transition-colors duration-300">
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="w-5 h-5" />
      </Button>

      {/* Home button */}
      <Button
        variant="ghost"
        size="icon"
        className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        onClick={() => router.push("/")}
        title={t('nav.home') || 'Home'}
      >
        <Home className="w-5 h-5" />
      </Button>

      {/* Page title - hidden */}
      <div className="flex-1">
        {/* Title removed for cleaner navbar */}
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-1">
        {/* Notifications */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="relative text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            onClick={() => setShowNotifications(!showNotifications)}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#2563eb] rounded-full animate-pulse" />
            )}
          </Button>

          {showNotifications && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowNotifications(false)} />
              {/* CSS transition instead of motion.div — no JS-driven layout recalc */}
              <div
                className="absolute right-0 top-full mt-2 w-80 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl z-20 overflow-hidden"
                style={{
                  animation: "notif-dropdown 0.15s ease both",
                }}
              >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {t('notifications.title')}
                    </p>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 && (
                        <Badge variant="default" className="text-xs px-1.5 py-0 bg-[#2563eb]">
                          {unreadCount}
                        </Badge>
                      )}
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-xs text-[#2563eb] hover:underline flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> {t('notifications.markAllAsRead')}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-[var(--border)]">
                    {notifications.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <Bell className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                        <p className="text-sm text-[var(--text-muted)]">{t('notifications.noNotifications')}</p>
                      </div>
                    ) : (
                      notifications.map((n: { _id: Id<"notifications">; title: string; message: string; isRead: boolean; type: string; relatedId?: string; _creationTime: number }) => (
                        <div
                          key={n._id}
                          onClick={() => {
                            handleMarkRead(n._id);
                            // Navigate based on notification type
                            if (n.type === "leave_request" && n.relatedId) {
                              router.push("/leaves");
                            } else if (n.type === "employee_added") {
                              router.push("/employees");
                            } else if (n.type === "system" && (n.title?.includes("Task") || n.title?.includes("task"))) {
                              router.push("/tasks");
                            }
                            setShowNotifications(false);
                          }}
                          className={`px-4 py-3 hover:bg-[var(--background-subtle)] cursor-pointer transition-colors ${
                            !n.isRead ? "bg-[#2563eb]/5 border-l-2 border-[#2563eb]" : ""
                          }`}
                        >
                          <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug">{n.title}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">{n.message}</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">{timeAgo(n._creationTime)}</p>
                        </div>
                      ))
                    )}
                  </div>
              </div>
            </>
          )}
        </div>

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={mounted ? (theme === "dark" ? t('settings.lightMode') : t('settings.darkMode')) : t('settings.darkMode')}
        >
          {mounted ? (
            theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </Button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--background-subtle)] transition-colors outline-none focus-visible:outline-none focus:outline-none">
              <div className="relative">
                <Avatar className="w-8 h-8">
                  {user?.avatar && <AvatarImage src={user.avatar} alt={user.name} />}
                  <AvatarFallback className="text-xs bg-gradient-to-br from-[#1d4ed8] to-[#0ea5e9] text-white font-semibold">
                    {user?.name ? getInitials(user.name) : "U"}
                  </AvatarFallback>
                </Avatar>
                {/* Presence dot */}
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[var(--navbar-bg)] ${presenceCfg.dot}`} />
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-[var(--text-primary)] leading-tight">{user?.name ?? "User"}</p>
                <p className="text-[10px] text-[var(--text-muted)] capitalize">{presenceCfg.icon} {presenceLabel}</p>
              </div>
              <ChevronDown className="w-3 h-3 text-[var(--text-muted)] hidden sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            collisionPadding={{ top: 72, bottom: 16, left: 16, right: 16 }}
            className="w-80 max-h-[calc(100vh-90px)] overflow-y-auto bg-[var(--card)] border-[var(--border)] shadow-xl"
          >
            {/* Productivity Widgets */}
            {mounted && user && (
              <>
                {/* Quick Stats Widget */}
                <QuickStatsWidget />
                <DropdownMenuSeparator className="bg-[var(--border)]" />

                {/* Focus Mode */}
                <FocusMode currentPresence={currentPresence} />
                <DropdownMenuSeparator className="bg-[var(--border)]" />

                {/* Pomodoro Timer */}
                <PomodoroTimer />
                <DropdownMenuSeparator className="bg-[var(--border)]" />

                {/* Team Presence */}
                <TeamPresence />
                <DropdownMenuSeparator className="bg-[var(--border)]" />
              </>
            )}
            <DropdownMenuLabel className="text-[var(--text-muted)] text-xs">{t('nav.quickActions')}</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[var(--border)]" />
            <DropdownMenuItem
              className="text-[var(--text-primary)] cursor-pointer hover:bg-[var(--background-subtle)] focus:bg-[var(--background-subtle)] gap-2 font-medium"
              onClick={() => router.push("/tasks?new=true")}
            >
              <Plus className="w-4 h-4 text-blue-500" />
              <span>{t('shortcuts.newTask')}</span>
              <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-mono bg-[var(--background-subtle)] border border-[var(--border)] rounded">⌘T</kbd>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[var(--text-primary)] cursor-pointer hover:bg-[var(--background-subtle)] focus:bg-[var(--background-subtle)] gap-2"
              onClick={() => router.push("/leaves?new=true")}
            >
              <Calendar className="w-4 h-4 text-purple-500" />
              <span>{t('leave.requestLeave')}</span>
              <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-mono bg-[var(--background-subtle)] border border-[var(--border)] rounded">⌘L</kbd>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[var(--text-primary)] cursor-pointer hover:bg-[var(--background-subtle)] focus:bg-[var(--background-subtle)] gap-2"
              onClick={() => router.push("/attendance")}
            >
              <Clock className="w-4 h-4 text-green-500" />
              <span>{t('navbar.clockInOut')}</span>
              <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-mono bg-[var(--background-subtle)] border border-[var(--border)] rounded">⌘A</kbd>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[var(--text-primary)] cursor-pointer hover:bg-[var(--background-subtle)] focus:bg-[var(--background-subtle)] gap-2"
              onClick={() => router.push("/reports")}
            >
              <FileText className="w-4 h-4 text-orange-500" />
              {t('navbar.myReports')}
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-[var(--border)]" />
            <DropdownMenuLabel className="text-[var(--text-muted)] text-xs">{t('nav.accountSettings')}</DropdownMenuLabel>
            <DropdownMenuItem
              className="text-[var(--text-primary)] cursor-pointer hover:bg-[var(--background-subtle)] focus:bg-[var(--background-subtle)] gap-2"
              onClick={() => router.push("/profile")}
            >
              <User className="w-4 h-4 text-[var(--text-muted)]" />
              {t('nav.profile')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[var(--text-primary)] cursor-pointer hover:bg-[var(--background-subtle)] focus:bg-[var(--background-subtle)] gap-2"
              onClick={() => router.push("/settings")}
            >
              <Settings className="w-4 h-4 text-[var(--text-muted)]" />
              {t('nav.settings')}
            </DropdownMenuItem>

            {/* Status selector - collapsible */}
            <DropdownMenuSeparator className="bg-[var(--border)]" />
            
            {/* Status trigger button */}
            <div
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setStatusExpanded(!statusExpanded);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-all duration-200 hover:bg-[var(--background-subtle)]/60 hover:pl-2.5 cursor-pointer"
            >
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${presenceCfg.dot}`} />
              <span className="flex-1 text-left font-medium text-[var(--text-primary)]">
                {presenceCfg.icon} {presenceLabel}
              </span>
              <ChevronDown 
                className={`h-4 w-4 text-[var(--text-muted)] transition-transform duration-200 ${
                  statusExpanded ? 'rotate-180' : ''
                }`}
              />
            </div>

            {/* Expandable status list */}
            <div
              className={`overflow-hidden transition-all duration-300 ease-out ${
                statusExpanded ? 'max-h-[300px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="py-1">
                {(Object.entries(PRESENCE_CONFIG) as [PresenceStatus, typeof PRESENCE_CONFIG[PresenceStatus]][]).map(([key, cfg]) => (
                  <DropdownMenuItem
                    key={key}
                    onClick={async () => {
                      if (user?.id) {
                        await updatePresence({ userId: user.id as Id<"users">, status: key });
                        setStatusExpanded(false); // Close after selection
                      }
                    }}
                    className={`ml-4 ${currentPresence === key ? 'bg-[var(--background-subtle)]/40' : ''}`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <span className={`text-sm flex-1 ${currentPresence === key ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
                      {t(cfg.labelKey)}
                    </span>
                    {currentPresence === key && <Check className="w-3.5 h-3.5 text-[#2563eb]" />}
                  </DropdownMenuItem>
                ))}
              </div>
            </div>

            {/* Keyboard Shortcuts hint */}
            <DropdownMenuSeparator className="bg-[var(--border)]" />
            <DropdownMenuItem
              className="text-[var(--text-primary)] cursor-pointer hover:bg-[var(--background-subtle)] focus:bg-[var(--background-subtle)] gap-2"
              onClick={() => setShowShortcutsModal(true)}
            >
              <Keyboard className="w-4 h-4 text-[var(--text-muted)]" />
              <span>{t('shortcuts.keyboardShortcuts')}</span>
              <kbd className="ml-auto px-1.5 py-0.5 text-[10px] font-mono bg-[var(--background-subtle)] border border-[var(--border)] rounded">⌘/</kbd>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-[var(--border)]" />
            <DropdownMenuItem
              className="text-red-500 focus:text-red-500 focus:bg-red-500/10 cursor-pointer gap-2"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4" />
              {t('nav.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
    {/* Notification Toasts — CSS keyframe animation instead of framer-motion spring */}
    <div className="fixed top-20 right-4 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto w-80 bg-[var(--card)] border border-[#2563eb]/40 rounded-2xl shadow-2xl shadow-[#2563eb]/20 overflow-hidden"
          style={{ animation: "toast-slide-in 0.3s cubic-bezier(0.22,1,0.36,1) both" }}
        >
          {/* Progress bar — CSS animation instead of motion.div width */}
          <div className="h-1 bg-gradient-to-r from-[#1d4ed8] to-[#0ea5e9] relative overflow-hidden">
            <div
              className="absolute inset-0 bg-white/30"
              style={{ animation: "toast-progress 5s linear both" }}
            />
          </div>
          <div className="p-4 flex items-start gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1d4ed8] to-[#0ea5e9] flex items-center justify-center shadow-lg">
                <Bell className="w-5 h-5 text-white" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[var(--card)]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)] leading-tight">
                {toast.title}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1 leading-snug">
                {toast.message}
              </p>
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="flex-shrink-0 p-1 rounded-lg hover:bg-[var(--background-subtle)] transition-colors"
            >
              <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            </button>
          </div>
        </div>
      ))}
    </div>

    {/* Keyboard Shortcuts Modal */}
    <KeyboardShortcutsModal 
      isOpen={showShortcutsModal} 
      onClose={() => setShowShortcutsModal(false)} 
    />
    </>
  );
}

export default Navbar;
