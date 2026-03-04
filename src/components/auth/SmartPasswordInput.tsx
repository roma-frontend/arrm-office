"use client";

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Lock, Copy, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';
import { generateSecurePassword } from '@/lib/passwordValidation';

interface SmartPasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  showStrength?: boolean;
  showGenerator?: boolean;
  autoFocus?: boolean;
}

export function SmartPasswordInput({
  value,
  onChange,
  label = 'Пароль',
  placeholder = '••••••••',
  required = true,
  showStrength = true,
  showGenerator = false,
  autoFocus = false,
}: SmartPasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGeneratePassword = () => {
    const newPassword = generateSecurePassword();
    onChange(newPassword);
    setShowPassword(true);
    
    // Auto-copy to clipboard
    navigator.clipboard.writeText(newPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyPassword = async () => {
    if (value) {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="password" className="flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
          {label}
          {required && <span className="text-red-500">*</span>}
        </Label>

        {showGenerator && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleGeneratePassword}
            type="button"
            className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium group"
          >
            <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
            Сгенерировать
          </motion.button>
        )}
      </div>

      <div className="relative h-9">
        {/* Lock icon */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
          <Lock className="w-4 h-4 text-[var(--text-muted)]" />
        </div>

        {/* Input field */}
        <Input
          id="password"
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="pl-10 pr-20 w-full h-full"
        />

        {/* Action buttons */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 z-10">
          {/* Copy button */}
          <AnimatePresence mode="wait">
            {value && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleCopyPassword}
                type="button"
                className="p-1.5 rounded-md hover:bg-[var(--background-subtle)] transition-colors"
                title="Копировать пароль"
              >
                {copied ? (
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                  >
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                ) : (
                  <Copy className="w-4 h-4 text-[var(--text-muted)]" />
                )}
              </motion.button>
            )}
          </AnimatePresence>

          {/* Show/hide button */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowPassword(!showPassword)}
            type="button"
            className="p-1.5 rounded-md hover:bg-[var(--background-subtle)] transition-colors"
            title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
          >
            <AnimatePresence mode="wait">
              {showPassword ? (
                <motion.div
                  key="hide"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 180 }}
                >
                  <EyeOff className="w-4 h-4 text-[var(--text-muted)]" />
                </motion.div>
              ) : (
                <motion.div
                  key="show"
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, rotate: 180 }}
                >
                  <Eye className="w-4 h-4 text-[var(--text-muted)]" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </div>

      {/* Copied notification */}
      <AnimatePresence>
        {copied && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Пароль скопирован в буфер обмена!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Password strength indicator */}
      {showStrength && value && (
        <PasswordStrengthIndicator password={value} />
      )}
    </div>
  );
}
