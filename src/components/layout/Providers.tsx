'use client';

import React, { useEffect, useLayoutEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MessageSquareOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ensureAppNamespaces } from '@/i18n/config';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useI18nOverrides } from '@/hooks/useI18nOverrides';
import { useAuthStore, type User } from '@/store/useAuthStore';
import { useShallow } from 'zustand/shallow';
import { useSidebarStore } from '@/store/useSidebarStore';
import { usePathname } from 'next/navigation';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { ErrorBoundary } from '@/components/error/ErrorBoundary';
import { ReactQueryProvider } from '@/components/providers/ReactQueryProvider';
import { NavBadgesProvider } from '@/components/layout/NavBadgesProvider';
import DashboardAmbient from '@/components/layout/DashboardAmbient';

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

// Tool Dock — floating "Your tools" trigger on the right edge of every
// dashboard page (mounted once here, not per page). It hides on scroll down
// and slides back on scroll up; the sheets it opens are self-contained.
const ToolDock = dynamic(() => import('@/components/dashboard/ToolDock').then((m) => m.ToolDock), {
  ssr: false,
  loading: () => null,
});

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

const ImpersonationBanner = dynamic(
  () => import('@/components/auth/ImpersonationBanner').then((m) => m.ImpersonationBanner),
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

// Global upgrade modal — opened by the Convex client interceptor when a
// mutation is rejected because the module isn't in the caller's plan or its
// quota is exhausted. Mounted once here so it works on every dashboard page.
const UpgradeModal = dynamic(
  () => import('@/components/billing/UpgradeModal').then((m) => m.UpgradeModal),
  { ssr: false, loading: () => null },
);

// Route-level plan gate — replaces the page content with a "No access" screen
// when the current route's module is not in the caller's plan.
const PlanRouteGate = dynamic(
  () => import('@/components/billing/PlanRouteGate').then((m) => m.PlanRouteGate),
  { ssr: false, loading: () => <>{null}</> },
);

export function Providers({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const user = useAuthStore(useShallow((state: { user: User | null }) => state.user));
  const isSigningOut = useAuthStore((state) => state.isSigningOut);
  // Superadmin translation overrides — fetched once and injected into i18next.
  useI18nOverrides(user?.role === 'superadmin');
  const { status } = useSession();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();
  const { isEnabled: isFeatureEnabled } = useFeatureFlags();
  const isAIChatPage = pathname?.startsWith('/ai-chat');
  const isChatPage = pathname?.startsWith('/chat') && !isAIChatPage;
  const isFullscreenPage = pathname?.startsWith('/tasks');
  // The chat module itself can be toggled off; the page then renders a
  // friendly disabled state instead of a live conversation surface.
  const isChatDisabled = isChatPage && !isFeatureEnabled('chat.realtime');
  const isAuthOnboardingPage =
    pathname?.startsWith('/onboarding/select-organization') ||
    pathname?.startsWith('/onboarding/pending');
  const redirectedRef = React.useRef(false);
  const hasHydratedRef = React.useRef(false);
  // Signed-out gate: see the effects below and the render gate further down.
  const [sessionGone, setSessionGone] = useState(false);
  const leavingRef = React.useRef(false);
  // This shell wraps the `(dashboard)` route group only — every route under it
  // is private. So a null user (after hydration) always means "no session":
  // logout, expired JWT, cookies cleared in another tab.
  const isSignedOut = !user && !isAuthOnboardingPage;

  // Dashboard-only translation namespaces are lazy-loaded (see src/i18n/config.ts);
  // fetch them as soon as the dashboard mounts. Fire-and-forget — t() consumers
  // re-render when the bundles arrive.
  useEffect(() => {
    ensureAppNamespaces();
  }, []);

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

  // Confirm there is really no session before sending anyone to /login.
  //
  // An empty store is not proof on its own: `useAuthSync` restores the user
  // from the `hr-auth-token` cookie asynchronously, so right after a reload the
  // store can be empty while the session is perfectly valid. We therefore probe
  // the JWT and only mark the session gone when the cookie is missing too.
  // Until then the render gate below keeps the loader up — the shell is never
  // rendered without a user, which is what used to flash the public navbar.
  useEffect(() => {
    if (!hydrated || !isSignedOut) return;
    // A deliberate sign-out already owns the navigation (hard redirect to
    // /api/clear-session); don't race it with a push to /login.
    if (isSigningOut) return;
    // Only NextAuth's `unauthenticated` verdict makes the JWT probe meaningful.
    // While it is `loading` the answer isn't in yet, and while it is
    // `authenticated` a Google sign-in is mid-flight: the session exists but the
    // `hr-auth-token` bridge cookie hasn't been minted yet, so probing would
    // wrongly conclude "signed out" and bounce a valid login to /login (from
    // which the proxy sends it straight back — an endless loop).
    if (status !== 'unauthenticated') return;

    let cancelled = false;
    const probe = async () => {
      let hasJwt = false;
      try {
        const { getSessionAction } = await import('@/actions/auth');
        const jwt = (await getSessionAction()) as { userId?: string } | null;
        hasJwt = Boolean(jwt?.userId);
      } catch {
        hasJwt = false;
      }
      if (!cancelled && !hasJwt) setSessionGone(true);
    };

    void probe();
    // Re-probe while we sit in the "cookie is valid but the store is still
    // empty" limbo, so a session that expires on an open tab is caught too.
    const timer = setInterval(probe, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hydrated, isSignedOut, isSigningOut, status]);

  useEffect(() => {
    if (!sessionGone || leavingRef.current) return;
    leavingRef.current = true;
    const next = pathname ? `?next=${encodeURIComponent(pathname)}` : '';
    router.replace(`/login${next}`);
  }, [sessionGone, pathname, router]);

  // Don't redirect to login if user is on auth onboarding page
  if (isAuthOnboardingPage) {
    return <>{children}</>;
  }

  // Show Shield HR loader while:
  // 1. Stores haven't hydrated from localStorage yet
  // 2. OAuth session is active (Google login) but user data hasn't been synced from Convex yet
  // 3. A sign-out is in flight — the store is already empty but the browser
  //    hasn't left the page, and the shell must not repaint as a visitor
  // 4. There is no user at all: either the session is being restored from the
  //    JWT cookie, or it is gone and the effect above is redirecting to /login.
  //    Either way the dashboard shell (and its public "Sign In / Get Started"
  //    navbar) must stay unmounted.
  const isOAuthSyncing = status === 'authenticated' && !user;
  if (!hydrated || isOAuthSyncing || isSigningOut || isSignedOut) {
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
        {/* NavBadgesProvider — the single set of Convex badge subscriptions
            shared by the navbar, both sidebars, the mobile dock and the
            notification banner (previously ~20 duplicated subscriptions). */}
        <NavBadgesProvider>
          {/* `app-shell` (see globals.css) is the real height: 100dvh minus the
            safe-area insets. `h-dvh` is only a safety net — Tailwind utilities
            live in `@layer utilities`, so the unlayered `.app-shell` rule always
            wins over it. If that rule ever fails to reach the browser (stale CSS
            chunk after an HMR update, blocked stylesheet), the shell still gets a
            definite height instead of collapsing to `auto`, which turns the
            document into the scroller and drags the sidebar out of the viewport. */}
          <div className="flex app-shell h-dvh bg-(--background) overflow-hidden">
            {/* Ambient background — drifting colour orbs behind all content (z-0) */}
            <DashboardAmbient />

            {/* Desktop Sidebar */}
            <Sidebar />

            {/* Mobile Sidebar */}
            <MobileSidebar />

            {/* Main content — overflow-clip prevents content bleed without creating containing block */}
            <div className="flex-1 flex flex-col min-w-0 overflow-clip">
              {/* Navbar */}
              <Navbar />
              {/* Impersonation banner — always visible while acting as a user */}
              {user && <ImpersonationBanner />}
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
                  isFullscreenPage
                    ? 'flex-1 overflow-y-auto overflow-x-hidden min-h-0 app-main'
                    : isChatPage || isAIChatPage
                      ? 'flex-1 overflow-hidden flex flex-col min-h-0 app-main'
                      : 'flex-1 overflow-y-auto overflow-x-hidden min-h-0 main-scrollable app-main'
                }
              >
                <PlanRouteGate>
                  {isChatDisabled ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                      <MessageSquareOff className="h-10 w-10 text-(--text-muted)" />
                      <h2 className="text-lg font-semibold text-(--text-primary)">
                        {t('chat.disabled.title')}
                      </h2>
                      <p className="max-w-sm text-sm text-(--text-muted)">
                        {t('chat.disabled.description')}
                      </p>
                    </div>
                  ) : isFullscreenPage ? (
                    <div className="flex flex-col flex-1 min-h-0 h-full p-0">
                      <div className="flex flex-col flex-1 min-h-0 h-full mx-auto w-full">
                        {children}
                      </div>
                    </div>
                  ) : isChatPage ? (
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
                    <div className="px-6 pb-mobile-dock !pt-0 mx-auto max-w-7xl w-full">
                      <MobilePageTransition>{children}</MobilePageTransition>
                    </div>
                  )}
                </PlanRouteGate>
              </main>
            </div>
            {/* AI Chat Widget — hidden on /chat page so it doesn't cover the send
              button, and everywhere when the ai.assistant toggle is off. */}
            {!isChatPage && isFeatureEnabled('ai.assistant') && <ChatWidget />}

            {/* Tool Dock — floating "Your tools" trigger on every dashboard page;
              it hides on scroll down and returns on scroll up. */}
            {user && <ToolDock />}

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

            {/* Global upgrade modal — plan-gate errors surface here */}
            {hydrated && user && <UpgradeModal />}

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
        </NavBadgesProvider>
      </ReactQueryProvider>
    </ErrorBoundary>
  );
}
