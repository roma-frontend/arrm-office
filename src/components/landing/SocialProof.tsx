'use client';

import { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Inline SVG icons to eliminate lucide-react import
function UsersIcon({ size = 24, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function AwardIcon({ size = 24, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}
function TrendingUpIcon({ size = 24, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}
function GlobeIcon({ size = 24, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

const metricKeys = [
  { icon: UsersIcon, value: '10,000+', labelKey: 'socialProof.activeUsers', color: '#2563eb' },
  { icon: AwardIcon, value: '4.9/5', labelKey: 'socialProof.customerRating', color: '#60a5fa' },
  { icon: TrendingUpIcon, value: '99.9%', labelKey: 'socialProof.uptime', color: '#60a5fa' },
  { icon: GlobeIcon, value: '50+', labelKey: 'socialProof.countries', color: '#2563eb' },
];

function MetricItem({
  icon: Icon,
  value,
  labelKey,
  color,
  delay,
}: (typeof metricKeys)[0] & { delay: number }) {
  const { t } = useTranslation();
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

  return (
    <div
      ref={ref}
      className="flex flex-col items-center text-center gap-3"
      role="group"
      aria-label={`${value} ${t(labelKey)}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.88)',
        transition: `opacity 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: `${color}20` }}
        aria-hidden="true"
      >
        <Icon size={24} style={{ color }} />
      </div>
      <div>
        <div
          className="text-2xl md:text-3xl font-bold mb-1"
          style={{ color: 'var(--landing-text-primary)' }}
        >
          {value}
        </div>
        <div className="text-sm" style={{ color: 'var(--landing-text-muted)', opacity: 1 }}>
          {t(labelKey)}
        </div>
      </div>
    </div>
  );
}

export default function SocialProof() {
  return (
    <section
      className="relative z-10 py-12 border-y"
      style={{ borderColor: 'var(--landing-card-border)' }}
      aria-label="Platform metrics"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {metricKeys.map((m, i) => (
            <MetricItem key={m.labelKey} {...m} delay={i * 0.1} />
          ))}
        </div>
      </div>
    </section>
  );
}
