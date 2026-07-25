'use client';

import dynamic from 'next/dynamic';
import LandingExtras from './LandingExtras';
import StrategyCascadeSection from './StrategyCascadeSection';

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

const NewsletterSection = dynamic(() => import('./NewsletterSection'), {
  loading: () => (
    <div
      className="h-64 animate-pulse rounded-3xl"
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

const SocialProof = dynamic(() => import('./SocialProof'), {
  loading: () => (
    <div className="h-32 animate-pulse" style={{ backgroundColor: 'var(--landing-card-bg)' }} />
  ),
  ssr: true,
});

// StatsSection uses i18n — SSR causes hydration mismatch, render client-side only
const StatsSection = dynamic(() => import('./StatsSection'), {
  loading: () => (
    <div
      className="h-48 animate-pulse rounded-3xl"
      style={{ backgroundColor: 'var(--landing-card-bg)' }}
    />
  ),
  ssr: false,
});

// FeaturesSection, CTABanner, Footer use i18n — SSR causes hydration mismatch
const FeaturesSection = dynamic(() => import('./FeaturesSection'), {
  loading: () => (
    <div
      className="h-96 animate-pulse rounded-3xl"
      style={{ backgroundColor: 'var(--landing-card-bg)' }}
    />
  ),
  ssr: false,
});

const CTABanner = dynamic(() => import('./CTABanner'), {
  loading: () => (
    <div
      className="h-64 animate-pulse rounded-3xl"
      style={{ backgroundColor: 'var(--landing-card-bg)' }}
    />
  ),
  ssr: false,
});

const Footer = dynamic(() => import('./Footer'), {
  loading: () => (
    <div className="h-48 animate-pulse" style={{ backgroundColor: 'var(--landing-card-bg)' }} />
  ),
  ssr: false,
});

export default function LandingBelowFold() {
  return (
    <>
      {/* Page content */}
      <main className="relative">
        <div className="section-lazy">
          <SocialProof />
        </div>
        <div className="section-lazy">
          <StatsSection />
        </div>
        <div className="section-lazy">
          <StrategyCascadeSection />
        </div>
        <div className="section-lazy">
          <FeaturesSection />
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
          <NewsletterSection />
        </div>
        <div className="section-lazy">
          <CTABanner />
        </div>
      </main>

      <Footer />
      <LandingExtras />
    </>
  );
}
