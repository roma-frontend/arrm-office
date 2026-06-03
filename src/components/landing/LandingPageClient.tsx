'use client';

import dynamic from 'next/dynamic';

// Render the hero client-side only. SSR was tried for LCP but it forced a
// server render in English + logged-out state, then the client re-rendered with
// the user's real language/auth -> a visible double-render flash. Client-only
// shows a stable placeholder, then the final content paints once (no flash).
const HeroSection = dynamic(() => import('@/components/landing/HeroSection'), {
  loading: () => (
    <div className="min-h-screen animate-pulse" style={{ background: 'var(--landing-bg)' }} />
  ),
  ssr: false,
});

// Client-only for the same reason: SSR rendered a logged-out / English navbar
// that flashed and switched after hydration.
const NavbarWrapper = dynamic(() => import('@/components/landing/NavbarWrapper'), {
  loading: () => null,
  ssr: false,
});

const LandingBelowFold = dynamic(() => import('@/components/landing/LandingBelowFold'), {
  loading: () => null,
  ssr: false,
});

export default function LandingPageClient() {
  return (
    <>
      <NavbarWrapper />
      <HeroSection />
      <LandingBelowFold />
    </>
  );
}
