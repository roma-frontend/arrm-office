'use client';

import dynamic from 'next/dynamic';
import LazyMount from './LazyMount';
import LandingExtras from './LandingExtras';
import CookieBanner from '@/components/CookieBanner';

// Below-fold sections are wrapped in <LazyMount> (IntersectionObserver) with
// ssr:false: their chunks — which together carry most of the landing's JS,
// including the framer-motion runtime — are only fetched when the visitor
// approaches the section instead of in the initial load window. The FAQ and
// Footer stay SSR'd: their HTML is small and valuable for crawlers (visible
// FAQ content, footer links).

// Meet AI — live chat demo. Client-only: the chat window renders after mount.
const MeetAISection = dynamic(() => import('./MeetAISection'), { ssr: false });

// Trust band — logo marquee + security strip, after the stats.
const TrustBandSection = dynamic(() => import('./TrustBandSection'), { ssr: false });

// Below-fold sections - lazy loaded for performance with SSR
const TestimonialsSection = dynamic(() => import('./TestimonialsSection'), { ssr: false });

// Scroll storytelling — pinned phone with 4 scenes (check-in → cascade → AI →
// analytics). Mounted on approach (NOT via content-visibility, which would
// break the sticky pinning): the section mounts ~1200px before it becomes
// visible and sticky works normally from then on.
const ScrollStorySection = dynamic(() => import('./ScrollStorySection'), { ssr: false });

const StrategyCascadeSection = dynamic(() => import('./StrategyCascadeSection'), { ssr: false });

const LiveStatsSection = dynamic(() => import('./LiveStatsSection'), { ssr: false });

const FeaturesSection = dynamic(() => import('./FeaturesSection'), { ssr: false });

const PersonasSection = dynamic(() => import('./PersonasSection'), { ssr: false });

const PricingPreview = dynamic(() => import('./PricingPreview'), {
  ssr: false, // Uses Convex useQuery hook — can't SSR before ConvexProvider activates
});

const FinalCtaSection = dynamic(() => import('./FinalCtaSection'), { ssr: false });

// SSR'd for crawlers: the visible FAQ text pairs with FAQPageJsonLd.
const FAQSection = dynamic(() => import('./FAQSection'), { ssr: true });

// SSR'd for crawlers: footer links carry navigation/link equity.
const Footer = dynamic(() => import('./Footer'), { ssr: true });

export default function LandingBelowFold({ initialLanguage = 'en' }: { initialLanguage?: string }) {
  return (
    <>
      {/* Page content */}
      <main className="relative">
        {/* Meet AI — the intelligence layer, right after the hero (BambooHR's
            "Meet Bamboo AI™" position). */}
        <LazyMount minHeight={384}>
          <MeetAISection initialLanguage={initialLanguage} />
        </LazyMount>
        <LazyMount minHeight={256}>
          <LiveStatsSection initialLanguage={initialLanguage} />
        </LazyMount>
        {/* Trust band — customer logos + security strip. */}
        <LazyMount minHeight={288}>
          <TrustBandSection initialLanguage={initialLanguage} />
        </LazyMount>
        {/* Scroll storytelling — pinned phone with 4 scenes. */}
        <LazyMount minHeight={600}>
          <ScrollStorySection initialLanguage={initialLanguage} />
        </LazyMount>
        <LazyMount minHeight={384}>
          <StrategyCascadeSection initialLanguage={initialLanguage} />
        </LazyMount>
        <LazyMount minHeight={384}>
          <FeaturesSection initialLanguage={initialLanguage} />
        </LazyMount>
        <LazyMount minHeight={384}>
          <PersonasSection initialLanguage={initialLanguage} />
        </LazyMount>
        <LazyMount minHeight={384}>
          <PricingPreview />
        </LazyMount>
        <section id="testimonials">
          <LazyMount minHeight={384}>
            <TestimonialsSection initialLanguage={initialLanguage} />
          </LazyMount>
        </section>
        <FAQSection />
        <LazyMount minHeight={288}>
          <FinalCtaSection initialLanguage={initialLanguage} />
        </LazyMount>
      </main>

      <Footer initialLanguage={initialLanguage} />
      <LandingExtras />
      {/* Server-rendered so it paints with the page (LCP); consented visitors
          are hidden pre-paint via the inline head script + CSS. */}
      <CookieBanner initialLanguage={initialLanguage} />
    </>
  );
}
