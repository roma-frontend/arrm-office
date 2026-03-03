"use client";

import { motion } from 'framer-motion';
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
  className = "", 
  size = 'xl',
  variant = 'default'
}: ShieldLoaderProps) {
  const config = sizeConfig[size];
  
  // Inline variant - just the spinning shield
  if (variant === 'inline') {
    return (
      <motion.div 
        className={`inline-flex items-center justify-center ${className}`}
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      >
        <div className="relative flex items-center justify-center">
          <Shield size={config.shield} style={{ color: 'var(--loader-color)' }} strokeWidth={1.5} />
          <span className={`absolute font-bold ${config.text}`} style={{ color: 'var(--loader-color)' }}>HR</span>
        </div>
      </motion.div>
    );
  }

  // Default variant - full loader with dots
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <motion.div 
        className={`flex flex-col items-center ${size === 'xs' || size === 'sm' ? 'gap-2' : 'gap-6'}`}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Shield with HR text */}
        <div className="relative flex items-center justify-center">
          <Shield size={config.shield} style={{ color: 'var(--loader-color)' }} strokeWidth={1.5} />
          <span className={`absolute font-bold ${config.text}`} style={{ color: 'var(--loader-color)' }}>HR</span>
        </div>
        
        {/* Loading dots */}
        <div className={`flex ${config.gap}`}>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className={`${config.dot} rounded-full`}
              style={{ backgroundColor: 'var(--loader-color)' }}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </div>
        
        {/* Optional message */}
        {message && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm text-[var(--text-muted)] mt-2"
          >
            {message}
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}
