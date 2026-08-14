'use client';

import dynamic from 'next/dynamic';
import LandingExtras from './LandingExtras';
import StrategyCascadeSection from './StrategyCascadeSection';
import ScrollStorySection from './ScrollStorySection';

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
        <div className="section-lazy">
          <LiveStatsSection initialLanguage={initialLanguage} />
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
          <TestimonialsSection />
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
