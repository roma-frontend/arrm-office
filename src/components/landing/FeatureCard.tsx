'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
  accentColor: string;
  delay?: number;
  badge?: string;
  href?: string;
}

export default function FeatureCard({
  icon,
  title,
  description,
  gradient,
  accentColor,
  delay = 0,
  badge,
  href = '/features/leave-types',
}: FeatureCardProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '-40px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  return (
    <div
      ref={ref}
      className="relative group cursor-default card-reveal"
      style={{
        perspective: '1000px',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) rotateX(0deg)' : 'translateY(50px) rotateX(8deg)',
        transition: `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.7s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Mouse-follow glow */}
      {isHovered && (
        <div
          className="absolute inset-0 rounded-3xl pointer-events-none -z-10 transition-opacity duration-300"
          style={{
            background: `radial-gradient(600px circle at ${mousePos.x}px ${mousePos.y}px, ${accentColor}15, transparent 40%)`,
            filter: 'blur(40px)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Outer glow on hover */}
      <div
        className="absolute inset-0 rounded-3xl blur-2xl -z-20 transition-opacity duration-500"
        style={{
          background: gradient,
          opacity: isHovered ? 1 : 0,
        }}
        aria-hidden="true"
      />

      {/* Glass card */}
      <div
        className="relative rounded-[2rem] border backdrop-blur-2xl overflow-hidden h-full"
        style={{
          borderColor: isHovered ? `${accentColor}40` : 'var(--landing-card-border)',
          backgroundColor: 'var(--landing-card-bg)',
          transform: isHovered ? 'translateY(-4px) scale(1.01)' : 'translateY(0) scale(1)',
          boxShadow: isHovered
            ? `0 8px 32px ${accentColor}18, inset 0 1px 0 rgba(255,255,255,0.1)`
            : '0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.05)',
          transition:
            'transform 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s cubic-bezier(0.22,1,0.36,1), border-color 0.4s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Top shimmer border */}
        <div
          className="absolute top-0 left-0 right-0 h-px transition-opacity duration-500"
          style={{
            background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
            opacity: isHovered ? 0.8 : 0.3,
          }}
          aria-hidden="true"
        />

        {/* Gradient mesh on hover */}
        <div
          className="absolute inset-0 transition-opacity duration-700"
          style={{
            background: gradient,
            opacity: isHovered ? 1 : 0,
          }}
          aria-hidden="true"
        />

        {/* Content */}
        <div className="relative p-7 flex flex-col gap-4 h-full">
          {/* Badge — CSS pulse */}
          {badge && (
            <span
              className="self-start text-xs font-semibold px-3 py-1 rounded-full border badge-pulse"
              style={{
                borderColor: `${accentColor}40`,
                backgroundColor: `${accentColor}15`,
                color: accentColor,
              }}
            >
              {badge}
            </span>
          )}

          {/* Icon container — smooth wiggle on hover */}
          <div
            className="flex items-center justify-center w-14 h-14 rounded-2xl transition-transform duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{
              background: `${accentColor}20`,
              border: `1px solid ${accentColor}30`,
              transform: isHovered ? 'scale(1.1) rotate(3deg)' : 'scale(1) rotate(0deg)',
            }}
          >
            <div style={{ color: accentColor }}>{icon}</div>
          </div>

          {/* Text */}
          <div>
            <h3
              className="text-xl font-bold mb-2 transition-colors"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {title}
            </h3>
            <p
              className="text-sm leading-relaxed transition-colors"
              style={{ color: 'var(--landing-text-secondary)' }}
            >
              {description}
            </p>
          </div>

          {/* Hover arrow — CSS slide-in */}
          <Link
            href={href}
            className="mt-auto flex items-center gap-2 text-sm font-medium transition-all duration-300"
            style={{ color: accentColor }}
          >
            <span>{t('landing.learnMore')}</span>
            <span className="arrow-bounce">→</span>
          </Link>
        </div>

        {/* Corner glow decoration */}
        <div
          className="absolute -bottom-8 -right-8 w-32 h-32 rounded-full blur-2xl transition-opacity duration-700"
          style={{
            background: accentColor,
            opacity: isHovered ? 0.2 : 0.06,
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
