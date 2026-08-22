'use client';

/**
 * Background effect picker — shared by the pre-join card and the in-call
 * settings popover, so the choice a participant makes before joining is the
 * same control they find inside the room.
 *
 * Tiles rather than a `<select>`: a virtual background is a visual choice, and
 * the thumbnail is the label. The blur options are drawn from the app tokens so
 * they read as "the picker", not as another image.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VIDEO_EFFECT_IMAGES, type VideoEffectId } from './useVideoEffects';

type Tone = 'dark' | 'canvas';

const LABEL_KEY: Record<VideoEffectId, string> = {
  none: 'meetings.effects.none',
  'blur-light': 'meetings.effects.blurLight',
  'blur-strong': 'meetings.effects.blurStrong',
  'bokeh-warm': 'meetings.effects.bokehWarm',
  'gradient-dusk': 'meetings.effects.gradientDusk',
  'mint-soft': 'meetings.effects.mintSoft',
  'slate-grid': 'meetings.effects.slateGrid',
};

function Tile({
  id,
  selected,
  busy,
  disabled,
  tone,
  onSelect,
  children,
}: {
  id: VideoEffectId;
  selected: boolean;
  busy: boolean;
  disabled: boolean;
  tone: Tone;
  onSelect: (id: VideoEffectId) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const dark = tone === 'dark';
  const label = t(LABEL_KEY[id]);

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      disabled={disabled}
      aria-pressed={selected}
      title={label}
      aria-label={label}
      className={cn(
        'relative aspect-[4/3] overflow-hidden rounded-lg outline-none transition',
        'focus-visible:ring-2 focus-visible:ring-(--brand)/70',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:opacity-90',
        selected
          ? 'ring-2 ring-(--brand)'
          : dark
            ? 'ring-1 ring-white/12'
            : 'ring-1 ring-(--border-default)',
      )}
    >
      {children}
      {busy && (
        <span className="absolute inset-0 grid place-items-center bg-black/45">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
        </span>
      )}
    </button>
  );
}

export function BackgroundPicker({
  effect,
  pending,
  supported,
  failed,
  hasCamera,
  tone = 'dark',
  className,
  onSelect,
}: {
  effect: VideoEffectId;
  pending: boolean;
  supported: boolean | null;
  failed: boolean;
  hasCamera: boolean;
  tone?: Tone;
  className?: string;
  onSelect: (id: VideoEffectId) => void;
}) {
  const { t } = useTranslation();
  const dark = tone === 'dark';
  // `supported === false` is a hard no from the processor library (no
  // WebGL / WASM): keep the rows visible but inert so the reason is legible.
  const blocked = !hasCamera || supported === false;
  const status = !hasCamera
    ? t('meetings.effects.needsCamera')
    : supported === false
      ? t('meetings.effects.unsupported')
      : failed
        ? t('meetings.effects.failed')
        : pending
          ? t('meetings.effects.applying')
          : t('meetings.effects.hint');

  return (
    <div className={cn('min-w-0', className)}>
      {/* Title and status share one line: the picker is a single row of tiles,
          and a separate status line below it would double its height. */}
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span
          className={cn(
            'shrink-0 text-[10px] font-semibold uppercase tracking-wider',
            dark ? 'text-white/45' : 'text-(--text-3)',
          )}
        >
          {t('meetings.effects.title')}
        </span>
        <span
          role={failed || supported === false ? 'status' : undefined}
          className={cn(
            'truncate text-[10px]',
            dark ? 'text-white/40' : 'text-(--text-4)',
            (failed || supported === false) && 'text-(--danger-text)',
          )}
        >
          {status}
        </span>
      </div>

      {/* All seven options in one row — wrapping to a second row made the
          pre-join card taller than the join card next to it. */}
      <div className="grid grid-cols-7 gap-1.5">
        <Tile
          id="none"
          selected={effect === 'none'}
          busy={false}
          disabled={!hasCamera}
          tone={tone}
          onSelect={onSelect}
        >
          <span
            className={cn(
              'grid h-full w-full place-items-center',
              dark ? 'bg-white/[0.06] text-white/55' : 'bg-(--sunken) text-(--text-3)',
            )}
          >
            <Ban className="h-4 w-4" />
          </span>
        </Tile>

        {(['blur-light', 'blur-strong'] as const).map((id) => (
          <Tile
            key={id}
            id={id}
            selected={effect === id}
            busy={pending && effect === id}
            disabled={blocked}
            tone={tone}
            onSelect={onSelect}
          >
            <span
              className={cn(
                'grid h-full w-full place-items-center bg-gradient-to-br',
                dark ? 'from-white/[0.16] to-white/[0.04]' : 'from-(--surface-3) to-(--surface-2)',
              )}
            >
              <span
                className={cn(
                  'h-5 w-5 rounded-full bg-(--brand)',
                  id === 'blur-light' ? 'blur-[3px]' : 'blur-[6px]',
                )}
              />
            </span>
          </Tile>
        ))}

        {VIDEO_EFFECT_IMAGES.map(({ id, file }) => (
          <Tile
            key={id}
            id={id}
            selected={effect === id}
            busy={pending && effect === id}
            disabled={blocked}
            tone={tone}
            onSelect={onSelect}
          >
            <span
              className="block h-full w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${file})` }}
            />
          </Tile>
        ))}
      </div>
    </div>
  );
}
