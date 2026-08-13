'use client';

import React, { useEffect, useLayoutEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, type User } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import { useSidebarStore } from '@/store/useSidebarStore';
import { usePathname } from 'next/navigation';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { ReactQueryProvider } from '@/components/providers/ReactQueryProvider';

function SidebarSkeleton() {
  return (
    <aside className="hidden lg:flex flex-col w-60 h-screen shrink-0 border-r bg-(--sidebar-bg) border-(--sidebar-border) animate-pulse">
      <div className="h-16 border-b border-(--sidebar-border)" />
      <div className="flex-1 py-4 space-y-1">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-9 mx-2 rounded-lg bg-(--background-subtle)/50" />
        ))}
      </div>
    </aside>
  );
}

const Sidebar = dynamic(() => import('@/components/layout/Sidebar').then((m) => m.Sidebar), {
  ssr: false,
  loading: () => <SidebarSkeleton />,
});

const MobileSidebar = dynamic(
  () => import('@/components/layout/Sidebar').then((m) => m.MobileSidebar),
  { ssr: false, loading: () => null },
);

const Navbar = dynamic(() => import('@/components/layout/Navbar').then((m) => m.Navbar), {
  ssr: false,
  loading: () => (
    <div className="h-16 border-b border-(--border) bg-(--navbar-bg) fixed top-0 left-0 right-0 z-60" />
  ),
});

const ChatWidget = dynamic(
  () =>
    import('@/components/ai/ChatWidget').then((m) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      default: (props: any) => (
        <WidgetErrorBoundary name="ChatWidget">
          <m.ChatWidget {...props} />
        </WidgetErrorBoundary>
      ),
    })),
  {
    ssr: false,
    loading: () => null,
  },
);

const BreakReminderService = dynamic(
  () => import('@/components/productivity/BreakReminderService'),
  { ssr: false, loading: () => null },
);

const FocusModeIndicator = dynamic(() => import('@/components/productivity/FocusModeIndicator'), {
  ssr: false,
  loading: () => null,
});

const NotificationBanner = dynamic(
  () => import('@/components/notifications/NotificationBanner').then((m) => m.NotificationBanner),
  { ssr: false, loading: () => null },
);

const MaintenanceBanner = dynamic(
  () => import('@/components/MaintenanceBanner').then((m) => m.MaintenanceBanner),
  { ssr: false, loading: () => null },
);

const OrgFreezeGate = dynamic(
  () => import('@/components/auth/OrgFreezeGate').then((m) => m.OrgFreezeGate),
  { ssr: false, loading: () => null },
);

const IncomingCallProvider = dynamic(
  () => import('@/components/chat/IncomingCallProvider').then((m) => m.IncomingCallProvider),
  { ssr: false, loading: () => null },
);

const GlobalChatNotifier = dynamic(
  () => import('@/components/chat/GlobalChatNotifier').then((m) => m.GlobalChatNotifier),
  { ssr: false, loading: () => null },
);

const StatusUpdateBanner = dynamic(
  () => import('@/components/StatusUpdateBanner').then((m) => m.StatusUpdateBanner),
  { ssr: false, loading: () => null },
);

const MobileTabBar = dynamic(
  () => import('@/components/layout/MobileTabBar').then((m) => m.MobileTabBar),
  { ssr: false, loading: () => null },
);

const MobilePageTransition = dynamic(
  () => import('@/components/ui/mobile-page-transition').then((m) => m.MobilePageTransition),
  { ssr: false, loading: () => null },
);

// Global ⌘K / Ctrl+K palette. Mounted here rather than per-route so the shortcut
// works everywhere in the dashboard; the component itself skips all of its Convex
// queries until it is opened, so this costs nothing on page load.
const CommandPalette = dynamic(
  () => import('@/components/search/CommandPalette').then((m) => m.CommandPalette),
  { ssr: false, loading: () => null },
);

