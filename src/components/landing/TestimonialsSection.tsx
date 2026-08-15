'use client';

import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Star, Quote } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface Testimonial {
  id: number;
  gradient: string;
  rating: number;
}

/** A curated showcase testimonial (real org + quote, optional metric). */
interface ShowcaseTestimonial {
  id: string;
  company: string;
  quote: string;
  authorName?: string;
  authorRole?: string;
  metric?: string;
  metricLabel?: string;
  order: number;
}

function useReveal(margin = '-50px') {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: margin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [margin]);
  return { ref, visible };
}

function TestimonialCard({
  testimonial,
  delay,
  index,
  real,
}: {
  testimonial: Testimonial;
  delay: number;
  index: number;
  /** Curated showcase data; when present it wins over the i18n placeholder. */
  real?: ShowcaseTestimonial;
}) {
  const { t } = useTranslation();
  const { ref, visible } = useReveal('-50px');

  const testimonialKey = `testimonial${index + 1}`;
  const name = real?.authorName || t(`testimonials.${testimonialKey}.name`);
  const role = real?.authorRole || t(`testimonials.${testimonialKey}.role`);
  const company = real?.company || t(`testimonials.${testimonialKey}.company`);
  const text = real?.quote || t(`testimonials.${testimonialKey}.text`);
  const metric = real?.metric || t(`testimonials.${testimonialKey}.metric`, '');
  const metricLabel = real?.metricLabel || t(`testimonials.${testimonialKey}.metricLabel`, '');

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('');

  return (
    <div
      ref={ref}
      className="relative group"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(50px)',
        transition: `opacity 0.65s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.65s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      }}
    >
      {/* Glow on hover */}
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl -z-10"
        style={{ background: testimonial.gradient }}
        aria-hidden="true"
      />

      {/* Card — lifts on hover */}
      <div
        className="relative h-full rounded-2xl border backdrop-blur-xl p-6 flex flex-col gap-4"
        style={{
          borderColor: 'var(--landing-card-border)',
          backgroundColor: 'var(--landing-card-bg)',
        }}
      >
        <div className="flex items-start justify-between">
          <Quote size={32} style={{ color: 'var(--primary)', opacity: 0.4 }} />
          <div className="flex gap-1">
            {Array.from({ length: testimonial.rating }).map((_, i) => (
              <Star key={i} size={14} className="fill-yellow-400 text-(--warning-text)" />
            ))}
          </div>
        </div>
        <p
          className="leading-relaxed text-sm flex-1"
          style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
        >
          &ldquo;{text}&rdquo;
        </p>
        {/* Outcome metric — "Saved $70k / year" style proof (BambooHR pattern).
            Falls back to nothing when a locale has no metric for this card. */}
        {metric ? (
          <div
            className="flex items-baseline gap-2 rounded-xl px-3 py-2"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-default)' }}
          >
            <span className="text-lg font-bold leading-none" style={{ color: 'var(--primary)' }}>
              {metric}
            </span>
            {metricLabel ? (
              <span className="text-xs" style={{ color: 'var(--landing-text-secondary)' }}>
                {metricLabel}
              </span>
            ) : null}
          </div>
        ) : null}
        <div
          className="flex items-center gap-3 pt-4 border-t"
          style={{ borderColor: 'var(--landing-card-border)' }}
        >
          {/* No AvatarImage: these testimonials are placeholders with no real
              headshots, so every card renders the gradient-initials fallback.
              (A hardcoded `/testimonials/sarah.jpg` used to 404 here.) */}
          <Avatar className="w-10 h-10">
            <AvatarFallback
              className="text-xs text-white font-semibold"
              style={{
                background: 'linear-gradient(135deg, #2563eb, #93c5fd)',
              }}
            >
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--landing-text-primary)' }}>
              {name}
            </p>
            <p
              className="text-xs"
              style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}
            >
              {role}, {company}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="translate-x-px"
    >
      <path d="M6 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 6 4.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export default function TestimonialsSection({
  initialLanguage = 'en',
}: {
  initialLanguage?: string;
}) {
  const { t, i18n } = useTranslation();
  const { ref, visible } = useReveal('-30px');
  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // Real curated testimonials when a superadmin has set any up; i18n
  // placeholders fall back for fresh installs.
  const showcase = useQuery(api.landing.getShowcase, {
    lang: i18n?.language || initialLanguage || 'en',
  });
  const realTestimonials = showcase?.testimonials ?? [];

  // Drive the marquee's animation-play-state from React state so the Play/Pause
  // control below works in both browsers and reduced-motion mode (which disables
  // the CSS animation entirely — the control then simply shows "Play").
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.animationPlayState = paused ? 'paused' : 'running';
  }, [paused]);

  const testimonials: Testimonial[] = [
    {
      id: 1,
      rating: 5,
      gradient: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(165,180,252,0.08))',
    },
    {
      id: 2,
      rating: 5,
      gradient: 'linear-gradient(135deg, rgba(129,140,248,0.12), rgba(79,70,229,0.06))',
    },
    {
      id: 3,
      rating: 5,
      gradient: 'linear-gradient(135deg, rgba(148,163,184,0.12), rgba(148,163,184,0.06))',
    },
    {
      id: 4,
      rating: 5,
      gradient: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(52,211,153,0.08))',
    },
    {
      id: 5,
      rating: 5,
      gradient: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.08))',
    },
    {
      id: 6,
      rating: 5,
      gradient: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(248,113,113,0.06))',
    },
  ];

  // Real testimonials win when curated; otherwise the i18n placeholders.
  // Duplicate either list for the infinite marquee.
  const cards = realTestimonials.length > 0 ? realTestimonials : testimonials;
  const allTestimonials = [...cards, ...cards];

  return (
    <section className="relative z-10 px-6 md:px-12 py-12 md:py-20 overflow-hidden">
      {/* Section header — reveal on scroll */}
      <div
        ref={ref}
        className="text-center mb-16"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(30px)',
          transition:
            'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <span className="section-eyebrow">{t('testimonials.eyebrow')}</span>
        <h2
          className="mt-3 text-3xl md:text-5xl font-black leading-tight tracking-tighter"
          style={{ color: 'var(--landing-text-primary)' }}
        >
          {t('testimonials.headingStart')}{' '}
          <span className="heading-gradient">{t('testimonials.headingHighlight')}</span>
        </h2>
        <p
          className="mt-4 max-w-2xl mx-auto text-lg leading-normal md:leading-loose"
          style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
        >
          {t('testimonials.subtitle')}
        </p>
      </div>

      {/* Auto-scrolling carousel */}
      <div className="relative">
        {/* Fade edges */}
        <div
          className="absolute left-0 top-0 bottom-0 w-24 md:w-40 z-10 pointer-events-none"
          style={{
            background:
              'linear-gradient(to right, var(--landing-bg-start, transparent), transparent)',
          }}
        />
        <div
          className="absolute right-0 top-0 bottom-0 w-24 md:w-40 z-10 pointer-events-none"
          style={{
            background:
              'linear-gradient(to left, var(--landing-bg-start, transparent), transparent)',
          }}
        />

        <div ref={trackRef} className="carousel-track">
          {allTestimonials.map((testimonial, i) => {
            const fallbackIndex = i % testimonials.length;
            const placeholder = testimonials[fallbackIndex]!;
            const real = 'quote' in testimonial ? (testimonial as ShowcaseTestimonial) : undefined;
            return (
              <div
                key={`${real?.id ?? (testimonial as Testimonial).id}-${i}`}
                className="flex-shrink-0 w-[340px] md:w-[400px]"
              >
                <TestimonialCard
                  testimonial={placeholder}
                  delay={0}
                  index={fallbackIndex}
                  real={real}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Playback controls — pause/resume the scrolling wall of reviews */}
      <div className="mt-10 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={
            paused ? t('landing.storyTourPlay', 'Play') : t('landing.storyTourPause', 'Pause')
          }
          className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-bold transition-all duration-300 hover:scale-[1.03] active:scale-95"
          style={{
            border: `1px solid ${paused ? 'rgb(var(--green-500-ch) / 40%)' : 'var(--landing-card-border)'}`,
            background: paused ? 'rgb(var(--green-500-ch) / 10%)' : 'var(--landing-card-bg)',
            color: paused ? 'var(--success-text)' : 'var(--landing-text-primary)',
            boxShadow: paused ? '0 0 0 4px rgb(var(--green-500-ch) / 8%)' : 'none',
          }}
        >
          <span
            className="flex items-center justify-center w-6 h-6 rounded-full"
            style={{
              background: paused ? 'var(--success-solid)' : 'var(--primary)',
              color: '#fff',
            }}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
          </span>
          {paused ? t('landing.storyTourPlay', 'Play') : t('landing.storyTourPause', 'Pause')}
        </button>
        <span className="text-xs font-medium" style={{ color: 'var(--landing-text-muted)' }}>
          {t('testimonials.hoverToPause', 'Hover to pause')}
        </span>
      </div>
    </section>
  );
}
