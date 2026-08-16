'use client';

import dynamic from 'next/dynamic';
import { useLandingTextOverrides } from '@/hooks/useLandingTextOverrides';

// SSR the hero so the <h1> is in the initial HTML and is the LCP element
// immediately. The hero renders in the server-detected language (passed via
// `initialLanguage`) so there is no English→language flash: server and the
// first client render produce identical markup. (Previously `ssr: false` left
// an empty placeholder until hydration, pushing LCP to ~5.7s and making the
// cookie banner the LCP element.)
const HeroSection = dynamic(() => import('@/components/landing/HeroSection'), {
  loading: () => <div className="min-h-screen animate-pulse" />,
  ssr: true,
});

// Navbar stays client-only: it depends on theme + auth state (browser-only) and
// is not the LCP element, so SSR'ing it adds hydration complexity for no gain.
const NavbarWrapper = dynamic(() => import('@/components/landing/NavbarWrapper'), {
  loading: () => null,
  ssr: false,
});

// SSR the below-fold too: sections resolve translations synchronously via
// `getFixedT(initialLanguage)` (the landing namespaces are statically bundled),
// so the server HTML matches the first client render — no grey skeleton flash,
// no CLS, and crawlers see the full page content.
const LandingBelowFold = dynamic(() => import('@/components/landing/LandingBelowFold'), {
  loading: () => null,
  ssr: true,
});

export default function LandingPageClient({
  initialLanguage,
  initialOverrides,
  editorOverrides,
  embedded = false,
}: {
  initialLanguage: string;
  initialOverrides?: Record<string, string>;
  /** Landing-editor preview: merged draft+published map that wins over the live query. */
  editorOverrides?: Record<string, string>;
  /** Landing-editor canvas: navbar sticks inside the scroll frame instead of the viewport. */
  embedded?: boolean;
}) {
  // Published landing text overrides: matches SSR HTML on hydration and live-
  // updates open tabs when a superadmin publishes. The editor passes
  // `editorOverrides` instead so its canvas shows the working copy.
  useLandingTextOverrides(initialLanguage, initialOverrides, editorOverrides);

  return (
    <>
      <NavbarWrapper embedded={embedded} />
      <HeroSection initialLanguage={initialLanguage} />
      <LandingBelowFold initialLanguage={initialLanguage} />
    </>
  );
}
