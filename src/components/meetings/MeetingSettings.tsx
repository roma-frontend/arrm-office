'use client';

/**
 * Host-only meeting settings — small form embedded in the in-call settings
 * popover. Two independent toggles:
 *
 *   - **Waiting room** — external visitors are held in a lobby until the
 *     host explicitly admits them. No form is shown.
 *   - **Registration** — external visitors fill out a form (fullName/email/
 *     phone) before entering. Their responses are saved to
 *     `meetingRegistrations` so the host can see who attended.
 *
 * Either, both, or neither can be on. Changes write through
 * `meetings.updateLobbyAndRegistration` and apply to the next visitor
 * immediately (in-flight lobby users are not affected).
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, ClipboardList, User, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

type FieldName = 'fullName' | 'phone' | 'email';
type FieldConfig = { name: FieldName; required: boolean };

const DEFAULTS: FieldConfig[] = [
  { name: 'fullName', required: true },
  { name: 'email', required: true },
];

export function MeetingSettings({
  initialWaitingRoomEnabled,
  initialRegistrationEnabled,
  onUpdate,
}: {
  initialWaitingRoomEnabled: boolean;
  initialRegistrationEnabled: boolean;
  onUpdate: (next: {
    waitingRoomEnabled: boolean;
    registrationEnabled: boolean;
    registrationFields: FieldConfig[];
  }) => void;
}) {
  const { t } = useTranslation();
  const [waitingRoomEnabled, setWaitingRoom] = useState(initialWaitingRoomEnabled);
  const [registrationEnabled, setRegistration] = useState(initialRegistrationEnabled);
  const [fields, setFields] = useState<FieldConfig[]>(DEFAULTS);

  useEffect(() => {
    setWaitingRoom(initialWaitingRoomEnabled);
  }, [initialWaitingRoomEnabled]);
  useEffect(() => {
    setRegistration(initialRegistrationEnabled);
  }, [initialRegistrationEnabled]);

  const update = (
    next: Partial<{
      waitingRoomEnabled: boolean;
      registrationEnabled: boolean;
      registrationFields: FieldConfig[];
    }>,
  ) => {
    const nextWaiting = next.waitingRoomEnabled ?? waitingRoomEnabled;
    const nextRegistration = next.registrationEnabled ?? registrationEnabled;
    const nextFields = next.registrationFields ?? fields;
    if (next.waitingRoomEnabled !== undefined) setWaitingRoom(nextWaiting);
    if (next.registrationEnabled !== undefined) setRegistration(nextRegistration);
    if (next.registrationFields !== undefined) setFields(nextFields);
    onUpdate({
      waitingRoomEnabled: nextWaiting,
      registrationEnabled: nextRegistration,
      registrationFields: nextFields,
    });
  };

  const toggleField = (name: FieldName) => {
    if (name === 'fullName') return; // always shown
    const exists = fields.find((f) => f.name === name);
    const next: FieldConfig[] = exists
      ? fields.filter((f) => f.name !== name)
      : [...fields, { name, required: true }];
    update({ registrationFields: next });
  };

  const toggleRequired = (name: FieldName) => {
    if (name === 'fullName') return; // always required
    const next = fields.map((f) => (f.name === name ? { ...f, required: !f.required } : f));
    update({ registrationFields: next });
  };

  const isShown = (name: FieldName) => fields.some((f) => f.name === name);
  const isRequired = (name: FieldName) => fields.some((f) => f.name === name && f.required);

  return (
    <div className="mt-3 space-y-2.5 border-t border-white/10 pt-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-white/85">
        <Lock className="h-3.5 w-3.5" />
        {t('meetings.meetingSettings', { defaultValue: 'Meeting settings' })}
      </p>

      {/* Waiting room — independent of the registration form. */}
      <ToggleRow
        icon={<Lock className="h-3.5 w-3.5" />}
        title={t('meetings.waitingRoomToggle', { defaultValue: 'Waiting room' })}
        hint={t('meetings.waitingRoomHint', {
          defaultValue: 'External visitors wait in a lobby until you admit them. No form is shown.',
        })}
        checked={waitingRoomEnabled}
        onChange={(v) => update({ waitingRoomEnabled: v })}
      />

      {/* Registration form — independent of the waiting room. */}
      <ToggleRow
        icon={<ClipboardList className="h-3.5 w-3.5" />}
        title={t('meetings.registrationToggle', {
          defaultValue: 'Registration form',
        })}
        hint={t('meetings.registrationHint', {
          defaultValue:
            'External visitors fill out a form before joining. Responses are saved for the attendee report.',
        })}
        checked={registrationEnabled}
        onChange={(v) => update({ registrationEnabled: v })}
      />

      {registrationEnabled && (
        <div className="space-y-1.5 pl-1">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">
            {t('meetings.lobbyFields', { defaultValue: 'Registration fields' })}
          </p>
          <FieldRow
            icon={<User className="h-3.5 w-3.5" />}
            label={t('meetings.fieldFullName')}
            alwaysOn
            required
            checked
            onToggle={() => undefined}
            onToggleRequired={() => undefined}
          />
          <FieldRow
            icon={<Mail className="h-3.5 w-3.5" />}
            label={t('meetings.fieldEmail')}
            checked={isShown('email')}
            required={isRequired('email')}
            onToggle={() => toggleField('email')}
            onToggleRequired={() => toggleRequired('email')}
          />
          <FieldRow
            icon={<Phone className="h-3.5 w-3.5" />}
            label={t('meetings.fieldPhone')}
            checked={isShown('phone')}
            required={isRequired('phone')}
            onToggle={() => toggleField('phone')}
            onToggleRequired={() => toggleRequired('phone')}
          />
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  hint,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] p-2.5">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-white/70">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-white/90">{title}</p>
        <p className="text-[10px] leading-snug text-white/45">{hint}</p>
      </div>
      <span className="relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          className={cn(
            'h-5 w-9 rounded-full bg-white/15 transition peer-checked:bg-(--brand) peer-focus-visible:ring-2 peer-focus-visible:ring-(--brand)/40',
          )}
        />
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </label>
  );
}

function FieldRow({
  icon,
  label,
  alwaysOn,
  required,
  checked,
  onToggle,
  onToggleRequired,
}: {
  icon: React.ReactNode;
  label: string;
  alwaysOn?: boolean;
  required: boolean;
  checked: boolean;
  onToggle: () => void;
  onToggleRequired: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-white/70">
        {icon}
      </span>
      <span className="flex-1 text-xs text-white/85">{label}</span>
      <button
        type="button"
        onClick={onToggleRequired}
        disabled={alwaysOn || !checked}
        className={cn(
          'shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition',
          required
            ? 'border-(--brand)/50 bg-(--brand)/15 text-(--brand)'
            : 'border-white/10 bg-white/[0.04] text-white/50 hover:bg-white/10',
          (alwaysOn || !checked) && 'cursor-default opacity-60',
        )}
        title={required ? 'Required' : 'Optional'}
      >
        {required ? 'Required' : 'Optional'}
      </button>
      <span className="relative inline-flex h-5 w-9 cursor-pointer items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          disabled={alwaysOn}
          className="peer sr-only"
        />
        <span
          className={cn(
            'h-5 w-9 rounded-full bg-white/15 transition peer-checked:bg-(--brand) peer-focus-visible:ring-2 peer-focus-visible:ring-(--brand)/40',
            alwaysOn && 'opacity-60',
          )}
        />
        <span
          className={cn(
            'absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </div>
  );
}
