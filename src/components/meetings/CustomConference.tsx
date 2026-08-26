'use client';

/**
 * CustomConference — fully custom in-call UI on top of raw LiveKit primitives.
 *
 * Dark, immersive "stage" design: centered aspect-video participant tiles with
 * speaking glow, screen-share focus layout, floating glass control dock, chat
 * drawer and floating emoji reactions — all in the app's design language.
 *
 * Conference features (Zoom/Teams-like):
 *  - Raise hand: dock toggle broadcast over a data channel; every client shows
 *    an animated badge on the tile, a chip in the header and a row highlight
 *    in the participants panel.
 *  - Host controls: the organizer can mute a participant's mic/camera, ask to
 *    unmute, mute everyone and remove participants. Mutes and the kick run
 *    server-side through `meetingsActions` (`muteParticipantTrack`,
 *    `muteEveryone`, `removeParticipant`) so they hold even against a modified
 *    client; the `hostCtrl` data channel is only used to explain what happened.
 *  - Pin / spotlight any tile, a debounced "sticky" active speaker so the stage
 *    does not flicker between people, per-tile connection quality, a recording
 *    indicator and join/leave toasts.
 *  - Speaker / grid layout toggle, fullscreen, participant avatar stack, a
 *    participants panel with per-row mic/cam/hand status, in-call device
 *    settings and keyboard shortcuts (including hold-Space push-to-talk).
 *  - Background blur / virtual backgrounds and Krisp noise cancellation on the
 *    local tracks, plus live captions broadcast over a data channel.
 *  - Host-only cloud recording through LiveKit Egress (`meetingsActions`), with
 *    the running state mirrored on the meeting row so every client agrees.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectionQuality, Track, type LocalVideoTrack, type Participant } from 'livekit-client';
import {
  useLocalParticipant,
  useParticipants,
  useParticipantTracks,
  useSpeakingParticipants,
  useTrackToggle,
  useTracks,
  useChat,
  useDataChannel,
  useConnectionState,
  useConnectionQualityIndicator,
  useIsRecording,
} from '@livekit/components-react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { toast } from 'sonner';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorOff,
  PhoneOff,
  MessageSquare,
  Send,
  WifiOff,
  Hand,
  Users,
  Maximize2,
  Minimize2,
  LayoutGrid,
  Presentation,
  Check,
  Link2,
  Radio,
  X,
  Pin,
  PinOff,
  Settings,
  Smile,
  Keyboard,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Captions,
  CaptionsOff,
  Circle,
  Loader2,
  Square,
  Waves,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatedEmoji } from './AnimatedEmoji';
import { DeviceSettings } from './DeviceSettings';
import { BackgroundPicker } from './BackgroundPicker';
import { useVideoEffects } from './useVideoEffects';
import { useNoiseFilter } from './useNoiseFilter';
import { captionsSupported, useLiveCaptions, type CaptionLine } from './useLiveCaptions';
import type { MeetingDeviceChoices, MeetingDeviceKind } from './useMeetingDevices';
import { LobbyPanel } from './LobbyPanel';
import { MeetingSettings } from './MeetingSettings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type MeetingStatus = 'scheduled' | 'live' | 'ended';

export interface ConferenceProps {
  roomName: string;
  title: string;
  statusKey: MeetingStatus;
  elapsed: number;
  mode: 'meeting' | 'webinar';
  linkCopied: boolean;
  onCopyLink: () => void;
  onLeave: () => void;
  /** Remembered mic / camera / speaker, shared with the pre-join screen. */
  deviceChoices: MeetingDeviceChoices;
  onDeviceChange: (kind: MeetingDeviceKind, deviceId: string) => void;
  /**
   * Whether the signed-in user is the original meeting host (`meetings.hostUserId`).
   * Used on first join to offer to reclaim host rights when a co-host is live.
   * Independent of the JWT role, which only describes the current seat.
   */
  isOriginalHost: boolean;
  /**
   * Co-host ids currently on the meeting row. When the local user is the
   * original host and this list is non-empty on first join, we prompt them to
   * reclaim — otherwise they would silently re-enter as a regular participant.
   */
  cohostIds: readonly string[];
  /** Whether the host enabled the waiting room for this meeting. Controls the
   * visibility of the in-call admit/deny panel. */
  waitingRoomEnabled: boolean;
}

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  );
}

/** Role embedded in the token metadata (`getJoinToken` mints it server-side). */
function participantRole(metadata: string | undefined): string | undefined {
  if (!metadata) return undefined;
  try {
    return (JSON.parse(metadata) as { role?: string }).role;
  } catch {
    return undefined;
  }
}

/** Attaches a LiveKit track to a <video> element and detaches on cleanup. */
function VideoSurface({
  track,
  mirrored = false,
  className,
}: {
  track?: {
    attach: (el: HTMLVideoElement) => unknown;
    detach: (el: HTMLVideoElement) => unknown;
    isLocal?: boolean;
  };
  mirrored?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      muted={track?.isLocal}
      playsInline
      className={cn('h-full w-full object-cover', mirrored && '-scale-x-100', className)}
    />
  );
}

/**
 * Per-participant connection quality. Only rendered once the SFU has an opinion
 * (`Unknown` right after joining stays hidden), and only when it is worth
 * knowing — a green bar on every tile is noise.
 */
function QualityBadge({ participant }: { participant: Participant }) {
  const { t } = useTranslation();
  const { quality } = useConnectionQualityIndicator({ participant });

  if (quality === ConnectionQuality.Unknown) return null;

  const look = {
    [ConnectionQuality.Excellent]: {
      Icon: SignalHigh,
      tone: 'text-emerald-400',
      label: t('meetings.quality.excellent'),
    },
    [ConnectionQuality.Good]: {
      Icon: SignalMedium,
      tone: 'text-white/70',
      label: t('meetings.quality.good'),
    },
    [ConnectionQuality.Poor]: {
      Icon: SignalLow,
      tone: 'text-amber-400',
      label: t('meetings.quality.poor'),
    },
    [ConnectionQuality.Lost]: {
      Icon: Signal,
      tone: 'text-red-400',
      label: t('meetings.quality.lost'),
    },
  }[quality];

  // Excellent is the expected state — keep the tile clean and say nothing.
  if (quality === ConnectionQuality.Excellent) return null;

  return (
    <span
      title={look.label}
      aria-label={look.label}
      className="rounded-lg bg-black/50 p-1 backdrop-blur-sm"
    >
      <look.Icon className={cn('h-3 w-3', look.tone)} />
    </span>
  );
}

function MeetingTile({
  participant,
  isLocal,
  speaking,
  handRaised,
  fallbackName,
  reactions,
  pinned,
  onTogglePin,
  className,
}: {
  participant: Participant;
  isLocal: boolean;
  speaking: boolean;
  handRaised: boolean;
  fallbackName: string;
  reactions?: { id: number; emoji: string }[];
  pinned?: boolean;
  onTogglePin?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const cameraRefs = useParticipantTracks([Track.Source.Camera], participant.identity);
  const micRefs = useParticipantTracks([Track.Source.Microphone], participant.identity);
  const cam = cameraRefs[0];
  const camTrack = cam?.publication?.track;
  const micMuted = !micRefs[0]?.publication?.track || !!micRefs[0]?.publication?.isMuted;
  const camMuted = !camTrack || !!cam?.publication?.isMuted;
  const name = participant.name || (isLocal ? fallbackName : participant.identity);

  return (
    <div
      className={cn(
        'group relative min-h-0 overflow-hidden rounded-2xl bg-white/[0.06] transition-all duration-200',
        speaking
          ? 'ring-2 ring-(--brand) shadow-[0_0_0_4px_rgb(37_99_235/0.18),0_16px_48px_-16px_rgb(37_99_235/0.5)]'
          : 'shadow-[0_2px_12px_-2px_rgba(0,0,0,0.35)]',
        pinned && !speaking && 'ring-2 ring-white/25',
        className,
      )}
    >
      {!camMuted && camTrack ? (
        <VideoSurface track={camTrack} mirrored={isLocal} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(140deg,rgb(255_255_255/0.06),transparent_60%)]">
          <div className="flex size-20 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgb(37_99_235/0.35),rgb(37_99_235/0.12))] ring-2 ring-(--brand)/40">
            <span className="text-xl font-bold text-white/90">{getInitials(name)}</span>
          </div>
        </div>
      )}

      {isLocal && (
        <span className="absolute top-2 left-2 rounded-md bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/60 backdrop-blur-sm">
          {fallbackName}
        </span>
      )}

      <div className="absolute top-2 right-2 flex items-center gap-1.5">
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            title={pinned ? t('meetings.unpin') : t('meetings.pin')}
            aria-label={pinned ? t('meetings.unpin') : t('meetings.pin')}
            className={cn(
              'flex size-7 items-center justify-center rounded-lg backdrop-blur-sm transition',
              // Hidden until hover/focus so the stage stays calm; always visible
              // while pinned, otherwise there is no way to find the unpin.
              pinned
                ? 'bg-white/20 text-white'
                : 'bg-black/45 text-white/70 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-black/70 hover:text-white focus-visible:opacity-100',
            )}
          >
            {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
        )}
        {handRaised && (
          <span
            title={fallbackName}
            className="meeting-hand-badge flex size-7 items-center justify-center rounded-full bg-amber-400 shadow-lg shadow-amber-400/40"
          >
            <Hand className="h-3.5 w-3.5 text-amber-950" />
          </span>
        )}
      </div>

      {/* Centered emoji reactions on this tile */}
      {reactions && reactions.length > 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          {reactions.map((r) => (
            <span
              key={r.id}
              className="meeting-tile-reaction absolute drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
            >
              <AnimatedEmoji emoji={r.emoji} size={72} />
            </span>
          ))}
        </div>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
        <div className="flex items-center gap-1.5 rounded-lg bg-black/50 px-2 py-1 backdrop-blur-sm">
          {micMuted ? (
            <MicOff className="h-3 w-3 text-red-400" />
          ) : (
            <Mic className={cn('h-3 w-3', speaking ? 'text-emerald-400' : 'text-white/70')} />
          )}
          {speaking && (
            <span className="flex h-3 items-end gap-0.5">
              <span className="meeting-speaking-bar w-0.5 rounded-full bg-emerald-400" />
              <span
                className="meeting-speaking-bar w-0.5 rounded-full bg-emerald-400"
                style={{ animationDelay: '180ms' }}
              />
              <span
                className="meeting-speaking-bar w-0.5 rounded-full bg-emerald-400"
                style={{ animationDelay: '360ms' }}
              />
            </span>
          )}
          <span className="max-w-40 truncate text-[11px] font-medium text-white/90">{name}</span>
        </div>
        <QualityBadge participant={participant} />
      </div>
    </div>
  );
}

