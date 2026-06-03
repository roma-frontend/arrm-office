'use client';

import dynamic from 'next/dynamic';

// SSR the hero so the <h1> is in the initial HTML and becomes the LCP element
// immediately (previously `ssr: false` left an empty pulsing div until hydration,
// pushing the LCP ~2.7s and making the cookie banner the LCP element instead).
const HeroSection = dynamic(() => import('@/components/landing/HeroSection'), {
  loading: () => (
    <div className="min-h-screen animate-pulse" style={{ background: 'var(--landing-bg)' }} />
  ),
  ssr: true,
});

// SSR the navbar too so it is part of the initial HTML instead of "flying in"
// from the top after hydration (which caused a visible layout shift / flash).
const NavbarWrapper = dynamic(() => import('@/components/landing/NavbarWrapper'), {
  loading: () => null,
  ssr: true,
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
