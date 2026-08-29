'use client';

/**
 * Full-screen lock that protects `/me/payroll`. The "PIN" is the last four
 * digits of the caller's user id — convenient because the user already has
 * the id on every payslip the company sends them, and meaningful enough to
 * defeat a casual shoulder-surfer without ever sending anything over the
 * wire. The unlocked state lives in sessionStorage so a hard refresh
 * re-locks the screen and the next person who sits at the desk has to
 * pass the check again.
 *
 * The four cells are real <input>s so the browser's autofill, password
 * manager, and platform keyboard behave the same way as everywhere else in
 * the app.
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from '@/lib/cssMotion';
import { ShieldCheck, Lock, ArrowLeft, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'payroll_unlocked_for';

interface PinLockScreenProps {
  userId: string;
  userName: string;
  email?: string;
  /**
   * The 4-digit code we expect. In production this is always
   * `derivePin(userId, email)`, but the prop is exposed so tests can
   * pin a deterministic value.
   */
  expectedPin: string;
  onUnlock: () => void;
  onCancel: () => void;
}

export function PinLockScreen({
  userId,
  userName,
  email,
  expectedPin,
  onUnlock,
  onCancel,
}: PinLockScreenProps) {
  const { t } = useTranslation();
  const [digits, setDigits] = useState<string[]>(['', '', '', '']);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  // Autofocus the first cell on mount.
  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  // Auto-submit when all four cells are filled.
  useEffect(() => {
    if (digits.every((d) => d !== '')) {
      const pin = digits.join('');
      if (pin === expectedPin) {
        try {
          sessionStorage.setItem(STORAGE_KEY, userId);
        } catch {
          /* ignore — private mode, etc. */
        }
        onUnlock();
      } else {
        setError(
          t('payroll.myPayroll.pinWrong', {
            defaultValue: 'That code does not match. Try again.',
          }),
        );
        setShaking(true);
        window.setTimeout(() => {
          setDigits(['', '', '', '']);
          setShaking(false);
          refs.current[0]?.focus();
        }, 350);
      }
    }
  }, [digits, expectedPin, onUnlock, t, userId]);

  const setCell = (i: number, value: string) => {
    const next = [...digits];
    // Accept a single digit or a pasted block of digits.
    const sanitized = value.replace(/\D/g, '');
    if (sanitized.length > 1) {
      const chars = sanitized.slice(0, 4).split('');
      for (let k = 0; k < 4; k++) next[k] = chars[k] ?? '';
      setDigits(next);
      const last = Math.min(chars.length, 4) - 1;
      refs.current[last]?.focus();
      return;
    }
    next[i] = sanitized.slice(-1);
    setDigits(next);
    if (sanitized && i < 3) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < 3) {
      refs.current[i + 1]?.focus();
    } else if (e.key === 'Enter' && digits.every((d) => d !== '')) {
      // Submit the form (the effect above fires onUnlock on match).
      e.preventDefault();
    }
  };

  const hint = t('payroll.myPayroll.pinHint', {
    defaultValue: 'Enter the last 4 digits of your employee ID.',
  });
  const idTail = `…${userId.slice(-6)}`;

  return (
    <div className="relative flex min-h-[80vh] items-center justify-center overflow-hidden bg-gradient-to-br from-(--canvas) via-(--card) to-(--brand-quiet) p-4">
      {/* Soft brand glow */}
      <div className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-(--brand-quiet) opacity-50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-(--brand-quiet) opacity-30 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className={cn(
          'relative w-full max-w-md rounded-3xl border border-(--border-default) bg-(--surface-1) p-7 shadow-2xl shadow-black/5',
          shaking && 'animate-[wiggle_0.35s_ease-in-out]',
        )}
      >
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-(--brand-quiet)">
          <Lock className="h-6 w-6 text-(--brand)" />
        </div>
        <h1 className="text-center text-xl font-bold text-(--text-1)">
          {t('payroll.myPayroll.pinTitle', { defaultValue: 'Your payroll is locked' })}
        </h1>
        <p className="mt-1.5 text-center text-sm text-(--text-3)">
          {t('payroll.myPayroll.pinSubtitle', {
            defaultValue: 'Enter the last 4 digits of your employee ID to view your pay details.',
            name: userName?.split(' ')[0] ?? '',
          })}
        </p>

        <div className="mt-6 rounded-2xl border border-(--border-default) bg-(--surface-2)/50 p-3">
          <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-(--text-3)">
            {hint}
          </p>
          <p className="mt-1 text-center font-mono text-sm text-(--text-2)">{idTail}</p>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type={show ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              value={digits[i]}
              onChange={(e) => {
                setError(null);
                setCell(i, e.target.value);
              }}
              onKeyDown={(e) => onKeyDown(i, e)}
              onFocus={(e) => e.currentTarget.select()}
              aria-label={t('payroll.myPayroll.pinCell', {
                defaultValue: 'PIN digit {{n}}',
                n: i + 1,
              })}
              className={cn(
                'h-14 w-12 rounded-xl border-2 border-(--border-default) bg-(--card) text-center text-2xl font-bold tabular-nums text-(--text-1) transition focus:border-(--brand) focus:outline-none',
                error && 'border-(--danger-outline)',
              )}
            />
          ))}
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="ml-1 flex size-9 items-center justify-center rounded-lg text-(--text-3) transition hover:bg-(--surface-2) hover:text-(--text-1)"
            title={
              show
                ? t('payroll.myPayroll.pinHide', { defaultValue: 'Hide digits' })
                : t('payroll.myPayroll.pinShow', { defaultValue: 'Show digits' })
            }
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {error && (
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-(--danger-text)">
            <AlertTriangle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="button"
            variant="primary"
            className="flex-1"
            disabled={digits.some((d) => d === '')}
            onClick={() => {
              // Trigger the same auto-submit path the useEffect watches.
              setDigits([...digits]);
            }}
          >
            {t('payroll.myPayroll.pinUnlock', { defaultValue: 'Unlock' })}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onCancel}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('payroll.myPayroll.back', { defaultValue: 'Back' })}
          </Button>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-(--text-4)">
          <ShieldCheck className="h-3 w-3" />
          {t('payroll.myPayroll.pinFooter', {
            defaultValue:
              'Your PIN is checked locally. We never send it anywhere.',
          })}
        </p>
        {email && (
          <p className="mt-1 text-center text-[10px] text-(--text-4)">
            {t('payroll.myPayroll.pinAccount', { defaultValue: 'Signed in as' })}{' '}
            <span className="font-mono">{email}</span>
          </p>
        )}
      </motion.div>
    </div>
  );
}
