'use client';

import dynamic from 'next/dynamic';
import LandingExtras from './LandingExtras';
import StrategyCascadeSection from './StrategyCascadeSection';
import ScrollStorySection from './ScrollStorySection';

// Meet AI — live chat demo. SSR'd for crawlers; the chat window itself only
// renders after mount (the seeded copy is client-localized).
const MeetAISection = dynamic(() => import('./MeetAISection'), {
  loading: () => (
    <div
      className="h-96 animate-pulse rounded-3xl"
      style={{ backgroundColor: 'var(--landing-card-bg)' }}
    />
  ),
  ssr: true,
});

// Trust band — logo marquee + security strip, after the stats.
const TrustBandSection = dynamic(() => import('./TrustBandSection'), {
  loading: () => (
    <div
      className="h-72 animate-pulse rounded-3xl"
      style={{ backgroundColor: 'var(--landing-card-bg)' }}
    />
  ),
  ssr: true,
});

// Below-fold sections - lazy loaded for performance with SSR
const TestimonialsSection = dynamic(() => import('./TestimonialsSection'), {
  loading: () => (
    <div
      className="h-96 animate-pulse rounded-3xl"
      style={{ backgroundColor: 'var(--landing-card-bg)' }}
    />
  ),
  ssr: true,
});

const FAQSection = dynamic(() => import('./FAQSection'), {
  loading: () => (
    <div
      className="h-96 animate-pulse rounded-3xl"
      style={{ backgroundColor: 'var(--landing-card-bg)' }}
    />
  ),
  ssr: true,
});

const PricingPreview = dynamic(() => import('./PricingPreview'), {
  loading: () => (
    <div
      className="h-96 animate-pulse rounded-3xl"
      style={{ backgroundColor: 'var(--landing-card-bg)' }}
    />
  ),
  ssr: false, // Uses Convex useQuery hook — can't SSR before ConvexProvider activates
});

// One unified live-stats band: the social-proof metrics and the platform
// numbers merged into a single dashboard-style panel (count-up, bars, ticker).
const LiveStatsSection = dynamic(() => import('./LiveStatsSection'), {
  loading: () => (
    <div
      className="h-64 animate-pulse rounded-3xl"
      style={{ backgroundColor: 'var(--landing-card-bg)' }}
    />
  ),
  ssr: true,
});

const FeaturesSection = dynamic(() => import('./FeaturesSection'), {
  loading: () => (
    <div
      className="h-96 animate-pulse rounded-3xl"
      style={{ backgroundColor: 'var(--landing-card-bg)' }}
    />
  ),
  ssr: true,
});

const PersonasSection = dynamic(() => import('./PersonasSection'), {
  loading: () => (
    <div
      className="h-96 animate-pulse rounded-3xl"
      style={{ backgroundColor: 'var(--landing-card-bg)' }}
    />
  ),
  ssr: true,
});

// The last section before the footer: the CTA banner and the newsletter form
// merged into one video-styled panel (see FinalCtaSection).
const FinalCtaSection = dynamic(() => import('./FinalCtaSection'), {
  loading: () => (
    <div
      className="h-72 animate-pulse rounded-3xl"
      style={{ backgroundColor: 'var(--landing-card-bg)' }}
    />
  ),
  ssr: true,
});

const Footer = dynamic(() => import('./Footer'), {
  loading: () => (
    <div className="h-48 animate-pulse" style={{ backgroundColor: 'var(--landing-card-bg)' }} />
  ),
  ssr: true,
});

export default function LandingBelowFold({ initialLanguage = 'en' }: { initialLanguage?: string }) {
  return (
    <>
      {/* Page content */}
      <main className="relative">
        {/* Meet AI — the intelligence layer, right after the hero (BambooHR's
            "Meet Bamboo AI™" position). */}
        <div className="section-lazy">
          <MeetAISection initialLanguage={initialLanguage} />
        </div>
        <div className="section-lazy">
          <LiveStatsSection initialLanguage={initialLanguage} />
        </div>
        {/* Trust band — customer logos + security strip. */}
        <div className="section-lazy">
          <TrustBandSection initialLanguage={initialLanguage} />
        </div>
        {/* Scroll storytelling — pinned phone with 4 scenes (check-in → cascade → AI → analytics).
            NOT lazy: `content-visibility: auto` would break the sticky pinning. */}
        <div className="story-not-lazy">
          <ScrollStorySection initialLanguage={initialLanguage} />
        </div>
        <div className="section-lazy">
          <StrategyCascadeSection initialLanguage={initialLanguage} />
        </div>
        <div className="section-lazy">
          <FeaturesSection initialLanguage={initialLanguage} />
        </div>
        <div className="section-lazy">
          <PersonasSection initialLanguage={initialLanguage} />
        </div>
        <div className="section-lazy">
          <PricingPreview />
        </div>
        <section id="testimonials" className="section-lazy">
          <TestimonialsSection initialLanguage={initialLanguage} />
        </section>
        <div className="section-lazy">
          <FAQSection />
        </div>
        <div className="section-lazy">
          <FinalCtaSection initialLanguage={initialLanguage} />
        </div>
      </main>

      <Footer initialLanguage={initialLanguage} />
      <LandingExtras />
    </>
  );
}
