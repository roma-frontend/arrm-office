'use client';

/**
 * Lobby / waiting-room registration form. External visitors land here when
 * the host turned the waiting room on. The form fields and their `required`
 * flags are read straight from the meeting row so the host can reconfigure
 * them without code changes.
 *
 * Submission pushes a row into `meetingRegistrations`; the host sees it in
 * the in-call pending panel and can admit (sends back a one-time invite URL)
 * or deny. The visitor stays on this page and is told to wait.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Video, ArrowLeft, Loader2, CheckCircle2, Clock } from 'lucide-react';
import { motion } from '@/lib/cssMotion';
import { cn } from '@/lib/utils';

type FieldName = 'fullName' | 'email' | 'phone';
type FieldConfig = { name: FieldName; required: boolean };

export function LobbyForm({
  roomName,
  title,
  hostName,
  fields,
  waitingRoomEnabled,
  onRegistered,
  onCancel,
}: {
  roomName: string;
  title: string;
  hostName: string;
  fields: FieldConfig[];
  /** If `true`, the user waits in the lobby even after submitting. If
   * `false`, the form is a one-shot and the caller should advance to the
   * pre-join screen on submit. */
  waitingRoomEnabled: boolean;
  /** Fired after a successful submit when there is no waiting room. */
  onRegistered?: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const submit = useMutation(api.meetings.submitRegistration);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable per-tab id used to dedupe refreshes server-side.
  const visitorId = useCallback(() => {
    if (typeof window === 'undefined') return undefined;
    const key = `lobby_vid_${roomName}`;
    let id = window.sessionStorage.getItem(key);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(key, id);
    }
    return id;
  }, [roomName]);

  const want = (name: FieldName) => fields.some((f) => f.name === name);
  const isRequired = (name: FieldName) => fields.some((f) => f.name === name && f.required);

  const validate = (): string | null => {
    if (want('fullName') && isRequired('fullName') && !fullName.trim()) {
      return t('meetings.fieldRequired', { field: t('meetings.fieldFullName') });
    }
    if (want('email') && isRequired('email') && !email.trim()) {
      return t('meetings.fieldRequired', { field: t('meetings.fieldEmail') });
    }
    if (want('email') && email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      return t('meetings.fieldInvalid', { field: t('meetings.fieldEmail') });
    }
    if (want('phone') && isRequired('phone') && !phone.trim()) {
      return t('meetings.fieldRequired', { field: t('meetings.fieldPhone') });
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    try {
      await submit({
        roomName,
        fullName,
        email: want('email') ? email : undefined,
        phone: want('phone') ? phone : undefined,
        visitorId: visitorId(),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <div className="prejoin-screen relative flex min-h-screen flex-col bg-(--canvas) p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(800px_320px_at_50%_-10%,var(--brand-quiet),transparent)]" />
        <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 items-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="w-full rounded-3xl border border-(--border-default) bg-(--surface-1) p-7 text-center shadow-xl shadow-black/5"
          >
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10">
              <CheckCircle2 className="h-7 w-7 text-emerald-500" />
            </div>
            <h1 className="text-lg font-semibold text-(--text-1)">
              {waitingRoomEnabled
                ? t('meetings.lobbySubmittedTitle')
                : t('meetings.lobbyRegisteredTitle', { defaultValue: 'You are registered' })}
            </h1>
            <p className="mt-2 text-sm text-(--text-3)">
              {waitingRoomEnabled
                ? t('meetings.lobbySubmittedDesc', { host: hostName || t('meetings.theHost') })
                : t('meetings.lobbyRegisteredDesc', {
                    defaultValue:
                      'Thanks for registering. You can now join the meeting — see you inside.',
                  })}
            </p>
            {waitingRoomEnabled ? (
              <>
                <div className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-(--border-default) bg-(--surface-2)/50 px-3 py-2.5 text-xs text-(--text-3)">
                  <Clock className="h-3.5 w-3.5" />
                  {t('meetings.lobbyWaitHint')}
                </div>
                <Button className="mt-5 w-full" variant="outline" onClick={onCancel}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('meetings.backToDashboard')}
                </Button>
              </>
            ) : (
              <Button className="btn-gradient mt-5 w-full" onClick={() => onRegistered?.()}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {t('meetings.lobbyContinue', { defaultValue: 'Join the meeting' })}
              </Button>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="prejoin-screen relative flex min-h-screen flex-col bg-(--canvas) p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(800px_320px_at_50%_-10%,var(--brand-quiet),transparent)]" />
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative z-10 mb-6 flex items-center gap-3"
      >
        <button
          type="button"
          onClick={onCancel}
          className="flex size-9 items-center justify-center rounded-xl text-(--text-3) transition hover:bg-(--surface-2) hover:text-(--text-1)"
          title={t('common.back', 'Back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--brand-quiet)">
            <Video className="h-4 w-4 text-(--brand)" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--text-3)">
              {waitingRoomEnabled
                ? t('meetings.waitingRoom')
                : t('meetings.registration', { defaultValue: 'Registration' })}
            </p>
            <p className="truncate text-[11px] text-(--text-4)">
              {waitingRoomEnabled
                ? t('meetings.lobbyWaitHintShort', {
                    defaultValue: "You'll be admitted by the host",
                  })
                : t('meetings.lobbyRegisterHint')}
            </p>
          </div>
        </div>
      </motion.div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 items-center">
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' }}
          className="w-full rounded-3xl border border-(--border-default) bg-(--surface-1) p-7 shadow-xl shadow-black/5"
        >
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-(--brand-quiet)">
            <ShieldCheck className="h-6 w-6 text-(--brand)" />
          </div>
          <h1 className="text-center text-lg font-semibold text-(--text-1)">{title}</h1>
          <p className="mt-1.5 text-center text-sm text-(--text-3)">
            {t('meetings.lobbyGreeting', { host: hostName || t('meetings.theHost') })}
          </p>

          <div className="mt-6 space-y-4">
            {want('fullName') && (
              <Field
                label={t('meetings.fieldFullName')}
                required={isRequired('fullName')}
                value={fullName}
                onChange={setFullName}
                placeholder={t('meetings.fieldFullNamePlaceholder')}
                autoComplete="name"
                type="text"
              />
            )}
            {want('email') && (
              <Field
                label={t('meetings.fieldEmail')}
                required={isRequired('email')}
                value={email}
                onChange={setEmail}
                placeholder={t('meetings.fieldEmailPlaceholder')}
                autoComplete="email"
                type="email"
              />
            )}
            {want('phone') && (
              <Field
                label={t('meetings.fieldPhone')}
                required={isRequired('phone')}
                value={phone}
                onChange={setPhone}
                placeholder={t('meetings.fieldPhonePlaceholder')}
                autoComplete="tel"
                type="tel"
              />
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-(--danger-outline) bg-(--danger-quiet) px-3 py-2.5 text-xs text-(--danger-text)">
              {error}
            </div>
          )}

          <Button type="submit" disabled={busy} className="btn-gradient mt-6 w-full">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {t('meetings.lobbySubmit')}
          </Button>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-(--text-4)">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t('meetings.secureNote')}
          </p>
        </motion.form>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  value,
  onChange,
  placeholder,
  autoComplete,
  type,
}: {
  label: string;
  required: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
  type: string;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-(--text-3)">
        {label}
        {required && <span className="text-(--danger-text)">*</span>}
      </label>
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl bg-(--sunken) px-3 py-2.5 ring-1 ring-(--border-default) transition focus-within:ring-(--brand)',
        )}
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={120}
          autoComplete={autoComplete}
          type={type}
          className="w-full bg-transparent text-sm text-(--text-1) outline-none placeholder:text-(--text-4)"
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
