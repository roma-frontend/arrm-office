'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, Minus } from 'lucide-react';
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

function FAQItem({ faq, delay }: { faq: FAQ; delay: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const { ref, visible } = useReveal();
  const { t } = useTranslation();

  return (
    <div
      ref={ref}
      className="border-b last:border-0"
      style={{
        borderColor: 'var(--landing-card-border)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: `opacity 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-start justify-between gap-4 py-5 text-left group hover:opacity-80 transition-opacity"
        aria-expanded={isOpen}
        aria-controls={`faq-answer-${faq.id}`}
      >
        <span
          className="font-semibold text-lg pr-4 transition-colors hover:text-(--primary)"
          style={{ color: 'var(--landing-text-primary)' }}
        >
          {t(faq.questionKey)}
        </span>
        {/* CSS rotate instead of motion.div */}
        <div
          className="shrink-0 w-8 h-8 rounded-lg transition-colors flex items-center justify-center mt-1"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.3s cubic-bezier(0.22,1,0.36,1), background-color 0.3s',
            backgroundColor: 'var(--landing-card-bg)',
          }}
        >
          {isOpen ? (
            <Minus size={16} style={{ color: 'var(--primary)' }} />
          ) : (
            <Plus size={16} style={{ color: 'var(--primary)' }} />
          )}
        </div>
      </button>

      {/* CSS height transition — replaces AnimatePresence */}
      <div
        id={`faq-answer-${faq.id}`}
        className="overflow-hidden"
        style={{
          maxHeight: isOpen ? '400px' : '0px',
          opacity: isOpen ? 1 : 0,
          transition: 'max-height 0.35s cubic-bezier(0.22,1,0.36,1), opacity 0.3s ease',
        }}
      >
        <p
          className="leading-relaxed pb-5 pr-12"
          style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}
        >
          {t(faq.answerKey)}
        </p>
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
    <section id="faq" className="relative z-10 px-6 md:px-12 py-12 md:py-20">
      <div className="max-w-4xl mx-auto">
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

        {/* FAQ list */}
        <div
          className="relative rounded-2xl border backdrop-blur-xl p-6 md:p-8"
          style={{
            borderColor: 'var(--landing-card-border)',
            backgroundColor: 'var(--landing-card-bg)',
          }}
        >
          {faqs.map((faq, i) => (
            <FAQItem key={faq.id} faq={faq} delay={i * 0.08} />
          ))}
        </div>

        {/* Still have questions */}
        <div className="text-center mt-10">
          <p className="mb-4" style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}>
            {t('faq.stillHaveQuestions')}
          </p>
          <a
            href="mailto:support@strata.work"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border transition-all font-medium hover:bg-[var(--card-hover)] hover:text-(--primary)"
            style={{
              backgroundColor: 'var(--landing-card-bg)',
              borderColor: 'var(--landing-card-border)',
              color: 'var(--landing-text-primary)',
            }}
            aria-label="Contact support via email"
          >
            {t('faq.contactSupport')}
          </a>
        </div>
      </div>
    </section>
  );
}
