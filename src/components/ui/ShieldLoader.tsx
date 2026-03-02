"use client";

import { motion } from 'framer-motion';
import { Shield } from 'lucide-react';

interface ShieldLoaderProps {
  message?: string;
  className?: string;
}

export function ShieldLoader({ message, className = "" }: ShieldLoaderProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <motion.div 
        className="flex flex-col items-center gap-6"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        {/* Shield with HR text */}
        <div className="relative flex items-center justify-center">
          <Shield size={120} className="text-blue-500" strokeWidth={1.5} />
          <span className="absolute text-blue-600 font-bold text-3xl">HR</span>
        </div>
        
        {/* Loading dots */}
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2.5 h-2.5 rounded-full bg-blue-500"
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
