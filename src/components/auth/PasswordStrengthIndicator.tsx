'use client';

import { motion, AnimatePresence } from '@/lib/cssMotion';
import { Check, Sparkles } from 'lucide-react';
import {
  validatePassword,
  getStrengthColor,
  type PasswordValidationResult,
} from '@/lib/passwordValidation';
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
  // i18next's TFunction has many overloads; wrap it in a narrow adapter
  // matching `Translator = (key, defaultValue?) => string` from passwordValidation.
  const translate = (key: string, defaultValue?: string): string =>
    String(t(key, defaultValue ?? key));
  // Pass `translate` so requirements/feedback/suggestions come back already localized.
  const validation = validatePassword(password, translate);

  if (!password) return null;

  const strengthColor = getStrengthColor(validation.strength);
  const strengthLabels: Record<PasswordValidationResult['strength'], string> = {
    weak: t('auth.passwordValidation.strength.weak', 'Слабый'),
    fair: t('auth.passwordValidation.strength.fair', 'Средний'),
    good: t('auth.passwordValidation.strength.good', 'Хороший'),
    strong: t('auth.passwordValidation.strength.strong', 'Надежный'),
    excellent: t('auth.passwordValidation.strength.excellent', 'Превосходный'),
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
          <span className="text-(--text-muted)">
            {t('auth.passwordValidation.label', 'Надежность пароля')}
          </span>
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
        <div className="h-2 bg-(--background-subtle) rounded-full overflow-hidden">
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
                ? 'bg-(--success-quiet) text-(--success-text) dark:text-(--success-text)'
                : item.type === 'error'
                  ? 'bg-(--danger-quiet) text-(--danger-text) dark:text-(--danger-text)'
                  : item.type === 'warning'
                    ? 'bg-(--warning-quiet) text-(--warning-text) dark:text-(--warning-text)'
                    : 'bg-(--brand-quiet) text-(--brand-text) dark:text-(--brand-text)'
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
                    ? 'text-(--success-text) dark:text-(--success-text)'
                    : req.required
                      ? 'text-(--text-muted)'
                      : 'text-(--text-muted) opacity-60'
                }`}
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: req.met ? 1 : 0.8 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                >
                  {req.met ? (
                    <Check className="w-4 h-4 text-(--success-text)" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-current opacity-30" />
                  )}
                </motion.div>
                <span
                  className={`${req.required ? 'font-medium' : ''} flex items-center gap-1 whitespace-nowrap`}
                >
                  {req.label}
                  {req.required && <span className="text-(--danger-text)">*</span>}
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
          className="space-y-2 pt-2 border-t border-(--border)"
        >
          <div className="flex items-center gap-1.5 text-xs text-(--text-muted)">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="font-medium">
              {t('auth.passwordValidation.recommendations', 'Рекомендации:')}
            </span>
          </div>
          <ul className="space-y-1">
            {validation.suggestions.map((suggestion, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="text-xs text-(--text-muted) flex items-start gap-2"
              >
                <span className="text-(--brand-text) mt-0.5">•</span>
                <span>{suggestion}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      )}
    </motion.div>
  );
}
