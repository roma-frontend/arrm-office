'use client';

/**
 * Microphone / camera / speaker pickers, shared by the pre-join card and the
 * in-call settings popover. Two tones because the pre-join screen lives on the
 * app canvas while the call is a dark stage.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supportsAudioOutputSelection } from 'livekit-client';
import { Camera, Mic, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useDeviceList,
  type MeetingDeviceChoices,
  type MeetingDeviceKind,
} from './useMeetingDevices';

type Tone = 'dark' | 'canvas';

function DeviceRow({
  kind,
  icon,
  label,
  value,
  tone,
  onChange,
}: {
  kind: MeetingDeviceKind;
  icon: React.ReactNode;
  label: string;
  value: string | undefined;
  tone: Tone;
  onChange: (kind: MeetingDeviceKind, deviceId: string) => void;
}) {
  const { t } = useTranslation();
  const devices = useDeviceList(kind);
  const dark = tone === 'dark';

  return (
    <label className="block">
      <span
        className={cn(
          'mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider',
          dark ? 'text-white/45' : 'text-(--text-3)',
        )}
      >
        {icon}
        {label}
      </span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(kind, event.target.value)}
        className={cn(
          'w-full cursor-pointer truncate rounded-xl px-3 py-2 text-xs outline-none transition',
          dark
            ? 'border border-white/10 bg-white/[0.06] text-white/85 focus:border-(--brand)/50 [&>option]:bg-[#141824] [&>option]:text-white/85'
            : 'border border-(--border-default) bg-(--sunken) text-(--text-1) focus:border-(--brand)',
        )}
      >
        <option value="">{t('meetings.defaultDevice')}</option>
        {devices.map((device, index) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `${label} ${index + 1}`}
          </option>
        ))}
      </select>
      {devices.length === 0 && (
        <span className={cn('mt-1 block text-[10px]', dark ? 'text-white/30' : 'text-(--text-4)')}>
          {t('meetings.noDevices')}
        </span>
      )}
    </label>
  );
}

export function DeviceSettings({
  choices,
  onChange,
  tone = 'dark',
  className,
}: {
  choices: MeetingDeviceChoices;
  onChange: (kind: MeetingDeviceKind, deviceId: string) => void;
  tone?: Tone;
  className?: string;
}) {
  const { t } = useTranslation();
  // `setSinkId` is missing in Firefox and older Safari — probed after mount so
  // the server and client render the same rows.
  const [canPickSpeaker, setCanPickSpeaker] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCanPickSpeaker(supportsAudioOutputSelection());
    } catch {
      setCanPickSpeaker(false);
    }
  }, []);

  return (
    <div className={cn('grid gap-3', className)}>
      <DeviceRow
        kind="audioinput"
        icon={<Mic className="h-3 w-3" />}
        label={t('meetings.microphone')}
        value={choices.audioinput}
        tone={tone}
        onChange={onChange}
      />
      <DeviceRow
        kind="videoinput"
        icon={<Camera className="h-3 w-3" />}
        label={t('meetings.camera')}
        value={choices.videoinput}
        tone={tone}
        onChange={onChange}
      />
      {canPickSpeaker && (
        <DeviceRow
          kind="audiooutput"
          icon={<Volume2 className="h-3 w-3" />}
          label={t('meetings.speaker')}
          value={choices.audiooutput}
          tone={tone}
          onChange={onChange}
        />
      )}
    </div>
  );
}

/**
 * Horizontal VU meter for the microphone check.
 *
 * `compact` is the badge form used on top of the camera preview: no label, five
 * short bars, sized to sit next to the mic button without competing with it.
 * The labelled form is for panels where the meter is a row of its own.
 */
export function MicMeter({
  level,
  tone = 'dark',
  compact = false,
}: {
  level: number;
  tone?: Tone;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const dark = tone === 'dark';
  const bars = compact ? 5 : 12;
  const lit = Math.round(level * bars);

  const bar = (index: number) => (
    <span
      key={index}
      className={cn(
        'rounded-full transition-colors duration-75',
        compact ? 'h-3 w-1' : 'h-2.5 flex-1',
        index < lit
          ? index > bars - 3
            ? 'bg-amber-400'
            : 'bg-emerald-400'
          : compact
            ? 'bg-white/25'
            : dark
              ? 'bg-white/10'
              : 'bg-(--surface-3)',
      )}
    />
  );

  if (compact) {
    return (
      <span
        title={t('meetings.micLevel')}
        className="flex items-center gap-0.5 rounded-full bg-black/45 px-2 py-1.5 backdrop-blur-sm"
        aria-hidden="true"
      >
        {Array.from({ length: bars }, (_, index) => bar(index))}
      </span>
    );
  }

  return (
    <div>
      <span
        className={cn(
          'mb-1 block text-[10px] font-semibold uppercase tracking-wider',
          dark ? 'text-white/45' : 'text-(--text-3)',
        )}
      >
        {t('meetings.micLevel')}
      </span>
      <div className="flex items-center gap-1" aria-hidden="true">
        {Array.from({ length: bars }, (_, index) => bar(index))}
      </div>
    </div>
  );
}
