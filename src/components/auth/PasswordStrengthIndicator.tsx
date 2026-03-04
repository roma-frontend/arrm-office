"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertCircle, Info, Sparkles } from 'lucide-react';
import { validatePassword, getStrengthColor, type PasswordValidationResult } from '@/lib/passwordValidation';
import { useTranslation } from 'react-i18next';

interface PasswordStrengthIndicatorProps {
  password: string;
  showRequirements?: boolean;
  showSuggestions?: boolean;
}

export function PasswordStrengthIndicator({
  password,
  showRequirements = true,
  showSuggestions = true,
}: PasswordStrengthIndicatorProps) {
  const { t } = useTranslation();
  const validation = validatePassword(password);

  if (!password) return null;

  const strengthColor = getStrengthColor(validation.strength);
  const strengthLabels = {
    weak: 'Слабый',
    fair: 'Средний',
    good: 'Хороший',
    strong: 'Надежный',
    excellent: 'Превосходный',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-3"
    >
      {/* Strength Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--text-muted)]">Надежность пароля</span>
          <motion.span
            key={validation.strength}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="font-semibold"
            style={{ color: strengthColor }}
          >
            {strengthLabels[validation.strength]}
          </motion.span>
        </div>
        
        {/* Animated progress bar */}
        <div className="h-2 bg-[var(--background-subtle)] rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full transition-all duration-500"
            initial={{ width: 0 }}
            animate={{ width: `${validation.score}%` }}
            style={{ backgroundColor: strengthColor }}
          />
        </div>
      </div>

      {/* Feedback messages */}
      <AnimatePresence mode="popLayout">
        {validation.feedback.map((item, index) => (
          <motion.div
            key={`feedback-${index}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ delay: index * 0.05 }}
            className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
              item.type === 'success'
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : item.type === 'error'
                ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                : item.type === 'warning'
                ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
            }`}
          >
            <span className="text-base leading-none mt-0.5">{item.icon}</span>
            <p className="flex-1 leading-relaxed">{item.message}</p>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Requirements checklist */}
      {showRequirements && (
        <div className="space-y-1.5">
          <AnimatePresence>
            {validation.requirements.map((req, index) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                className={`flex items-center gap-2 text-xs transition-all duration-200 ${
                  req.met
                    ? 'text-green-600 dark:text-green-400'
                    : req.required
                    ? 'text-[var(--text-muted)]'
                    : 'text-[var(--text-muted)] opacity-60'
                }`}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: req.met ? 1 : 0.8 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                >
                  {req.met ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-current opacity-30" />
                  )}
                </motion.div>
                <span className={`${req.required ? 'font-medium' : ''} flex items-center gap-1 whitespace-nowrap`}>
                  {req.label}
                  {req.required && <span className="text-red-500">*</span>}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Smart suggestions */}
      {showSuggestions && validation.suggestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2 pt-2 border-t border-[var(--border)]"
        >
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="font-medium">Рекомендации:</span>
          </div>
          <ul className="space-y-1">
            {validation.suggestions.map((suggestion, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="text-xs text-[var(--text-muted)] flex items-start gap-2"
              >
                <span className="text-blue-500 mt-0.5">•</span>
                <span>{suggestion}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      )}
    </motion.div>
  );
}