const REACTIONS = ['👍', '❤️', '😂', '🎉', '👏'];

/** Generic icon button used in the header and panel rows. */
function IconBtn({
  onClick,
  title,
  children,
  className,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex size-9 items-center justify-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

function DockBtn({
  on,
  onIcon,
  offIcon,
  label,
  onClick,
}: {
  on: boolean;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        'flex size-11 items-center justify-center rounded-xl transition-all hover:scale-105',
        on
          ? 'bg-white/10 text-white hover:bg-white/15'
          : 'bg-red-500/20 text-red-300 hover:bg-red-500/30',
      )}
    >
      {on ? onIcon : offIcon}
    </button>
  );
}

/**
 * Dock button for mic and camera: always a red icon, and on hover the icon
 * fades out and a red cross appears — the click turns the device off/on.
 */
function RedDockBtn({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="group relative flex size-11 items-center justify-center rounded-xl bg-white/10 transition-all hover:scale-105 hover:bg-white/15"
    >
      <span className="text-rose-400 transition-opacity duration-150 group-hover:opacity-0">{icon}</span>
      <X className="absolute h-4.5 w-4.5 text-rose-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
    </button>
  );
}

/**
 * Dock button for the panels and popovers (chat, participants, reactions,
 * settings). Unlike `DockBtn` it is not a device on/off state, so "active" only
 * means the thing it opens is currently open.
 */
function DockToggle({
  active,
  label,
  badge,
  className,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  badge?: { text: string; tone: 'red' | 'amber' };
  className?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'relative flex size-11 items-center justify-center rounded-xl transition',
        active ? 'bg-(--brand)/25 text-white' : 'text-white/70 hover:bg-white/10',
        className,
      )}
    >
      {children}
      {badge && (
        <span
          className={cn(
            'absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold',
            badge.tone === 'red' ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-950',
          )}
        >
          {badge.text}
        </span>
      )}
    </button>
  );
}

/**
 * Labelled switch used inside the settings popover. A real checkbox under a
 * styled track, so it is reachable by keyboard and announced as a toggle; the
 * hint line carries the "why is this inert" explanation for unsupported
 * browsers instead of leaving a dead control.
 */
function SwitchRow({
  icon,
  label,
  hint,
  checked,
  pending,
  disabled,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  pending: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex items-start gap-2.5',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      )}
    >
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/60">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium text-white/85">{label}</span>
        <span className="block text-[10px] text-white/40">{hint}</span>
      </span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled || pending}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-(--brand)/70',
          checked ? 'bg-(--brand)' : 'bg-white/15',
        )}
      >
        <span
          className={cn(
            'size-4 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </span>
    </label>
  );
}

/** One caption line: speaker name, then the text (interim results greyed out). */
function CaptionRow({
  line,
  isLocal,
  youName,
}: {
  line: CaptionLine;
  isLocal: boolean;
  youName: string;
}) {
  return (
    <li className="text-[13px] leading-snug">
      <span className="mr-1.5 font-semibold text-[#7ba2ff]">{isLocal ? youName : line.name}</span>
      <span className={cn(line.final ? 'text-white/90' : 'text-white/45 italic')}>{line.text}</span>
    </li>
  );
}