export function Providers({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const user = useAuthStore(useShallow((state: { user: User | null }) => state.user));
  const { status } = useSession();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();
  const isAIChatPage = pathname?.startsWith('/ai-chat');
  const isChatPage = pathname?.startsWith('/chat') && !isAIChatPage;
  const isAuthOnboardingPage =
    pathname?.startsWith('/onboarding/select-organization') ||
    pathname?.startsWith('/onboarding/pending');
  const redirectedRef = React.useRef(false);
  const hasHydratedRef = React.useRef(false);

  useLayoutEffect(() => {
    // Prevent double hydration
    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;

    // Rehydrate persisted stores from localStorage on client only
    // This prevents SSR/client mismatch (hydration errors) from localStorage state
    useSidebarStore.persist.rehydrate();

    // Auth store no longer persists to localStorage (security: JWT in httpOnly cookies).
    // User state is restored from server-side session cookies via useAuthSync.

    // Mark as hydrated after rehydration
    // This is a necessary use case for setState in effect - synchronizing with external system
    // Using requestIdleCallback to avoid cascading renders
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => setHydrated(true));
    } else {
      setTimeout(() => setHydrated(true), 0);
    }
  }, []);

  // Redirect to onboarding if user needs it (and not already on onboarding page)
  useEffect(() => {
    if (
      hydrated &&
      user &&
      !user.organizationId &&
      (user.role === 'employee' || user.role === 'driver') &&
      !isAuthOnboardingPage &&
      !redirectedRef.current
    ) {
      redirectedRef.current = true;
      router.push('/onboarding/select-organization');
    }
  }, [hydrated, user, isAuthOnboardingPage, router]);

  // Don't redirect to login if user is on auth onboarding page
  if (isAuthOnboardingPage) {
    return <>{children}</>;
  }

  // Show Shield HR loader while:
  // 1. Stores haven't hydrated from localStorage yet
  // 2. OAuth session is active (Google login) but user data hasn't been synced from Convex yet
  const isOAuthSyncing = status === 'authenticated' && !user;
  if (!hydrated || isOAuthSyncing) {
    return (
      <div className="flex h-screen items-center justify-center bg-(--background)">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  // Block dashboard access if user has no organization (onboarding required)
  if (user && !user.organizationId && !isAuthOnboardingPage) {
    return (
      <div className="flex h-screen items-center justify-center bg-(--background)">
        <ShieldLoader size="lg" />
      </div>
    );
  }

  // transition-colors removed from wrapper div — causes full-tree repaint on theme change
  return (
    <ErrorBoundary>
      <ReactQueryProvider>
        {/* `app-shell` (see globals.css) is the real height: 100dvh minus the
            safe-area insets. `h-dvh` is only a safety net — Tailwind utilities
            live in `@layer utilities`, so the unlayered `.app-shell` rule always
            wins over it. If that rule ever fails to reach the browser (stale CSS
            chunk after an HMR update, blocked stylesheet), the shell still gets a
            definite height instead of collapsing to `auto`, which turns the
            document into the scroller and drags the sidebar out of the viewport. */}
        <div className="flex app-shell h-dvh bg-(--background) overflow-hidden">
          {/* Desktop Sidebar — ssr:false prevents localStorage persist mismatch */}
          <Sidebar />

          {/* Mobile Sidebar */}
          <MobileSidebar />

          {/* Main content — overflow-clip prevents content bleed without creating containing block */}
          <div className="flex-1 flex flex-col min-w-0 overflow-clip">
            {/* Navbar — ssr:false prevents theme/user/notification mismatch */}
            <Navbar />
            {user?.impersonation?.active && (
              <div className="fixed top-20 right-4 z-80">
                <Link
                  href="/superadmin/impersonate"
                  className="inline-flex items-center gap-2 rounded-full border border-amber-500/60 bg-amber-500 text-black px-4 py-2 text-sm font-semibold shadow-lg transition hover:scale-[1.02] hover:bg-amber-400"
                >
                  <Undo2 className="h-4 w-4" />
                  {t('superadmin.impersonate.exitMode')}
                </Link>
              </div>
            )}
            {/* Maintenance warning banner — below navbar, above content */}
            {user && <MaintenanceBanner />}
            {/* Frozen-organization lock screen — blocks every feature */}
            {user && <OrgFreezeGate />}
            {/* Status update banner — below maintenance banner */}
            <StatusUpdateBanner />
            {/* Real-time notification banner — below status banner, full width, persistent */}
            {user && <NotificationBanner />}
            {/* Main content area — min-h-0 prevents CLS when content loads */}
            <main
              className={
                isChatPage || isAIChatPage
                  ? 'flex-1 overflow-hidden flex flex-col min-h-0'
                  : 'flex-1 overflow-y-auto overflow-x-hidden min-h-0 main-scrollable'
              }
            >
              {isChatPage ? (
                <div className="flex flex-col flex-1 min-h-0 h-full p-0 sm:p-3 md:p-4">
                  <div className="flex flex-col flex-1 min-h-0 h-full mx-auto w-full">
                    {children}
                  </div>
                </div>
              ) : isAIChatPage ? (
                <div className="flex flex-col flex-1 min-h-0 h-full p-0">
                  <div className="flex flex-col flex-1 min-h-0 h-full mx-auto w-full">
                    {children}
                  </div>
                </div>
              ) : (
                <div className="p-3 sm:p-4 md:p-6 pb-mobile-dock mx-auto max-w-7xl w-full">
                  <MobilePageTransition>{children}</MobilePageTransition>
                </div>
              )}
            </main>
          </div>
          {/* AI Chat Widget - hidden on /chat page so it doesn't cover the send button */}
          {!isChatPage && <ChatWidget />}

          {/* Mobile Tab Bar — fixed bottom navigation for mobile */}
          <MobileTabBar />

          {/* ⌘K palette — the navbar shortcut modal, the dashboard Quick Actions
              header and the productivity settings page all advertise this
              shortcut, and until it was mounted here, pressing it did nothing. */}
          {hydrated && user && <CommandPalette />}

          {/* Global incoming call detection — works on ALL pages */}
          {hydrated && user && <IncomingCallProvider />}
          {/* Global chat notification sound + toast — works on ALL pages */}
          {hydrated && user && <GlobalChatNotifier />}

          {/* Productivity Services - only render when mounted to avoid SSR mismatch */}
          {hydrated && user && (
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
      </ReactQueryProvider>
    </ErrorBoundary>
  );
}
