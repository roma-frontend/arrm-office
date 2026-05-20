'use client';

import { useTranslation } from 'react-i18next';
import HeroCTA from './HeroCTA';

function SparklesIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

export default function CTABanner() {
  const { t } = useTranslation();

  return (
    <section className="relative py-12 md:py-20" aria-label="Call to action">
      {/* Static CSS glows — no JS animation needed */}
      <div
        className="absolute -top-24 right-0 w-[600px] h-[600px] rounded-full pointer-events-none orb-pulse-1"
        style={{
          background: 'radial-gradient(circle, rgba(14,165,233,0.3) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute bottom-0 -left-20 w-[500px] h-[500px] rounded-full pointer-events-none orb-pulse-2"
        style={{
          background: 'radial-gradient(circle, rgba(37,99,235,0.2) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none orb-pulse-3"
        style={{
          background: 'radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />

      <div className="section-fade relative max-w-5xl mx-auto px-6 md:px-12">
        <div className="gradient-border-animated relative px-6 md:px-10 py-20 text-center flex flex-col items-center">
          {/* Inner background to cover the gradient border */}
          <div
            className="absolute inset-0 rounded-[1.5rem]"
            style={{
              backgroundColor: 'var(--landing-card-bg)',
              border: '1px solid var(--landing-card-border)',
            }}
          />

          {/* Icon — CSS float animation */}
          <div className="animate-float relative inline-flex mb-8">
            <SparklesIcon />
          </div>

          <h2
            className="relative text-3xl md:text-4xl md:text-6xl font-black mb-4 leading-tight tracking-tighter"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {t('landingExtra.ctaTitle')}{' '}
            <span style={{ color: 'var(--primary)' }}>{t('landingExtra.ctaTitleHighlight')}</span>
          </h2>

          <p
            className="relative text-md md:text-lg mb-12 max-w-xl mx-auto leading-loose"
            style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}
          >
            {t('landingExtra.ctaSubtitle')}
          </p>

          <div className="relative flex flex-col sm:flex-row justify-center gap-4">
            <HeroCTA />
          </div>

          {/* Social proof under CTA */}
          <div className="relative flex flex-col sm:flex-row items-center justify-center gap-6 mt-10">
            <div className="flex -space-x-3">
              {['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'].map((color, i) => (
                <div
                  key={i}
                  className="w-9 h-9 rounded-full border-2 flex items-center justify-center text-white text-xs font-bold"
                  style={{
                    backgroundColor: color,
                    borderColor: 'var(--landing-card-bg)',
                  }}
                >
                  {['A', 'M', 'S', 'R', 'K'][i]}
                </div>
              ))}
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--landing-text-muted)' }}>
              {t('landingExtra.socialProof', '500+ companies trust us')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
