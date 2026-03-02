"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/store/useAuthStore";
import { useSidebarStore } from "@/store/useSidebarStore";
import { getSessionAction } from "@/actions/auth";

const Sidebar = dynamic(
  () => import("@/components/layout/Sidebar").then((m) => m.Sidebar),
  { ssr: false, loading: () => null }
);

const MobileSidebar = dynamic(
  () => import("@/components/layout/Sidebar").then((m) => m.MobileSidebar),
  { ssr: false, loading: () => null }
);

const Navbar = dynamic(
  () => import("@/components/layout/Navbar").then((m) => m.Navbar),
  { ssr: false, loading: () => <div className="h-16 border-b border-[var(--border)] bg-[var(--navbar-bg)] fixed top-0 left-0 right-0 z-[60]" /> }
);

const ChatWidget = dynamic(
  () => import("@/components/ai/ChatWidget").then((m) => m.ChatWidget),
  { ssr: false, loading: () => null }
);

const BreakReminderService = dynamic(
  () => import("@/components/productivity/BreakReminderService"),
  { ssr: false, loading: () => null }
);

const FocusModeIndicator = dynamic(
  () => import("@/components/productivity/FocusModeIndicator"),
  { ssr: false, loading: () => null }
);

export function Providers({ children }: { children: React.ReactNode }) {
  const { setUser, user } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Rehydrate persisted stores from localStorage on client only
    // This prevents SSR/client mismatch (hydration errors) from localStorage state
    useSidebarStore.persist.rehydrate();
    useAuthStore.persist.rehydrate();
    setMounted(true);

    async function loadSession() {
      try {
        const session = await getSessionAction();
        if (session?.userId) {
          setUser({
            id: session.userId,
            name: session.name,
            email: session.email,
            role: session.role as "admin" | "supervisor" | "employee",
            department: session.department,
            position: session.position,
            employeeType: session.employeeType as "staff" | "contractor",
            avatar: session.avatar,
          });
        }
      } catch {
        // Session load failed silently
      }
    }
    loadSession();
  }, []);

  // transition-colors removed from wrapper div — causes full-tree repaint on theme change
  return (
    <div className="flex h-screen bg-[var(--background)] overflow-hidden">
      {/* Desktop Sidebar — ssr:false prevents localStorage persist mismatch */}
      <Sidebar />

      {/* Mobile Sidebar */}
      <MobileSidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Navbar — ssr:false prevents theme/user/notification mismatch */}
        <Navbar />
        {/* Main content area */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
      {/* AI Chat Widget - lazy loaded, ssr:false defers entire chunk until interaction */}
      <ChatWidget />

      {/* Productivity Services - only render when mounted to avoid SSR mismatch */}
      {mounted && user && (
        <>
          <BreakReminderService
            enabled={user.breakRemindersEnabled ?? false}
            intervalMinutes={user.breakInterval ?? 120}
            workHoursStart={user.workHoursStart}
            workHoursEnd={user.workHoursEnd}
          />
          <FocusModeIndicator
            enabled={user.focusModeEnabled ?? false}
            workHoursStart={user.workHoursStart}
            workHoursEnd={user.workHoursEnd}
          />
        </>
      )}
    </div>
  );
}
