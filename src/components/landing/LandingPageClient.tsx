'use client';

import dynamic from 'next/dynamic';

// SSR the hero so the <h1> is in the initial HTML and is the LCP element
// immediately. The hero renders in the server-detected language (passed via
// `initialLanguage`) so there is no English→language flash: server and the
// first client render produce identical markup. (Previously `ssr: false` left
// an empty placeholder until hydration, pushing LCP to ~5.7s and making the
// cookie banner the LCP element.)
const HeroSection = dynamic(() => import('@/components/landing/HeroSection'), {
  loading: () => (
    <div className="min-h-screen animate-pulse" style={{ background: 'var(--landing-bg)' }} />
  ),
  ssr: true,
});

// Navbar stays client-only: it depends on theme + auth state (browser-only) and
// is not the LCP element, so SSR'ing it adds hydration complexity for no gain.
const NavbarWrapper = dynamic(() => import('@/components/landing/NavbarWrapper'), {
  loading: () => null,
  ssr: false,
});

const LandingBelowFold = dynamic(() => import('@/components/landing/LandingBelowFold'), {
  loading: () => null,
  ssr: false,
});

export default function LandingPageClient({ initialLanguage }: { initialLanguage: string }) {
  return (
    <>
      <NavbarWrapper />
      <HeroSection initialLanguage={initialLanguage} />
      <LandingBelowFold />
    </>
  );
}
