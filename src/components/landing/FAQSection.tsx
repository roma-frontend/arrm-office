'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface FAQ {
  id: number;
  questionKey: string;
  answerKey: string;
}

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
      { threshold: 0.08, rootMargin: '-30px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

/* ── Inline icons (no lucide on the landing bundle) ─────────────────────── */

function PlusIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function FAQItem({ faq, delay }: { faq: FAQ; delay: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const { ref, visible } = useReveal();
  const { t } = useTranslation();

  return (
    <div
      ref={ref}
      className="relative"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      }}
    >
      {/* Open-state glow */}
      <div
        className="absolute -inset-px rounded-2xl transition-opacity duration-500 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at top, rgb(var(--brand-600-ch) / 12%), transparent 70%)',
          opacity: isOpen ? 1 : 0,
        }}
        aria-hidden="true"
      />

      <div
        className={`relative rounded-2xl border backdrop-blur-xl overflow-hidden transition-all duration-300 ${
          isOpen ? 'shadow-lg' : ''
        }`}
        style={{
          borderColor: isOpen ? 'rgb(var(--brand-600-ch) / 30%)' : 'var(--landing-card-border)',
          backgroundColor: 'var(--landing-card-bg)',
          boxShadow: isOpen ? '0 16px 40px -16px rgb(var(--brand-600-ch) / 25%)' : 'none',
        }}
      >
        {/* Left accent hairline — grows when open */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] transition-transform duration-300 origin-top"
          style={{
            background: 'linear-gradient(180deg, var(--brand), var(--primary))',
            transform: isOpen ? 'scaleY(1)' : 'scaleY(0)',
          }}
          aria-hidden="true"
        />

        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center gap-4 px-5 sm:px-6 py-5 text-left group cursor-pointer"
          aria-expanded={isOpen}
          aria-controls={`faq-answer-${faq.id}`}
        >
          {/* Number badge */}
          <span
            className={`flex items-center justify-center w-9 h-9 rounded-xl shrink-0 transition-all duration-300 ${
              isOpen ? 'scale-105' : 'group-hover:scale-105'
            }`}
            style={{
              background: isOpen
                ? 'linear-gradient(135deg, var(--brand), var(--primary))'
                : 'rgb(var(--brand-600-ch) / 10%)',
              border: `1px solid ${isOpen ? 'transparent' : 'rgb(var(--brand-600-ch) / 20%)'}`,
              color: isOpen ? '#ffffff' : 'var(--primary)',
            }}
          >
            <span className="num text-xs font-bold">{String(faq.id).padStart(2, '0')}</span>
          </span>

          <span
            className="font-semibold text-base sm:text-lg flex-1 pr-2 transition-colors group-hover:text-(--primary)"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {t(faq.questionKey)}
          </span>

          {/* Toggle chip — rotates + fills when open */}
          <span
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
            style={{
              background: isOpen
                ? 'linear-gradient(135deg, var(--brand), var(--primary))'
                : 'var(--muted)',
              color: isOpen ? '#ffffff' : 'var(--primary)',
              // 135° turns the + into ×, without swapping icons mid-animation.
              transform: isOpen ? 'rotate(135deg)' : 'rotate(0deg)',
              boxShadow: isOpen ? '0 4px 12px rgb(var(--brand-600-ch) / 35%)' : 'none',
            }}
          >
            <PlusIcon />
          </span>
        </button>

        {/* Answer — height + opacity transition */}
        <div
          id={`faq-answer-${faq.id}`}
          className="overflow-hidden"
          style={{
            maxHeight: isOpen ? '400px' : '0px',
            opacity: isOpen ? 1 : 0,
            transition: 'max-height 0.4s cubic-bezier(0.22,1,0.36,1), opacity 0.35s ease',
          }}
        >
          <p
            className="leading-relaxed pb-5 px-5 sm:px-6 pl-[76px]"
            style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}
          >
            {t(faq.answerKey)}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FAQSection() {
  const { ref, visible } = useReveal();
  const { t } = useTranslation();

  const faqs: FAQ[] = [
    { id: 1, questionKey: 'faq.q1', answerKey: 'faq.a1' },
    { id: 2, questionKey: 'faq.q2', answerKey: 'faq.a2' },
    { id: 3, questionKey: 'faq.q3', answerKey: 'faq.a3' },
    { id: 4, questionKey: 'faq.q4', answerKey: 'faq.a4' },
    { id: 5, questionKey: 'faq.q5', answerKey: 'faq.a5' },
    { id: 6, questionKey: 'faq.q6', answerKey: 'faq.a6' },
  ];

  return (
    <section id="faq" className="relative z-10 px-6 md:px-12 py-12 md:py-20 overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -top-32 right-0 w-[480px] h-[480px] rounded-full"
          style={{
            background: 'radial-gradient(circle, var(--landing-orb-2) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      <div className="max-w-4xl mx-auto relative">
        {/* Section header — reveal on scroll */}
        <div
          ref={ref}
          className="text-center my-12"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(30px)',
            transition:
              'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          <span className="section-eyebrow">{t('faq.title')}</span>
          <h2
            className="mt-3 text-3xl md:text-5xl font-black leading-tight"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {t('faq.subtitle')}{' '}
            <span className="heading-gradient">{t('faq.subtitleHighlight')}</span>
          </h2>
          <p
            className="mt-4 max-w-2xl mx-auto text-lg"
            style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
          >
            {t('faq.description')}
          </p>
        </div>

        {/* FAQ list — glass cards, one per question */}
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <FAQItem key={faq.id} faq={faq} delay={i * 0.08} />
          ))}
        </div>

        {/* Still have questions */}
        <div className="relative text-center mt-12">
          <div
            className="rounded-2xl border backdrop-blur-xl px-6 py-8"
            style={{
              borderColor: 'var(--landing-card-border)',
              background: 'linear-gradient(135deg, rgb(var(--brand-600-ch) / 6%), transparent 70%)',
            }}
          >
            <p className="mb-5" style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}>
              {t('faq.stillHaveQuestions')}
            </p>
            <a
              href="mailto:support@strata.work"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border transition-all duration-300 font-medium hover:scale-[1.02] active:scale-[0.98] hover:border-(--primary)/40"
              style={{
                backgroundColor: 'var(--landing-card-bg)',
                borderColor: 'var(--landing-card-border)',
                color: 'var(--landing-text-primary)',
                boxShadow: '0 8px 24px -12px rgb(var(--brand-600-ch) / 30%)',
              }}
              aria-label="Contact support via email"
            >
              <span style={{ color: 'var(--primary)' }}>
                <MailIcon />
              </span>
              {t('faq.contactSupport')}
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
