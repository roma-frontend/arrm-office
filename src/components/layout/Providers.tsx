"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAuthStore } from "@/store/useAuthStore";
import { useSidebarStore } from "@/store/useSidebarStore";
import { usePathname } from "next/navigation";

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
  const { user } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const isChatPage = pathname?.startsWith("/chat");

  useEffect(() => {
    // Rehydrate persisted stores from localStorage on client only
    // This prevents SSR/client mismatch (hydration errors) from localStorage state
    useSidebarStore.persist.rehydrate();

    // Rehydrate auth store from localStorage for email/password login sessions.
    // Email/password login saves user data to localStorage but after page reload
    // the store is empty (skipHydration: true). We need to restore it here.
    // For OAuth sessions, useAuthSync will overwrite with fresh data anyway,
    // so rehydrating stale data first is harmless.
    useAuthStore.persist.rehydrate();

    setMounted(true);
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
        {/* Main content area — chat page gets no padding and no scroll (manages its own) */}
        <main className={isChatPage ? "flex-1 overflow-hidden flex flex-col min-h-0" : "flex-1 overflow-y-auto overflow-x-hidden"}>
          {isChatPage ? (
            <div className="flex flex-col flex-1 min-h-0 h-full p-0 sm:p-3 md:p-4">
              {children}
            </div>
          ) : (
            <div className="p-2 sm:p-4 md:p-6 max-w-[1600px] mx-auto">
              {children}
            </div>
          )}
        </main>
      </div>
      {/* AI Chat Widget - hidden on /chat page so it doesn't cover the send button */}
      {!isChatPage && <ChatWidget />}

      {/* Productivity Services - only render when mounted to avoid SSR mismatch */}
      {mounted && user && (
        <>
          <BreakReminderService
            enabled={false}
            intervalMinutes={120}
            workHoursStart={undefined}
            workHoursEnd={undefined}
          />
          <FocusModeIndicator
            enabled={false}
            workHoursStart={undefined}
            workHoursEnd={undefined}
          />
        </>
      )}
    </div>
  );
}