function ParticipantRow({
  participant,
  localIdentity,
  hands,
  canModerate,
  onToggleMic,
  onToggleCam,
  onRemove,
}: {
  participant: Participant;
  localIdentity: string;
  hands: Record<string, boolean>;
  canModerate: boolean;
  /**
   * Toggles the participant's microphone. The caller passes the row's
   * `micMuted` flag (already computed from the LiveKit track publications)
   * so we do not need to call `getTrackPublication` again here — that call
   * is missing in some test mocks and would diverge the host UI from the
   * icon the user actually clicked.
   */
  onToggleMic: (identity: string, micMuted: boolean) => void;
  onToggleCam: (identity: string, camMuted: boolean) => void;
  onRemove: (identity: string) => void;
}) {
  const { t } = useTranslation();
  const isSelf = participant.identity === localIdentity;
  const micRefs = useParticipantTracks([Track.Source.Microphone], participant.identity);
  const camRefs = useParticipantTracks([Track.Source.Camera], participant.identity);
  // `useParticipantTracks` returns an empty array when the track has not been
  // published yet (e.g. the local user has not enabled their camera). Treat
  // the absence of a publication as "off" for self rows and "on" for remote
  // rows — the local toggle, by definition, knows it is off, while a remote
  // participant we have not seen publish yet is the default state we show.
  const hasMicPub = !!micRefs[0]?.publication;
  const hasCamPub = !!camRefs[0]?.publication;
  const micMuted = hasMicPub ? !!micRefs[0]?.publication?.isMuted : isSelf;
  const camMuted = hasCamPub ? !!camRefs[0]?.publication?.isMuted : isSelf;
  const rowRole = participantRole(participant.metadata);
  const isRowHost = rowRole === 'host';
  const isRowCohost = rowRole === 'cohost';
  const identity = participant.identity || participant.sid;
  const handRaised = !!hands[identity];

  return (
    <div className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-white/[0.06]">
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
          isRowHost
            ? 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40'
            : 'bg-[#1c2233] text-white/80',
        )}
      >
        {getInitials(participant.name || identity)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-white/90">
          {participant.name || identity}
          {isSelf && <span className="font-normal text-white/40"> ({t('meetings.you')})</span>}
        </p>
        <p className="flex items-center gap-1.5 text-[10px] text-white/45">
          {isRowHost && <span className="text-amber-300/80">{t('meetings.host')}</span>}
          {isRowCohost && (
            <span className="text-sky-300/80">
              {t('meetings.cohost', { defaultValue: 'Co-host' })}
            </span>
          )}
          {handRaised && (
            <span className="inline-flex items-center gap-0.5 text-amber-300/90">
              <Hand className="h-2.5 w-2.5" />
              {t('meetings.raiseHand')}
            </span>
          )}
        </p>
      </div>
      {handRaised && (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-400/90">
          <Hand className="h-2.5 w-2.5 text-amber-950" />
        </span>
      )}
      {/*
        Per-row mic + camera controls. The icon turns red the moment the track
        is off, so red = "this is currently muted/stopped" for both self and
        remote participants. For self the button toggles the local track; for
        remote rows it is a host moderation control — `canModerate` gates it,
        and an extra remove (X) button appears on hover.
      */}
      <button
        type="button"
        onClick={() => onToggleMic(isSelf ? localIdentity : identity, micMuted)}
        disabled={!isSelf && !canModerate}
        title={
          isSelf
            ? micMuted
              ? t('meetings.micOn')
              : t('meetings.micOff')
            : micMuted
              ? t('meetings.askUnmute')
              : t('meetings.muteMic')
        }
        className={cn(
          'shrink-0 rounded-md p-0.5 transition',
          isSelf || canModerate
            ? 'cursor-pointer hover:bg-white/10'
            : 'cursor-default opacity-40',
          micMuted ? 'text-red-400' : 'text-white/55',
        )}
      >
        {micMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => onToggleCam(isSelf ? localIdentity : identity, camMuted)}
        disabled={!isSelf && !canModerate}
        title={
          isSelf
            ? camMuted
              ? t('meetings.camOn')
              : t('meetings.camOff')
            : camMuted
              ? t('meetings.askUnmuteCam', { defaultValue: 'Ask to turn camera on' })
              : t('meetings.muteCam')
        }
        className={cn(
          'shrink-0 rounded-md p-0.5 transition',
          isSelf || canModerate
            ? 'cursor-pointer hover:bg-white/10'
            : 'cursor-default opacity-40',
          camMuted ? 'text-red-400' : 'text-white/55',
        )}
      >
        {camMuted ? <VideoOff className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
      </button>
      {canModerate && !isSelf && (
        <button
          type="button"
          onClick={() => onRemove(identity)}
          title={t('meetings.remove')}
          className="shrink-0 rounded-md p-0.5 text-white/40 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-rose-500/20 hover:text-rose-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function CustomConference(props: ConferenceProps) {
  const {
    roomName,
    title,
    statusKey,
    elapsed,
    mode,
    linkCopied,
    onCopyLink,
    onLeave,
    deviceChoices,
    onDeviceChange,
    isOriginalHost,
    cohostIds,
    waitingRoomEnabled,
  } = props;
  const { t, i18n } = useTranslation();
  const { localParticipant, cameraTrack } = useLocalParticipant();
  const remotes = useParticipants();
  const speaking = useSpeakingParticipants();
  const connectionState = useConnectionState();
  const isRecording = useIsRecording();

  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const share = useTrackToggle({ source: Track.Source.ScreenShare });

  /** Only one dock popover is open at a time. */
  const [dockMenu, setDockMenu] = useState<'reactions' | 'settings' | 'shortcuts' | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const { chatMessages, send } = useChat();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [unread, setUnread] = useState(0);

  // ── Reactions ───────────────────────────────────────────────────────────
  // Per-tile reactions: emoji appears centered on the sender's video frame
  const [tileReactions, setTileReactions] = useState<
    Record<string, { id: number; emoji: string }[]>
  >({});
  const tileReactionId = useRef(0);

  // Bottom cascade: all reactions float upward from the dock
  const [cascadeReactions, setCascadeReactions] = useState<
    { id: number; emoji: string; x: number }[]
  >([]);
  const cascadeId = useRef(0);

  const pushTileReaction = (emoji: string, identity: string) => {
    const id = ++tileReactionId.current;
    setTileReactions((prev) => ({
      ...prev,
      [identity]: [...(prev[identity] || []), { id, emoji }],
    }));
    setTimeout(() => {
      setTileReactions((prev) => ({
        ...prev,
        [identity]: (prev[identity] || []).filter((r) => r.id !== id),
      }));
    }, 2500);
  };

  const pushCascadeReaction = (emoji: string) => {
    const id = ++cascadeId.current;
    // Stagger horizontal position: random offset within a range, centered
    const x = (Math.random() - 0.5) * 280;
    setCascadeReactions((prev) => [...prev.slice(-18), { id, emoji, x }]);
    setTimeout(() => {
      setCascadeReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2900);
  };

  useDataChannel('reactions', (msg) => {
    try {
      const raw = new TextDecoder().decode(msg.payload as unknown as Uint8Array);
      const data = JSON.parse(raw) as { emoji?: string; identity?: string };
      if (data.emoji) {
        const senderIdentity = data.identity || msg.from?.identity || '';
        pushTileReaction(data.emoji, senderIdentity);
        pushCascadeReaction(data.emoji);
      }
    } catch {
      /* ignore malformed */
    }
  });
  const { send: sendReaction } = useDataChannel('reactions');

  // ── Raise hand ─────────────────────────────────────────────────────────────
  const [hands, setHands] = useState<Record<string, boolean>>({});
  const [handRaised, setHandRaised] = useState(false);
  const { send: sendHand } = useDataChannel('raiseHand');
  useDataChannel('raiseHand', (msg) => {
    if (!msg.from?.identity) return;
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload)) as { on?: boolean };
      if (typeof data.on === 'boolean') {
        const on = data.on;
        setHands((prev) => {
          const next = { ...prev };
          next[msg.from!.identity] = on;
          return next;
        });
      }
    } catch {
      /* ignore malformed */
    }
  });

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    const localId = localParticipant?.identity;
    if (localId) setHands((prev) => ({ ...prev, [localId]: next }));
    try {
      void sendHand(new TextEncoder().encode(JSON.stringify({ on: next })), { reliable: true });
    } catch {
      /* best-effort */
    }
  };

  // ── Host controls ──────────────────────────────────────────────────────────
  const localIdentity = localParticipant?.identity ?? '';
  const localRole = participantRole(localParticipant?.metadata);
  const isHost = useMemo(() => localRole === 'host', [localRole]);
  // Alias for the host-or-cohost gate used by moderation controls (mute all,
  // per-row mic/cam/remove buttons). Cohosts can moderate but cannot start
  // recordings or end the meeting for everyone — that stays `isHost`-only.
  const canModerate = isHost || localRole === 'cohost';
  const { send: sendHostCtrl } = useDataChannel('hostCtrl');
  const removeParticipant = useAction(api.meetingsActions.removeParticipant);
  const muteParticipantTrack = useAction(api.meetingsActions.muteParticipantTrack);
  const muteEveryone = useAction(api.meetingsActions.muteEveryone);

  useDataChannel('hostCtrl', (msg) => {
    // Only host/co-host commands are honored — role is read from the token
    // metadata LiveKit exposes on the remote participant, so spoofing the
    // topic cannot mute others.
    const senderRole = participantRole(msg.from?.metadata);
    if (senderRole !== 'host' && senderRole !== 'cohost') return;
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload)) as {
        cmd?: string;
        target?: string;
      };
      if (!data.cmd) return;
      if (data.target && data.target !== localIdentity && data.target !== '*') return;
      switch (data.cmd) {
        case 'muteMic': {
          void localParticipant?.setMicrophoneEnabled(false);
          toast(t('meetings.mutedByHost'), { icon: <MicOff className="h-4 w-4 text-red-400" /> });
          break;
        }
        case 'muteCam': {
          void localParticipant?.setCameraEnabled(false);
          toast(t('meetings.camStoppedByHost'), {
            icon: <VideoOff className="h-4 w-4 text-red-400" />,
          });
          break;
        }
        case 'askUnmute': {
          toast(t('meetings.unmuteRequest'), {
            icon: <Mic className="h-4 w-4 text-emerald-400" />,
            action: {
              label: t('meetings.unmute'),
              onClick: () => {
                void localParticipant?.setMicrophoneEnabled(true);
              },
            },
          });
          break;
        }
        case 'askUnmuteCam': {
          toast(t('meetings.camUnmuteRequest', { defaultValue: 'The host asks you to turn your camera on' }), {
            icon: <Video className="h-4 w-4 text-emerald-400" />,
            action: {
              label: t('meetings.camOn'),
              onClick: () => {
                void localParticipant?.setCameraEnabled(true);
              },
            },
          });
          break;
        }
      }
    } catch {
      /* ignore malformed */
    }
  });

  const sendHostCommand = (cmd: string, target: string) => {
    try {
      void sendHostCtrl(new TextEncoder().encode(JSON.stringify({ cmd, target })), {
        reliable: true,
      });
    } catch {
      /* best-effort */
    }
  };

  // Host actions are enforced by the LiveKit server (see `meetingsActions`); the
  // data-channel message that follows is only there to tell the participant why
  // their microphone or camera just went dark.
  const handleMuteTrack = async (identity: string, source: 'microphone' | 'camera') => {
    try {
      await muteParticipantTrack({ roomName, identity, source, muted: true });
      sendHostCommand(source === 'microphone' ? 'muteMic' : 'muteCam', identity);
      toast.success(
        source === 'microphone'
          ? t('meetings.participantMuted')
          : t('meetings.participantCamStopped'),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('meetings.actionFailed'));
    }
  };

  /**
   * Single-button mic toggle per row: the local user toggles their own track
   * directly; for a remote row the host either forces the mic off (if it is
   * currently on) or sends a polite "please turn on" prompt (if it is off).
   * The server-side `mutePublishedTrack` can only stop a published track — it
   * cannot unmute a remote — so the ask path is the only way to recover.
   */
  /**
   * Toggles the participant's microphone. The caller passes the row's
   * `micMuted` flag (already computed from the LiveKit track publications)
   * so we do not need to call `getTrackPublication` again here — that call
   * is missing in some test mocks and would diverge the host UI from the
   * icon the user actually clicked.
   *
   *   - isSelf     → toggle the local track via the LiveKit mic hook
   *   - mic on     → force-mute through the LiveKit server
   *   - mic off    → send a polite "please unmute" prompt on the data channel
   */
  const handleToggleMic = async (
    row: Participant,
    identity: string,
    micMuted: boolean,
  ) => {
    if (identity === localIdentity) {
      await toggleTrack(() => mic.toggle(), t('meetings.micDenied'));
      return;
    }
    if (micMuted) {
      sendHostCommand('askUnmute', identity);
      toast.success(t('meetings.askUnmuteSent'));
    } else {
      await handleMuteTrack(identity, 'microphone');
    }
  };

  const handleToggleCam = async (
    row: Participant,
    identity: string,
    camMuted: boolean,
  ) => {
    if (identity === localIdentity) {
      await toggleTrack(() => cam.toggle(), t('meetings.camDenied'));
      return;
    }
    if (camMuted) {
      sendHostCommand('askUnmuteCam', identity);
      toast.success(
        t('meetings.askUnmuteCamSent', { defaultValue: 'Camera request sent' }),
      );
    } else {
      await handleMuteTrack(identity, 'camera');
    }
  };

  const handleMuteEveryone = async () => {
    try {
      await muteEveryone({ roomName });
      // '*' is the broadcast target the receiver below accepts.
      sendHostCommand('muteMic', '*');
      toast.success(t('meetings.muteAllDone'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('meetings.actionFailed'));
    }
  };

  const handleRemove = async (identity: string) => {
    try {
      await removeParticipant({ roomName, identity });
      toast.success(t('meetings.removed'));
    } catch {
      toast.error(t('meetings.removedFailed', { defaultValue: 'Could not remove participant' }));
    }
  };

  // ── Media effects, captions, cloud recording ───────────────────────────────
  // Both WASM-backed features are probed only while the settings popover is
  // open: a participant who never opens it never downloads MediaPipe's
  // segmentation model or the Krisp filter.
  const settingsOpen = dockMenu === 'settings';
  /** `useLocalParticipant` hands back a publication; the processor needs the track. */
  const localVideoTrack = cameraTrack?.track as LocalVideoTrack | undefined;
  const effects = useVideoEffects(localVideoTrack);
  const noise = useNoiseFilter(settingsOpen);

  const [ccOn, setCcOn] = useState(false);
  const captions = useLiveCaptions({
    enabled: ccOn,
    language: i18n.language,
    micEnabled: mic.enabled,
    localIdentity,
    localName: localParticipant?.name || localIdentity,
  });
  const ccAvailable = captionsSupported();

  // Cloud recording. The meeting row is the shared truth for "is it running" —
  // every client subscribes to it, so the button state agrees across the call
  // even when a second host started it.
  const recordingSupport = useQuery(api.meetings.recordingConfigured, {});
  const meetingRow = useQuery(api.meetings.getByRoomName, { roomName });
  const startRecording = useAction(api.meetingsActions.startRecording);
  const stopRecording = useAction(api.meetingsActions.stopRecording);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const cloudRecording = Boolean(
    meetingRow && 'egressId' in meetingRow ? meetingRow.egressId : false,
  );
  const recordingReady = recordingSupport?.configured !== false;

  const toggleRecording = async () => {
    if (recordingBusy) return;
    if (recordingSupport && !recordingSupport.configured) {
      toast.error(
        recordingSupport.livekit ? t('meetings.recordNoStorage') : t('meetings.recordNoLivekit'),
      );
      return;
    }
    setRecordingBusy(true);
    try {
      if (cloudRecording) {
        await stopRecording({ roomName });
        toast.success(t('meetings.recordStopped'));
      } else {
        const result = await startRecording({ roomName });
        if (!result.configured) toast.error(t('meetings.recordNoStorage'));
        else if (result.alreadyRunning) toast(t('meetings.recordAlready'));
        else toast.success(t('meetings.recordStarted'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('meetings.actionFailed'));
    } finally {
      setRecordingBusy(false);
    }
  };

  // ── Participants / layout ──────────────────────────────────────────────────
  const participants = useMemo(() => {
    const seen = new Set<string>();
    return [localParticipant, ...remotes].filter((p) => {
      const key = p.identity || p.sid;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }) as Participant[];
  }, [localParticipant, remotes]);
  const speakingSet = useMemo(() => new Set(speaking.map((p) => p.identity)), [speaking]);

  // Prune hands of participants who left the call.
  useEffect(() => {
    const ids = new Set(participants.map((p) => p.identity || p.sid));
    setHands((prev) => {
      const next: Record<string, boolean> = {};
      let changed = false;
      for (const [key, value] of Object.entries(prev)) {
        if (ids.has(key)) next[key] = value;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [participants]);

  const handsCount = participants.filter((p) => hands[p.identity || p.sid]).length;

  // ── Host rotation (Zoom-style) ───────────────────────────────────────────
  // `localRole` / `canModerate` are already computed above from the JWT
  // metadata so we can hand them straight to the dialog actions.
  const assignCohost = useAction(api.meetingsActions.assignCohost);
  const reclaimHost = useAction(api.meetingsActions.reclaimHost);
  const updateLobby = useMutation(api.meetings.updateLobbyAndRegistration);
  const [leaveDialog, setLeaveDialog] = useState<null | {
    busy: boolean;
    pickedIdentity: string;
  }>(null);
  const [reclaimDialog, setReclaimDialog] = useState<{
    busy: boolean;
    /** Snapshot of the cohost list when the dialog opened. */
    cohostIds: string[];
  } | null>(null);

  /**
   * Show the reclaim dialog once per session, when the local user is the
   * original host and at least one co-host from the meeting row is currently
   * in the room. The list passed via props is a live Convex query, so the
   * moment a co-host leaves the room we close the dialog and never re-prompt.
   */
  const reclaimPromptedRef = useRef(false);
  useEffect(() => {
    if (reclaimPromptedRef.current) return;
    if (!isOriginalHost) return;
    const liveCohosts = cohostIds.filter(
      (id) => id !== localIdentity && participants.some((p) => (p.identity || p.sid) === id),
    );
    if (liveCohosts.length === 0) return;
    reclaimPromptedRef.current = true;
    setReclaimDialog({ busy: false, cohostIds: liveCohosts });
  }, [isOriginalHost, cohostIds, localIdentity, participants]);

  // If the last co-host leaves the room while the dialog is open, close it
  // automatically — there is no one left to hand the seat to.
  useEffect(() => {
    if (!reclaimDialog) return;
    const stillThere = reclaimDialog.cohostIds.some((id) =>
      participants.some((p) => (p.identity || p.sid) === id),
    );
    if (!stillThere) setReclaimDialog(null);
  }, [reclaimDialog, participants]);

  const closeReclaimDialog = () => setReclaimDialog(null);

  const handleReclaim = async () => {
    if (!reclaimDialog || reclaimDialog.busy) return;
    setReclaimDialog((state) => (state ? { ...state, busy: true } : state));
    try {
      await reclaimHost({ roomName });
      toast.success(t('meetings.reclaimHostDone', { defaultValue: 'You are the host again' }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('meetings.actionFailed'));
    } finally {
      setReclaimDialog(null);
    }
  };

  const handleStayCohost = () => {
    setReclaimDialog(null);
  };

  /** Host only — prompt before leaving. */
  const handleLeaveClick = () => {
    if (!isHost || participants.length <= 1) {
      // No one else to hand the room to: just end for everyone (the existing
      // `onDisconnected` flow will flip the status to `ended`).
      onLeave();
      return;
    }
    const firstOther = participants.find((p) => (p.identity || p.sid) !== localIdentity);
    setLeaveDialog({
      busy: false,
      pickedIdentity: firstOther ? firstOther.identity || firstOther.sid : '',
    });
  };

  const handleEndForAll = () => {
    setLeaveDialog(null);
    onLeave();
  };

  const handleAssignAndLeave = async () => {
    if (!leaveDialog || leaveDialog.busy) return;
    const picked = leaveDialog.pickedIdentity;
    if (!picked) return;
    setLeaveDialog((state) => (state ? { ...state, busy: true } : state));
    try {
      await assignCohost({ roomName, newCohostIdentity: picked });
      toast.success(
        t('meetings.cohostAssigned', { defaultValue: 'Co-host assigned — leaving the meeting' }),
      );
      onLeave();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('meetings.actionFailed'));
      setLeaveDialog((state) => (state ? { ...state, busy: false } : state));
    }
  };

  // ── Pin / spotlight ────────────────────────────────────────────────────────
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const togglePin = (identity: string) =>
    setPinnedId((prev) => (prev === identity ? null : identity));

  // Drop the pin if that participant leaves, otherwise the stage stays empty.
  useEffect(() => {
    if (!pinnedId) return;
    if (!participants.some((p) => (p.identity || p.sid) === pinnedId)) setPinnedId(null);
  }, [participants, pinnedId]);

  // ── Sticky active speaker ──────────────────────────────────────────────────
  // `useSpeakingParticipants` flips on every audio-level threshold crossing, so
  // two people talking over each other made the stage ping-pong. A speaker now
  // has to hold the floor for a moment before the stage follows.
  const loudest = speaking[0]?.identity ?? '';
  const [stickySpeaker, setStickySpeaker] = useState('');
  useEffect(() => {
    if (!loudest) return;
    const timer = window.setTimeout(() => setStickySpeaker(loudest), 700);
    return () => window.clearTimeout(timer);
  }, [loudest]);

  // ── Presence toasts ────────────────────────────────────────────────────────
  // The first pass only records who is already here — joining a running meeting
  // should not fire a toast per person.
  const knownRef = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const current = new Map(
      participants.map((p) => [p.identity || p.sid, p.name || p.identity || '']),
    );
    const known = knownRef.current;
    knownRef.current = current;
    if (!known) return;
    for (const [id, name] of current) {
      if (!known.has(id) && id !== localIdentity) {
        toast(t('meetings.participantJoined', { name: name || id }), {
          icon: <Users className="h-4 w-4 text-(--brand)" />,
        });
      }
    }
    for (const [id, name] of known) {
      if (!current.has(id)) {
        toast(t('meetings.participantLeft', { name: name || id }), {
          icon: <Users className="h-4 w-4 text-white/50" />,
        });
      }
    }
  }, [participants, localIdentity, t]);

  const [layout, setLayout] = useState<'grid' | 'speaker'>('grid');
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  const screenShares = useTracks([Track.Source.ScreenShare]);
  const activeShare = screenShares.find(
    (ref) => ref.publication?.track && !ref.publication?.isMuted,
  );
  const shareTrack = activeShare?.publication?.track;

  // Speaker view: the pinned tile wins, otherwise the sticky active speaker (or
  // the first remote) takes the stage.
  const pinnedParticipant = useMemo(
    () => participants.find((p) => (p.identity || p.sid) === pinnedId) ?? null,
    [participants, pinnedId],
  );

  const focusParticipant = useMemo(() => {
    if (shareTrack) return null;
    if (pinnedParticipant) return pinnedParticipant;
    if (layout !== 'speaker' || participants.length <= 1) return null;
    const speaker = stickySpeaker ? participants.find((p) => p.identity === stickySpeaker) : null;
    return (
      speaker ?? participants.find((p) => p.identity !== localIdentity) ?? participants[0] ?? null
    );
  }, [layout, shareTrack, pinnedParticipant, participants, stickySpeaker, localIdentity]);

  // ── Chat state ─────────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatOpen]);

  // Unread = messages that arrived since the panel was last open. Counting
  // renders instead of messages used to show a "1" before anyone had typed.
  const seenCount = useRef(0);
  useEffect(() => {
    if (chatOpen) {
      seenCount.current = chatMessages.length;
      setUnread(0);
      return;
    }
    setUnread(Math.max(0, chatMessages.length - seenCount.current));
  }, [chatOpen, chatMessages.length]);

  /** Send the draft. Swallows failures — chat is best-effort, not a receipt. */
  const submitChat = async () => {
    const text = chatDraft.trim();
    if (!text) return;
    try {
      await send(text);
      setChatDraft('');
    } catch {
      /* chat is best-effort */
    }
  };

  const react = async (emoji: string) => {
    // Show on own tile immediately
    const localId = localParticipant?.identity || '';
    pushTileReaction(emoji, localId);
    pushCascadeReaction(emoji);
    try {
      const payload = JSON.stringify({ emoji, identity: localId });
      await sendReaction(new TextEncoder().encode(payload), { reliable: true });
    } catch {
      /* reactions are best-effort */
    }
  };

  // Turn a track on/off, and surface device/permission rejections (e.g. the
  // user dismissing the screen-share picker) as a friendly toast instead of an
  // unhandled promise rejection.
  const toggleTrack = async (toggle: () => Promise<unknown>, deniedMessage: string) => {
    try {
      await toggle();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        toast.error(deniedMessage);
      } else {
        toast.error(t('meetings.trackError', { defaultValue: 'Could not toggle' }));
      }
    }
  };

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  // Everything the listener needs lives in a ref, so the listener is attached
  // once instead of on every render (and never fires against a stale toggle).
  const actionsRef = useRef({
    micEnabled: false,
    toggleMic: () => {},
    toggleCam: () => {},
    toggleShare: () => {},
    toggleHand: () => {},
    toggleChat: () => {},
    toggleParticipants: () => {},
    toggleFullscreen: () => {},
    toggleShortcuts: () => {},
    toggleCaptions: () => {},
    setMic: (_on: boolean) => {},
  });
  actionsRef.current = {
    micEnabled: mic.enabled,
    toggleMic: () => void toggleTrack(() => mic.toggle(), t('meetings.micDenied')),
    toggleCam: () => void toggleTrack(() => cam.toggle(), t('meetings.camDenied')),
    toggleShare: () => void toggleTrack(() => share.toggle(), t('meetings.shareDenied')),
    toggleHand,
    toggleChat: () => setChatOpen((open) => !open),
    toggleParticipants: () => setParticipantsOpen((open) => !open),
    toggleFullscreen,
    toggleShortcuts: () => setDockMenu((menu) => (menu === 'shortcuts' ? null : 'shortcuts')),
    toggleCaptions: () => setCcOn((on) => !on),
    setMic: (on: boolean) => {
      void localParticipant?.setMicrophoneEnabled(on);
    },
  };

  useEffect(() => {
    // Never hijack typing, and never steal Space/Enter from a focused control.
    const isInteractive = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(el.tagName));

    let pushingToTalk = false;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isInteractive(event.target)) return;
      const actions = actionsRef.current;

      // Hold Space to talk — only meaningful while muted, and the mic goes back
      // down on key-up (or if the window loses focus mid-sentence).
      if (event.code === 'Space') {
        event.preventDefault();
        if (event.repeat || pushingToTalk || actions.micEnabled) return;
        pushingToTalk = true;
        actions.setMic(true);
        return;
      }

      switch (event.key.toLowerCase()) {
        case 'm':
          actions.toggleMic();
          break;
        case 'v':
          actions.toggleCam();
          break;
        case 's':
          actions.toggleShare();
          break;
        case 'h':
          actions.toggleHand();
          break;
        case 'c':
          actions.toggleChat();
          break;
        case 'p':
          actions.toggleParticipants();
          break;
        case 'f':
          actions.toggleFullscreen();
          break;
        case 't':
          actions.toggleCaptions();
          break;
        case '?':
          actions.toggleShortcuts();
          break;
        default:
          return;
      }
      event.preventDefault();
    };

    const releasePushToTalk = () => {
      if (!pushingToTalk) return;
      pushingToTalk = false;
      actionsRef.current.setMic(false);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') releasePushToTalk();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releasePushToTalk);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releasePushToTalk);
      releasePushToTalk();
    };
  }, []);

  // Escape closes whichever dock popover is open.
  useEffect(() => {
    if (!dockMenu) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDockMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dockMenu]);

  const shortcutRows = [
    { keys: 'M', label: t('meetings.microphone') },
    { keys: 'V', label: t('meetings.camera') },
    { keys: 'S', label: t('meetings.share') },
    { keys: 'H', label: t('meetings.raiseHand') },
    { keys: 'C', label: t('meetings.chat') },
    { keys: 'P', label: t('meetings.participants') },
    { keys: 'F', label: t('meetings.fullscreen') },
    { keys: 'T', label: t('meetings.cc.title') },
    { keys: 'Space', label: t('meetings.pushToTalk') },
  ];

  const n = participants.length;
  // Square-ish grid so the tiles fill the stage instead of hugging a fixed
  // column count (2 people side by side, 4 in a 2×2, 9 in a 3×3 …).
  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(n))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const youName = t('meetings.you', { defaultValue: 'You' });
  const others = participants.filter((p) => p.identity !== localIdentity);

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const isSameDay = (a: number, b: number) =>
    new Date(a).toDateString() === new Date(b).toDateString();

  const fmtDay = (ts: number) =>
    new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' });

  const fmtElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (val: number) => String(val).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  const filmstrip = (list: Participant[]) => (
    <div className="flex shrink-0 gap-3 overflow-x-auto pb-1">
      {list.map((p) => (
        <div key={p.identity || p.sid} className="w-44 shrink-0">
          <MeetingTile
            participant={p}
            isLocal={p.identity === localIdentity}
            speaking={speakingSet.has(p.identity)}
            handRaised={!!hands[p.identity || p.sid]}
            fallbackName={youName}
            reactions={tileReactions[p.identity || p.sid]}
            pinned={pinnedId === (p.identity || p.sid)}
            onTogglePin={() => togglePin(p.identity || p.sid)}
            className="aspect-video"
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[radial-gradient(1100px_520px_at_50%_-12%,rgb(37_99_235/0.14),transparent)]">
      {/* ── Header ── */}
      <header className="relative z-30 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/10 bg-[#0d1017]/85 px-3 py-2 backdrop-blur-xl sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--brand)/20">
            <Video className="h-4 w-4 text-[#608ffa]" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-white">{title}</h1>
            <div className="flex items-center gap-2 text-[11px] text-white/55">
              <span
                className={cn(
                  'inline-flex items-center gap-1',
                  statusKey === 'live' && 'text-emerald-400',
                )}
              >
                <Radio className={cn('h-3 w-3', statusKey === 'live' && 'animate-pulse')} />
                {t(`meetings.status.${statusKey}`)}
              </span>
              <span className="text-white/25">•</span>
              <span className="font-mono">{fmtElapsed(elapsed)}</span>
              <span className="text-white/25">•</span>
              <span>{mode === 'webinar' ? t('meetings.webinar') : t('meetings.meeting')}</span>
            </div>
          </div>
        </div>

        {/* Avatar stack */}
        <div className="hidden items-center gap-2 pl-1 md:flex">
          <div className="flex -space-x-2">
            {others.slice(0, 4).map((p) => (
              <span
                key={p.identity || p.sid}
                title={p.name || p.identity}
                className="flex size-7 items-center justify-center rounded-full border-2 border-[#0d1017] bg-[#1c2233] text-[10px] font-semibold text-white/85"
              >
                {getInitials(p.name || p.identity || '?')}
              </span>
            ))}
            {others.length > 4 && (
              <span className="flex size-7 items-center justify-center rounded-full border-2 border-[#0d1017] bg-white/10 text-[10px] font-semibold text-white/70">
                +{others.length - 4}
              </span>
            )}
          </div>
          <span className="text-xs tabular-nums text-white/55">{n}</span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {(isRecording || cloudRecording) && (
            <span className="flex h-9 items-center gap-1.5 rounded-xl bg-red-500/15 px-2.5 text-[11px] font-semibold text-red-300 ring-1 ring-red-500/30">
              <span className="size-2 animate-pulse rounded-full bg-red-400" />
              {t('meetings.recording')}
            </span>
          )}
          {handsCount > 0 && (
            <button
              type="button"
              onClick={() => setParticipantsOpen(true)}
              title={t('meetings.handsRaised', { count: handsCount })}
              className="meeting-hand-badge flex h-9 items-center gap-1.5 rounded-xl bg-amber-400/90 px-3 text-xs font-bold text-amber-950 shadow-lg shadow-amber-400/30 transition hover:bg-amber-300"
            >
              <Hand className="h-3.5 w-3.5" />
              {handsCount}
            </button>
          )}
          {pinnedParticipant ? (
            <IconBtn title={t('meetings.unpin')} onClick={() => setPinnedId(null)}>
              <PinOff className="h-4 w-4 text-(--brand)" />
            </IconBtn>
          ) : (
            !shareTrack && (
              <IconBtn
                title={layout === 'grid' ? t('meetings.speakerView') : t('meetings.gridView')}
                onClick={() => setLayout((l) => (l === 'grid' ? 'speaker' : 'grid'))}
              >
                {layout === 'grid' ? (
                  <Presentation className="h-4 w-4" />
                ) : (
                  <LayoutGrid className="h-4 w-4" />
                )}
              </IconBtn>
            )
          )}
          <IconBtn
            title={isFullscreen ? t('meetings.exitFullscreen') : t('meetings.fullscreen')}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </IconBtn>
          <IconBtn
            title={linkCopied ? t('meetings.copied') : t('meetings.copyLink')}
            onClick={onCopyLink}
          >
            {linkCopied ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Link2 className="h-4 w-4" />
            )}
          </IconBtn>
        </div>
      </header>

      {/* ── Content area: stage + side panel ── */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* ── Stage ── */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-4 pb-28">
          {shareTrack && (
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black shadow-[0_2px_12px_-2px_rgba(0,0,0,0.35)]">
              <VideoSurface track={shareTrack} className="object-contain" />
              <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/55 px-2 py-1 backdrop-blur-sm">
                <MonitorUp className="h-3 w-3 text-(--brand)" />
                <span className="max-w-48 truncate text-[11px] font-medium text-white/90">
                  {activeShare?.participant?.name ||
                    t('meetings.screenShare', { defaultValue: 'Screen share' })}
                </span>
              </div>
            </div>
          )}

          {shareTrack ? (
            filmstrip(participants)
          ) : focusParticipant ? (
            <>
              <div className="relative min-h-0 flex-1">
                <MeetingTile
                  participant={focusParticipant}
                  isLocal={focusParticipant.identity === localIdentity}
                  speaking={speakingSet.has(focusParticipant.identity)}
                  handRaised={!!hands[focusParticipant.identity || focusParticipant.sid]}
                  fallbackName={youName}
                  reactions={tileReactions[focusParticipant.identity || focusParticipant.sid]}
                  pinned={pinnedId === (focusParticipant.identity || focusParticipant.sid)}
                  onTogglePin={() => togglePin(focusParticipant.identity || focusParticipant.sid)}
                  className="h-full"
                />
              </div>
              {filmstrip(participants.filter((p) => p.identity !== focusParticipant.identity))}
            </>
          ) : (
            <div
              className={cn(
                'mx-auto grid min-h-0 w-full flex-1 gap-4',
                n <= 1 && 'max-w-5xl',
                n === 2 && 'max-w-6xl',
                n >= 3 && 'max-w-[1500px]',
              )}
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }}
            >
              {participants.map((p) => (
                <MeetingTile
                  key={p.identity || p.sid}
                  participant={p}
                  isLocal={p.identity === localIdentity}
                  speaking={speakingSet.has(p.identity)}
                  handRaised={!!hands[p.identity || p.sid]}
                  fallbackName={youName}
                  reactions={tileReactions[p.identity || p.sid]}
                  pinned={pinnedId === (p.identity || p.sid)}
                  onTogglePin={n > 1 ? () => togglePin(p.identity || p.sid) : undefined}
                  className="h-full"
                />
              ))}
            </div>
          )}

          {/* Waiting alone — the most common reason a meeting feels broken is
              that nobody was given the link. */}
          {n === 1 && !shareTrack && (
            <div className="shrink-0 self-center rounded-2xl border border-white/10 bg-[#141824]/85 px-4 py-3 text-center shadow-xl backdrop-blur-xl">
              <p className="text-sm font-semibold text-white/90">{t('meetings.alone')}</p>
              <p className="mt-0.5 text-[11px] text-white/45">{t('meetings.aloneHint')}</p>
              <button
                type="button"
                onClick={onCopyLink}
                className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-(--brand)/25 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-(--brand)/40"
              >
                {linkCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                {linkCopied ? t('meetings.copied') : t('meetings.copyLink')}
              </button>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        {/* Wide screens: it takes its own column next to the stage. Narrow
            screens: it floats over the stage, otherwise the video is squeezed
            into a sliver. */}
        {(chatOpen || participantsOpen) && (
          <div
            role="presentation"
            onClick={() => {
              setChatOpen(false);
              setParticipantsOpen(false);
            }}
            className="absolute inset-0 z-30 bg-black/45 lg:hidden"
          />
        )}
        <div
          className={cn(
            'flex shrink-0 flex-col gap-3 overflow-hidden transition-[width] duration-300 ease-in-out',
            'max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-40 max-lg:pb-24',
            chatOpen || participantsOpen ? 'w-[min(21.25rem,92vw)] px-3 pt-3' : 'w-0',
          )}
        >
          {chatOpen && (
            <section className="meeting-panel-in flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-[#141824]/95 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white/90">
                    {t('meetings.chat', { defaultValue: 'Chat' })}
                  </p>
                  <p className="text-[10px] text-white/40">
                    {t('meetings.chatToAll', { defaultValue: 'Everyone' })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  className="flex size-6 shrink-0 items-center justify-center rounded-lg text-xs text-white/50 transition hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="chat-scroll flex-1 space-y-2.5 overflow-y-auto px-3 py-3">
                {chatMessages.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-2 pt-6 text-center">
                    <span className="flex size-10 items-center justify-center rounded-2xl bg-(--brand)/15 text-(--brand)">
                      <MessageSquare className="h-5 w-5" />
                    </span>
                    <p className="text-xs text-white/40">
                      {t('meetings.chatEmpty', { defaultValue: 'No messages yet' })}
                    </p>
                  </div>
                )}
                {chatMessages.map((m, i) => {
                  const mine = m.from?.identity === localIdentity;
                  const sender = m.from?.name ?? m.from?.identity ?? t('meetings.you');
                  const prev = chatMessages[i - 1];
                  const groupStart =
                    !prev ||
                    (prev.from?.identity ?? '') !== (m.from?.identity ?? '') ||
                    m.timestamp - prev.timestamp > 2 * 60 * 1000;
                  const newDay = !prev || !isSameDay(m.timestamp, prev.timestamp);
                  return (
                    <div key={m.id ?? i}>
                      {newDay && (
                        <div className="my-2 flex items-center gap-3">
                          <span className="h-px flex-1 bg-white/10" />
                          <span className="text-[9px] font-medium tracking-wide text-white/35 uppercase">
                            {isSameDay(m.timestamp, Date.now())
                              ? t('meetings.today', { defaultValue: 'Today' })
                              : fmtDay(m.timestamp)}
                          </span>
                          <span className="h-px flex-1 bg-white/10" />
                        </div>
                      )}
                      <div className={cn('flex items-end gap-2', mine && 'flex-row-reverse')}>
                        {!mine && groupStart && (
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2b3550] to-[#1a2133] text-[9px] font-bold text-white/70">
                            {getInitials(sender)}
                          </span>
                        )}
                        <div
                          className={cn(
                            'max-w-[80%] px-3 py-2',
                            groupStart ? 'rounded-2xl' : 'rounded-2xl',
                            mine ? 'bg-(--brand)/25 text-white/90' : 'bg-white/10 text-white/85',
                          )}
                        >
                          {!mine && groupStart && (
                            <p className="mb-0.5 text-[10px] font-semibold text-(--brand)">
                              {sender}
                            </p>
                          )}
                          <p className="break-words text-[12px] leading-relaxed whitespace-pre-wrap">
                            {m.message}
                          </p>
                          <p className="mt-0.5 text-right text-[9px] text-white/30">
                            {fmtTime(m.timestamp)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              <div className="border-t border-white/10 p-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitChat();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder={t('meetings.chatPlaceholder')}
                    className="flex-1 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-white/85 placeholder:text-white/30 focus:border-(--brand)/50 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!chatDraft.trim()}
                    className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-(--brand)/80 text-white transition hover:bg-(--brand) disabled:opacity-30"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>
            </section>
          )}
          {participantsOpen && (
            <section className="meeting-panel-in flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-[#141824]/95 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white/90">
                    {t('meetings.participants', { defaultValue: 'Participants' })} ({n})
                  </p>
                  <p className="text-[10px] text-white/40">
                    {t('meetings.inMeeting', { defaultValue: 'In meeting' })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setParticipantsOpen(false)}
                  className="flex size-6 shrink-0 items-center justify-center rounded-lg text-xs text-white/50 transition hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>
              {canModerate && (
                <div className="px-3 pt-3">
                  <button
                    type="button"
                    onClick={handleMuteEveryone}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                  >
                    <MicOff className="h-3.5 w-3.5" />
                    {t('meetings.muteAll')}
                  </button>
                </div>
              )}
              {/* Host-only: incoming visitors waiting for admission. The host
                  mints an invite URL here and shares it with the visitor. */}
              {isHost && waitingRoomEnabled && (
                <LobbyPanel roomName={roomName} />
              )}
              <div className="flex-1 space-y-1 overflow-y-auto p-2">
                {participants.map((p) => (
                  <ParticipantRow
                    key={p.identity || p.sid}
                    participant={p}
                    localIdentity={localIdentity}
                    hands={hands}
                    canModerate={canModerate}
                    onToggleMic={(id, micMuted) => void handleToggleMic(p, id, micMuted)}
                    onToggleCam={(id, camMuted) => void handleToggleCam(p, id, camMuted)}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* ── Bottom cascade reactions ── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 overflow-hidden">
        {cascadeReactions.map((r) => (
          <div
            key={r.id}
            className="meeting-reaction-cascade absolute bottom-0"
            style={{ left: `calc(50% + ${r.x}px)` }}
          >
            <span className="meeting-tile-reaction inline-block drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
              <AnimatedEmoji emoji={r.emoji} size={48} />
            </span>
          </div>
        ))}
      </div>

      {/* ── Connection banner ── */}
      {connectionState !== 'connected' && connectionState !== 'connecting' && (
        <div className="absolute top-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300 shadow-lg backdrop-blur">
          <WifiOff className="h-3.5 w-3.5" />
          {t('meetings.connectionLost', { defaultValue: 'Connection lost — reconnecting…' })}
        </div>
      )}

      {/* ── Control dock ── */}
      <div className="absolute inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-3 pb-5">
        {/* Popovers sit above the dock so the dock itself stays one row. */}
        {dockMenu === 'reactions' && (
          <div className="meeting-panel-in flex items-center gap-1 rounded-2xl border border-white/10 bg-[#141824]/95 px-2 py-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  void react(emoji);
                  setDockMenu(null);
                }}
                className="rounded-xl px-2 py-1 text-xl transition hover:scale-125 hover:bg-white/10"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        {dockMenu === 'settings' && (
          <div className="meeting-panel-in max-h-[70vh] w-[min(26rem,94vw)] overflow-y-auto rounded-2xl border border-white/10 bg-[#141824]/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-xl">
            <p className="mb-2 text-xs font-semibold text-white/85">{t('meetings.settings')}</p>
            <DeviceSettings
              choices={deviceChoices}
              onChange={onDeviceChange}
              tone="dark"
              className="sm:grid-cols-3"
            />

            <div className="mt-3 border-t border-white/10 pt-3">
              <SwitchRow
                icon={<Waves className="h-3.5 w-3.5" />}
                label={t('meetings.noiseFilter.title')}
                hint={
                  noise.supported === false
                    ? t('meetings.noiseFilter.unsupported')
                    : noise.failed
                      ? t('meetings.noiseFilter.failed')
                      : t('meetings.noiseFilter.hint')
                }
                checked={noise.enabled}
                pending={noise.pending}
                disabled={noise.supported === false}
                onChange={(on) => void noise.toggle(on)}
              />
            </div>

            <div className="mt-3 border-t border-white/10 pt-3">
              <BackgroundPicker
                effect={effects.effect}
                pending={effects.pending}
                supported={effects.supported}
                failed={effects.failed}
                hasCamera={Boolean(localVideoTrack)}
                tone="dark"
                onSelect={effects.setEffect}
              />
            </div>

            {/* Host-only meeting settings: two independent toggles — waiting
                room and registration form — plus a form-fields editor. */}
            {isHost && (
              <MeetingSettings
                initialWaitingRoomEnabled={waitingRoomEnabled}
                initialRegistrationEnabled={Boolean(
                  meetingRow && 'registrationEnabled' in meetingRow
                    ? meetingRow.registrationEnabled
                    : false,
                )}
                onUpdate={async (next) => {
                  try {
                    await updateLobby({
                      roomName,
                      waitingRoomEnabled: next.waitingRoomEnabled,
                      registrationEnabled: next.registrationEnabled,
                      registrationFields: next.registrationFields,
                    });
                    toast.success(t('meetings.settingsSaved'));
                  } catch (err) {
                    toast.error(
                      err instanceof Error ? err.message : t('meetings.actionFailed'),
                    );
                  }
                }}
              />
            )}
          </div>
        )}
        {dockMenu === 'shortcuts' && (
          <div className="meeting-panel-in w-[min(20rem,92vw)] rounded-2xl border border-white/10 bg-[#141824]/95 p-3 shadow-2xl shadow-black/60 backdrop-blur-xl">
            <p className="mb-2 text-xs font-semibold text-white/85">{t('meetings.shortcuts')}</p>
            <ul className="grid gap-1">
              {shortcutRows.map((row) => (
                <li key={row.keys} className="flex items-center justify-between gap-3">
                  <span className="truncate text-[11px] text-white/60">{row.label}</span>
                  <kbd className="rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/70">
                    {row.keys}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Live captions ── */}
        {ccOn && (
          <div
            aria-live="polite"
            className="meeting-panel-in w-[min(48rem,96vw)] rounded-2xl border border-white/10 bg-black/70 px-3 py-2 shadow-2xl shadow-black/60 backdrop-blur-xl"
          >
            {captions.lines.length === 0 ? (
              <p className="text-center text-[11px] text-white/45">
                {!ccAvailable || captions.error === 'unsupported'
                  ? t('meetings.cc.unsupported')
                  : captions.error === 'denied'
                    ? t('meetings.cc.denied')
                    : mic.enabled
                      ? t('meetings.cc.listening')
                      : t('meetings.cc.muted')}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {captions.lines.map((line) => (
                  <CaptionRow
                    key={`${line.identity}-${line.final ? line.at : 'interim'}`}
                    line={line}
                    isLocal={line.identity === localIdentity}
                    youName={youName}
                  />
                ))}
              </ul>
            )}
            <p className="mt-1 text-center text-[9px] text-white/30">{t('meetings.cc.notice')}</p>
          </div>
        )}

        <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-[#141824]/85 px-2.5 py-2 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <RedDockBtn
            icon={<Mic className="h-4.5 w-4.5" />}
            label={`${mic.enabled ? t('meetings.micOn') : t('meetings.micOff')} · M`}
            onClick={() => toggleTrack(() => mic.toggle(), t('meetings.micDenied'))}
          />
          <RedDockBtn
            icon={<Video className="h-4.5 w-4.5" />}
            label={`${cam.enabled ? t('meetings.camOn') : t('meetings.camOff')} · V`}
            onClick={() => toggleTrack(() => cam.toggle(), t('meetings.camDenied'))}
          />
          <DockBtn
            on={share.enabled}
            onIcon={<MonitorUp className="h-4.5 w-4.5" />}
            offIcon={<MonitorOff className="h-4.5 w-4.5" />}
            label={`${t('meetings.share')} · S`}
            onClick={() => toggleTrack(() => share.toggle(), t('meetings.shareDenied'))}
          />

          <div className="mx-1 h-7 w-px bg-white/10" />

          <DockToggle
            active={dockMenu === 'reactions'}
            label={t('meetings.reactions')}
            onClick={() => setDockMenu((menu) => (menu === 'reactions' ? null : 'reactions'))}
          >
            <Smile className="h-4.5 w-4.5" />
          </DockToggle>

          <button
            type="button"
            onClick={toggleHand}
            title={`${handRaised ? t('meetings.lowerHand') : t('meetings.raiseHand')} · H`}
            className={cn(
              'flex size-11 items-center justify-center rounded-xl transition-all hover:scale-105',
              handRaised
                ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/40'
                : 'bg-white/10 text-white hover:bg-white/15',
            )}
          >
            <Hand className="h-4.5 w-4.5" />
          </button>

          <DockToggle
            active={chatOpen}
            label={`${t('meetings.chat')} · C`}
            badge={!chatOpen && unread > 0 ? { text: String(unread), tone: 'red' } : undefined}
            onClick={() => setChatOpen((open) => !open)}
          >
            <MessageSquare className="h-4.5 w-4.5" />
          </DockToggle>

          <DockToggle
            active={participantsOpen}
            label={`${t('meetings.participants')} · P`}
            badge={
              !participantsOpen && handsCount > 0
                ? { text: String(handsCount), tone: 'amber' }
                : undefined
            }
            onClick={() => setParticipantsOpen((open) => !open)}
          >
            <Users className="h-4.5 w-4.5" />
          </DockToggle>

          <DockToggle
            active={ccOn}
            label={`${t('meetings.cc.title')} · T`}
            onClick={() => setCcOn((on) => !on)}
          >
            {ccOn ? <Captions className="h-4.5 w-4.5" /> : <CaptionsOff className="h-4.5 w-4.5" />}
          </DockToggle>

          <div className="mx-1 h-7 w-px bg-white/10" />

          {isHost && (
            <button
              type="button"
              onClick={() => void toggleRecording()}
              disabled={recordingBusy}
              aria-pressed={cloudRecording}
              title={
                !recordingReady
                  ? t('meetings.recordUnavailable')
                  : cloudRecording
                    ? t('meetings.recordStop')
                    : t('meetings.recordStart')
              }
              className={cn(
                'flex size-11 items-center justify-center rounded-xl transition',
                recordingBusy && 'cursor-wait',
                cloudRecording
                  ? 'bg-red-500/85 text-white shadow-lg shadow-red-500/30 hover:bg-red-500'
                  : recordingReady
                    ? 'text-white/70 hover:bg-white/10'
                    : 'text-white/30',
              )}
            >
              {recordingBusy ? (
                <Loader2 className="h-4.5 w-4.5 animate-spin" />
              ) : cloudRecording ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <Circle className="h-4.5 w-4.5" />
              )}
            </button>
          )}

          <DockToggle
            active={dockMenu === 'settings'}
            label={t('meetings.settings')}
            onClick={() => setDockMenu((menu) => (menu === 'settings' ? null : 'settings'))}
          >
            <Settings className="h-4.5 w-4.5" />
          </DockToggle>

          <DockToggle
            active={dockMenu === 'shortcuts'}
            label={`${t('meetings.shortcuts')} · ?`}
            className="hidden sm:flex"
            onClick={() => setDockMenu((menu) => (menu === 'shortcuts' ? null : 'shortcuts'))}
          >
            <Keyboard className="h-4.5 w-4.5" />
          </DockToggle>

          <button
            type="button"
            onClick={handleLeaveClick}
            className="ml-1 flex h-11 items-center gap-2 rounded-xl bg-red-500/90 px-4 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-500"
          >
            <PhoneOff className="h-4.5 w-4.5" />
            {t('meetings.leave')}
          </button>
        </div>
      </div>

      {/* Host leave dialog — only opens when there is at least one other
          participant to hand the room to. Otherwise the existing flow simply
          ends the meeting. */}
      <AlertDialog
        open={leaveDialog !== null}
        onOpenChange={(open) => {
          if (!open && !leaveDialog?.busy) setLeaveDialog(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('meetings.leaveHostTitle', { defaultValue: 'Leave the meeting?' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('meetings.leaveHostDesc', {
                defaultValue:
                  'You are the host. Choose what happens when you leave — the meeting will continue for everyone else.',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {leaveDialog && (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-white/65">
                {t('meetings.leaveHostPickCohost', {
                  defaultValue: 'Make someone a co-host before leaving',
                })}
              </p>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.04] p-1.5">
                {participants
                  .filter((p) => (p.identity || p.sid) !== localIdentity)
                  .map((p) => {
                    const id = p.identity || p.sid;
                    const selected = id === leaveDialog.pickedIdentity;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={leaveDialog.busy}
                        onClick={() =>
                          setLeaveDialog((state) =>
                            state ? { ...state, pickedIdentity: id } : state,
                          )
                        }
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition',
                          selected
                            ? 'bg-(--brand)/20 text-white'
                            : 'text-white/75 hover:bg-white/10',
                        )}
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#1c2233] text-[10px] font-bold text-white/85">
                          {getInitials(p.name || id)}
                        </span>
                        <span className="truncate">{p.name || id}</span>
                        {selected && <Check className="ml-auto h-3.5 w-3.5 text-(--brand)" />}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              disabled={leaveDialog?.busy}
              onClick={(event) => {
                event.preventDefault();
                void handleAssignAndLeave();
              }}
            >
              {leaveDialog?.busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {t('meetings.leaveHostAssign', {
                defaultValue: 'Make co-host and leave',
              })}
            </AlertDialogAction>
            <button
              type="button"
              disabled={leaveDialog?.busy}
              onClick={handleEndForAll}
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
            >
              {t('meetings.leaveHostEndAll', {
                defaultValue: 'End meeting for everyone',
              })}
            </button>
            <AlertDialogCancel disabled={leaveDialog?.busy}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reclaim host dialog — fires once when the original host joins a room
          that already has a co-host, matching the Zoom re-entry flow. */}
      <AlertDialog open={reclaimDialog !== null} onOpenChange={(open) => !open && closeReclaimDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('meetings.reclaimHostTitle', { defaultValue: 'Take back the host role?' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('meetings.reclaimHostDesc', {
                defaultValue:
                  'You handed this meeting to a co-host before. Reclaim the host seat or stay as a co-host for this session.',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              disabled={reclaimDialog?.busy}
              onClick={(event) => {
                event.preventDefault();
                void handleReclaim();
              }}
            >
              {reclaimDialog?.busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {t('meetings.reclaimHostAction', {
                defaultValue: 'Take back host',
              })}
            </AlertDialogAction>
            <AlertDialogCancel disabled={reclaimDialog?.busy} onClick={handleStayCohost}>
              {t('meetings.reclaimHostStay', {
                defaultValue: 'Stay as co-host',
              })}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
