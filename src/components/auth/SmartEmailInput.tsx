"use client";

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Check, AlertCircle, Sparkles } from 'lucide-react';
import { validateEmail, type EmailValidationResult } from '@/lib/passwordValidation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SmartEmailInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}

export function SmartEmailInput({
  value,
  onChange,
  label = 'Email',
  placeholder = 'your@email.com',
  required = true,
  autoFocus = false,
}: SmartEmailInputProps) {
  const [validation, setValidation] = useState<EmailValidationResult | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);

  useEffect(() => {
    if (!value) {
      setValidation(null);
      setShowSuggestion(false);
      return;
    }

    // Debounce validation
    const timer = setTimeout(() => {
      const result = validateEmail(value);
      setValidation(result);
      setShowSuggestion(!!result.suggestion);
    }, 300);

    return () => clearTimeout(timer);
  }, [value]);

  const handleSuggestionClick = () => {
    if (validation?.suggestion) {
      onChange(validation.suggestion);
      setShowSuggestion(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="email" className="flex items-center gap-1 whitespace-nowrap text-sm font-medium text-[var(--text-primary)]">
        {label}
        {required && <span className="text-red-500">*</span>}
      </Label>

      <div className="relative">
        {/* Email icon */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <Mail className="w-4 h-4 text-[var(--text-muted)]" />
        </div>

        {/* Input field */}
        <Input
          id="email"
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`pl-10 pr-10 transition-all duration-200 ${
            validation?.isValid
              ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
              : validation && !validation.isValid && value
              ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
              : ''
          }`}
        />

        {/* Status icon */}
        <AnimatePresence mode="wait">
          {validation && value && (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 180 }}
              transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              {validation.isValid ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-500" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Validation feedback */}
      <AnimatePresence mode="wait">
        {validation?.feedback && value && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`flex items-start gap-2 text-xs p-2 rounded-lg ${
              validation.feedback.type === 'success'
                ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                : validation.feedback.type === 'error'
                ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                : validation.feedback.type === 'warning'
                ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
            }`}
          >
            <p className="flex-1 leading-relaxed">{validation.feedback.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Smart suggestion */}
      <AnimatePresence>
        {showSuggestion && validation?.suggestion && (
          <motion.button
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            onClick={handleSuggestionClick}
            className="w-full flex items-center gap-2 p-3 rounded-xl border border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 transition-all group"
          >
            <Sparkles className="w-4 h-4 flex-shrink-0 group-hover:rotate-12 transition-transform" />
            <div className="flex-1 text-left">
              <p className="text-xs font-medium">Использовать предложение?</p>
              <p className="text-sm font-semibold mt-0.5">{validation.suggestion}</p>
            </div>
            <Check className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
