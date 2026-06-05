'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from '@/lib/cssMotion';
import {
  CheckCircle,
  AlertCircle,
  Info,
  XCircle,
  Lightbulb,
  ArrowRight,
  X,
  Sparkles,
} from 'lucide-react';

export type BannerType = 'success' | 'warning' | 'info' | 'error' | 'purple';

export interface SmartBannerProps {
  type: BannerType;
  message: string;
  suggestion?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissable?: boolean;
  autoDismiss?: number; // ms — auto-hide after this duration
  onDismiss?: () => void;
  className?: string;
  icon?: React.ReactNode; // custom icon override
}

const colorClasses: Record<BannerType, string> = {
  success:
    'bg-emerald-100 border-emerald-400 text-emerald-950 dark:bg-emerald-500/10 dark:border-emerald-500/20 dark:text-emerald-300',
  warning:
    'bg-amber-100 border-amber-400 text-slate-900 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-300',
  info: 'bg-blue-100 border-blue-400 text-blue-950 dark:bg-blue-500/10 dark:border-blue-500/20 dark:text-blue-300',
  error:
    'bg-red-100 border-red-400 text-red-950 dark:bg-red-500/10 dark:border-red-500/20 dark:text-red-300',
  purple:
    'bg-violet-100 border-violet-400 text-violet-950 dark:bg-violet-500/10 dark:border-violet-500/20 dark:text-violet-300',
};

const iconColors: Record<BannerType, string> = {
  success: 'text-emerald-800 dark:text-emerald-300',
  warning: 'text-amber-800 dark:text-amber-300',
  info: 'text-blue-800 dark:text-blue-300',
  error: 'text-red-800 dark:text-red-300',
  purple: 'text-violet-800 dark:text-violet-300',
};

const messageColors: Record<BannerType, string> = {
  success: 'text-emerald-950 dark:text-emerald-200',
  warning: 'text-slate-900 dark:text-amber-200',
  info: 'text-blue-950 dark:text-blue-200',
  error: 'text-red-950 dark:text-red-200',
  purple: 'text-violet-950 dark:text-violet-200',
};

const suggestionColors: Record<BannerType, string> = {
  success: 'text-emerald-900 dark:text-emerald-300',
  warning: 'text-slate-800 dark:text-amber-300',
  info: 'text-blue-900 dark:text-blue-300',
  error: 'text-red-900 dark:text-red-300',
  purple: 'text-violet-900 dark:text-violet-300',
};

const actionColors: Record<BannerType, string> = {
  success:
    'text-emerald-900 hover:text-emerald-950 dark:text-emerald-300 dark:hover:text-emerald-200',
  warning: 'text-amber-900 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-200',
  info: 'text-blue-900 hover:text-blue-950 dark:text-blue-300 dark:hover:text-blue-200',
  error: 'text-red-900 hover:text-red-950 dark:text-red-300 dark:hover:text-red-200',
  purple: 'text-violet-900 hover:text-violet-950 dark:text-violet-300 dark:hover:text-violet-200',
};

const defaultIcons: Record<BannerType, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle,
  warning: AlertCircle,
  info: Info,
  error: XCircle,
  purple: Sparkles,
};

export function SmartBanner({
  type,
  message,
  suggestion,
  action,
  dismissable = true,
  autoDismiss,
  onDismiss,
  className = '',
  icon,
}: SmartBannerProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (autoDismiss && autoDismiss > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
        onDismiss?.();
      }, autoDismiss);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoDismiss, onDismiss]);

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  const Icon = defaultIcons[type];

  return (
    <AnimatePresence mode="wait">
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className={`relative overflow-hidden border p-4 ${colorClasses[type]} ${className}`}
        >
          {/* Animated background gradient */}
          <motion.div
            className="absolute inset-0 opacity-0 dark:opacity-30"
            animate={{
              background: [
                'radial-gradient(circle at 0% 0%, currentColor 0%, transparent 50%)',
                'radial-gradient(circle at 100% 100%, currentColor 0%, transparent 50%)',
                'radial-gradient(circle at 0% 0%, currentColor 0%, transparent 50%)',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          />

          {/* Dismiss button */}
          {dismissable && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors z-10"
            >
              <X className="w-3.5 h-3.5" />
            </motion.button>
          )}

          <div className="relative flex gap-3">
            {/* Animated icon */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              className="shrink-0"
            >
              {icon || <Icon className={`w-5 h-5 ${iconColors[type]}`} />}
            </motion.div>

            <div className="flex-1 space-y-2 pr-4">
              {/* Main message */}
              <motion.p
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 }}
                className={`text-sm font-semibold leading-relaxed ${messageColors[type]}`}
              >
                {message}
              </motion.p>

              {/* Suggestion */}
              {suggestion && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className={`flex items-start gap-2 text-xs opacity-100 ${suggestionColors[type]}`}
                >
                  <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{suggestion}</p>
                </motion.div>
              )}

              {/* Action button */}
              {action && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  onClick={action.onClick}
                  className={`flex items-center gap-1.5 text-xs font-semibold underline underline-offset-2 hover:no-underline transition-all group ${actionColors[type]}`}
                >
                  {action.label}
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </motion.button>
              )}
            </div>
          </div>

          {/* Auto-dismiss progress bar */}
          {autoDismiss && autoDismiss > 0 && (
            <motion.div
              className="absolute bottom-0 left-0 h-0.5 bg-current opacity-30"
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: autoDismiss / 1000, ease: 'linear' }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
