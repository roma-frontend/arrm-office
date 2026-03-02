'use client';

import { useRef, useEffect, useState } from 'react';
import { useTranslation } from "react-i18next";
import { Star, Quote } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Testimonial {
  id: number; gradient: string; rating: number;
}

function useReveal(margin = '-50px') {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1, rootMargin: margin }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [margin]);
  return { ref, visible };
}

function TestimonialCard({ testimonial, delay, index }: { testimonial: Testimonial; delay: number; index: number }) {
  const { t } = useTranslation();
  const { ref, visible } = useReveal('-50px');
  
  const testimonialKey = `testimonial${index + 1}`;
  const name = t(`testimonials.${testimonialKey}.name`);
  const role = t(`testimonials.${testimonialKey}.role`);
  const company = t(`testimonials.${testimonialKey}.company`);
  const text = t(`testimonials.${testimonialKey}.text`);
  
  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('');

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
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl -z-10"
        style={{ background: testimonial.gradient }} aria-hidden="true" />

      {/* Card — lifts on hover */}
      <div className="relative h-full rounded-2xl border backdrop-blur-xl p-6 flex flex-col gap-4 group-hover:-translate-y-2 transition-transform duration-300"
        style={{ borderColor: 'var(--landing-card-border)', backgroundColor: 'var(--landing-card-bg)' }}>
        <div className="flex items-start justify-between">
          <Quote size={32} style={{ color: 'var(--primary)', opacity: 0.4 }} />
          <div className="flex gap-1">
            {Array.from({ length: testimonial.rating }).map((_, i) => (
              <Star key={i} size={14} className="fill-yellow-400 text-yellow-400" />
            ))}
          </div>
        </div>
        <p className="leading-relaxed text-sm flex-1" style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}>"{text}"</p>
        <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: 'var(--landing-card-border)' }}>
          <Avatar className="w-10 h-10">
            <AvatarFallback 
              className="text-xs text-white font-semibold"
              style={{
                background: "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark, var(--primary)) 100%)",
              }}
            >
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--landing-text-primary)' }}>{name}</p>
            <p className="text-xs" style={{ color: 'var(--landing-text-secondary)', opacity: 0.85 }}>{role} at {company}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TestimonialsSection() {
  const { t } = useTranslation();
  const { ref, visible } = useReveal('-30px');
  
  const testimonials: Testimonial[] = [
    { id: 1, rating: 5, gradient: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(165,180,252,0.08))' },
    { id: 2, rating: 5, gradient: 'linear-gradient(135deg, rgba(129,140,248,0.12), rgba(79,70,229,0.06))' },
    { id: 3, rating: 5, gradient: 'linear-gradient(135deg, rgba(148,163,184,0.12), rgba(148,163,184,0.06))' },
  ];
  
  return (
    <section className="relative z-10 px-6 md:px-12 py-20">
      {/* Section header — reveal on scroll */}
      <div ref={ref} className="text-center mb-16"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(30px)',
          transition: 'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        <span className="section-eyebrow">{t('testimonials.eyebrow')}</span>
        <h2 className="mt-3 text-3xl md:text-5xl font-black leading-tight" style={{ color: 'var(--landing-text-primary)' }}>
          {t('testimonials.headingStart')} <span className="heading-gradient">{t('testimonials.headingHighlight')}</span>
        </h2>
        <p className="mt-4 max-w-2xl mx-auto text-lg" style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}>
          {t('testimonials.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
        {testimonials.map((testimonial, i) => (
          <TestimonialCard key={testimonial.id} testimonial={testimonial} delay={i * 0.15} index={i} />
        ))}
      </div>
    </section>
  );
}
