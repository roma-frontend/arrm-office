'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import HeroCTA from './HeroCTA';

/* ── Inline SVG icons (landing bundle avoids extra lucide weight) ────────── */

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

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/* ── Reveal on scroll ─────────────────────────────────────────────────────── */

function useReveal() {
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
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

/* ── Final section: conversion panel + video-style newsletter ─────────────── */

const TRUST_KEYS = ['landing.noCreditCard', 'landing.freeToStart', 'landing.gdprReady'] as const;

const NEWSLETTER_BULLETS = ['trends', 'updates', 'noSpam'] as const;

export default function FinalCtaSection({ initialLanguage = 'en' }: { initialLanguage?: string }) {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const { ref, visible } = useReveal();
  const inputId = 'newsletter-email';
  const errorId = 'newsletter-email-error';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setHasError(true);
      toast.error(t('newsletter.invalidEmail'));
      return;
    }
    setHasError(false);
    setIsLoading(true);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          language: (i18n.language || 'en').slice(0, 3),
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        alreadySubscribed?: boolean;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Subscribe failed');
      }
      setIsSubmitted(true);
      toast.success(
        data.alreadySubscribed
          ? t('newsletter.alreadySubscribed', { defaultValue: 'You are already subscribed!' })
          : t('newsletter.successMessage'),
      );
      setEmail('');
    } catch {
      toast.error(t('newsletter.errorMessage', 'Something went wrong'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section
      className="relative py-14 md:py-20 px-6 md:px-12 overflow-hidden"
      aria-label="Get started"
    >
      {/* Ambient orbs — slow drift behind the panel */}
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

      <div className="section-fade relative max-w-5xl mx-auto">
        {/* ── Main conversion panel ─────────────────────────────────────── */}
        <div
          ref={ref}
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(40px) scale(0.97)',
            transition:
              'opacity 0.8s cubic-bezier(0.22,1,0.36,1), transform 0.8s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <div className="gradient-border-animated relative px-6 md:px-10 py-14 md:py-16 text-center flex flex-col items-center">
            {/* Inner background to cover the gradient border */}
            <div
              className="absolute inset-0 rounded-[1.5rem]"
              style={{
                backgroundColor: 'var(--landing-card-bg)',
                border: '1px solid var(--landing-card-border)',
              }}
            />

            {/* Icon — CSS float */}
            <div className="animate-float relative inline-flex mb-8">
              <SparklesIcon />
            </div>

            {/* Headline */}
            <h2
              className="relative text-3xl md:text-5xl font-black mb-4 leading-tight tracking-tighter"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {t('landingExtra.ctaTitle')}{' '}
              <span style={{ color: 'var(--primary)' }}>{t('landingExtra.ctaTitleHighlight')}</span>
            </h2>

            {/* Trust chips — remove friction right above the action */}
            <div className="relative flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mb-8">
              {TRUST_KEYS.map((key) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1.5 text-sm"
                  style={{ color: 'var(--landing-text-muted)' }}
                >
                  <span style={{ color: 'var(--primary)' }}>
                    <CheckIcon />
                  </span>
                  {t(key)}
                </span>
              ))}
            </div>

            {/* CTA buttons — auth-aware (dashboard when logged in) */}
            <div className="relative flex flex-col sm:flex-row justify-center gap-4">
              <HeroCTA initialLanguage={initialLanguage} />
            </div>
          </div>
        </div>

        {/* ── Newsletter — full video-style section, same language as the rest ── */}
        <div
          className="gradient-border-animated relative mt-10 rounded-[1.5rem] overflow-hidden"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(24px)',
            transition:
              'opacity 0.8s cubic-bezier(0.22,1,0.36,1) 0.15s, transform 0.8s cubic-bezier(0.22,1,0.36,1) 0.15s',
          }}
        >
          {/* Inner surface — covers the gradient border so only the edge shows */}
          <div className="absolute inset-0" style={{ backgroundColor: 'var(--landing-card-bg)' }} />

          {/* Ambient orbs inside the panel — slow drift, low opacity */}
          <div
            className="absolute -top-20 -right-10 w-72 h-72 rounded-full pointer-events-none orb-pulse-1"
            style={{
              background: 'radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)',
              filter: 'blur(50px)',
            }}
          />
          <div
            className="absolute -bottom-16 -left-10 w-64 h-64 rounded-full pointer-events-none orb-pulse-2"
            style={{
              background: 'radial-gradient(circle, rgba(139,92,246,0.14) 0%, transparent 70%)',
              filter: 'blur(50px)',
            }}
          />

          <div className="relative grid md:grid-cols-2 gap-10 items-center px-6 md:px-12 py-12 md:py-14">
            {/* Left — pitch + reassurance */}
            <div
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(-24px)',
                transition:
                  'opacity 0.8s cubic-bezier(0.22,1,0.36,1) 0.2s, transform 0.8s cubic-bezier(0.22,1,0.36,1) 0.2s',
              }}
            >
              <div className="relative inline-flex mb-6">
                {/* Floating mail icon with pulse ring */}
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center animate-float"
                  style={{
                    background: 'linear-gradient(135deg, #2563eb, #93c5fd)',
                    color: '#fff',
                    boxShadow: '0 12px 32px -8px rgba(37,99,235,0.5)',
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m22 7-10 5L2 7" />
                  </svg>
                </div>
                <span
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{
                    border: '2px solid rgba(37,99,235,0.4)',
                    animation: 'pulse-ring 2.4s cubic-bezier(0.22,1,0.36,1) infinite',
                  }}
                />
              </div>

              <h3
                className="text-2xl md:text-3xl font-black mb-3 leading-tight tracking-tighter"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {t('newsletter.title')}{' '}
                <span style={{ color: 'var(--primary)' }}>{t('newsletter.titleHighlight')}</span>
              </h3>
              <p
                className="text-md mb-6 leading-relaxed"
                style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}
              >
                {t('newsletter.subtitle')}
              </p>

              {/* What you actually get — bullet reassurance */}
              <ul className="space-y-2.5 mb-6">
                {NEWSLETTER_BULLETS.map((key) => (
                  <li
                    key={key}
                    className="flex items-center gap-2.5 text-sm"
                    style={{ color: 'var(--landing-text-secondary)' }}
                  >
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: 'rgba(37,99,235,0.12)',
                        color: 'var(--primary)',
                      }}
                    >
                      <CheckIcon />
                    </span>
                    {t(`newsletter.bullets.${key}`)}
                  </li>
                ))}
              </ul>

              <p
                className="text-xs flex items-center gap-1.5"
                style={{ color: 'var(--landing-text-muted)' }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                {t('newsletter.privacyNote')}
              </p>
            </div>

            {/* Right — the form in its own glass card */}
            <div
              className="rounded-2xl p-6 md:p-8"
              style={{
                background: 'rgb(var(--brand-600-ch) / 5%)',
                border: '1px solid var(--landing-card-border)',
                boxShadow: '0 24px 48px -16px rgba(12, 26, 46, 0.18)',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(24px)',
                transition:
                  'opacity 0.8s cubic-bezier(0.22,1,0.36,1) 0.3s, transform 0.8s cubic-bezier(0.22,1,0.36,1) 0.3s',
              }}
            >
              {!isSubmitted ? (
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  <label
                    htmlFor={inputId}
                    className="text-sm font-semibold"
                    style={{ color: 'var(--landing-text-primary)' }}
                  >
                    {t('newsletter.emailLabel')}
                  </label>
                  <input
                    id={inputId}
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setHasError(false);
                    }}
                    placeholder={t('newsletter.emailPlaceholder')}
                    className="w-full px-4 py-3.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-(--brand-text) transition-all"
                    style={{
                      backgroundColor: 'var(--input)',
                      borderColor: hasError ? '#ef4444' : 'var(--input-border)',
                      color: 'var(--landing-text-primary)',
                      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
                    }}
                    disabled={isLoading}
                    aria-label={t('ariaLabels.emailAddress')}
                    aria-invalid={hasError ? 'true' : 'false'}
                    aria-describedby={hasError ? errorId : undefined}
                  />
                  {hasError && (
                    <span id={errorId} className="text-xs text-(--danger-text)" role="alert">
                      {t('newsletter.invalidEmail')}
                    </span>
                  )}
                  <Button
                    type="submit"
                    variant="cta"
                    size="lg"
                    className="gap-2 h-12 w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ShieldLoader size="xs" variant="inline" />
                    ) : (
                      <>
                        <span>{t('newsletter.subscribe')}</span>
                        <ArrowRight size={16} />
                      </>
                    )}
                  </Button>
                </form>
              ) : (
                <div
                  className="flex flex-col items-center gap-3 py-8 success-reveal text-center"
                  style={{ color: 'var(--primary)' }}
                >
                  <span
                    className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{
                      background: 'rgba(16,185,129,0.12)',
                      color: '#10b981',
                      boxShadow: '0 0 0 6px rgba(16,185,129,0.08)',
                    }}
                  >
                    <CheckCircle2 size={30} />
                  </span>
                  <span className="font-bold text-lg">{t('newsletter.subscribed')}</span>
                </div>
              )}

              {/* Telegram alternative */}
              <div
                className="flex items-center justify-center gap-2 mt-5 pt-5"
                style={{ borderTop: '1px solid var(--landing-card-border)' }}
              >
                <span className="text-xs" style={{ color: 'var(--landing-text-secondary)' }}>
                  {t('newsletter.orTelegram')}
                </span>
                <a
                  href="https://t.me/hremailbot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-[1.04] bg-(--brand-quiet) text-(--brand-text) hover:bg-(--brand-quiet-hover)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                  Telegram
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
