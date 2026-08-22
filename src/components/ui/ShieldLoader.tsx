'use client';

import { Shield } from 'lucide-react';

interface ShieldLoaderProps {
  message?: string;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'inline';
}

const sizeConfig = {
  xs: { shield: 16, text: 'text-[8px]', dot: 'w-1 h-1', gap: 'gap-1' },
  sm: { shield: 24, text: 'text-xs', dot: 'w-1.5 h-1.5', gap: 'gap-1.5' },
  md: { shield: 48, text: 'text-lg', dot: 'w-2 h-2', gap: 'gap-2' },
  lg: { shield: 80, text: 'text-2xl', dot: 'w-2.5 h-2.5', gap: 'gap-2' },
  xl: { shield: 120, text: 'text-3xl', dot: 'w-2.5 h-2.5', gap: 'gap-2' },
};

export function ShieldLoader({
  message,
  className = '',
  size = 'xl',
  variant = 'default',
}: ShieldLoaderProps) {
  const config = sizeConfig[size];

  // Inline variant - just the spinning shield
  if (variant === 'inline') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        <div className="relative flex items-center justify-center animate-spin-slow">
          <Shield size={config.shield} style={{ color: 'var(--loader-color)' }} strokeWidth={1.5} />
          <span
            className={`absolute font-bold ${config.text}`}
            style={{ color: 'var(--loader-color)' }}
          >
            HR
          </span>
        </div>
      </div>
    );
  }

  // Default variant - full loader with dots
  return (
    <div className={`min-h-screen flex items-center justify-center ${className}`}>
      <div
        className={`flex flex-col items-center ${size === 'xs' || size === 'sm' ? 'gap-2' : 'gap-6'} animate-fade-in`}
      >
        {/* Shield with HR text */}
        <div className="relative flex items-center justify-center">
          <Shield size={config.shield} style={{ color: 'var(--loader-color)' }} strokeWidth={1.5} />
          <span
            className={`absolute font-bold ${config.text}`}
            style={{ color: 'var(--loader-color)' }}
          >
            HR
          </span>
        </div>

        {/* Loading dots */}
        <div className={`flex ${config.gap}`}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`${config.dot} rounded-full animate-pulse-dot`}
              style={{
                backgroundColor: 'var(--loader-color)',
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>

        {/* Optional message */}
        {message && (
          <p
            className="text-sm text-(--text-muted) mt-2 animate-fade-in"
            style={{ animationDelay: '0.3s' }}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
