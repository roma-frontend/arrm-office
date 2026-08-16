'use client';

import dynamic from 'next/dynamic';

// These components use window/document APIs, so they must be client-only
const ScrollToTop = dynamic(() => import('./ScrollToTop'), {
  ssr: false,
  loading: () => null,
});

// The CookieBanner used to live here too — it moved into LandingBelowFold so
// it renders in the SSR HTML and paints with the first render (LCP).
export default function LandingClientExtras() {
  return <ScrollToTop />;
}
