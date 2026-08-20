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
 *    unmute, mute everyone and remove participants (server-side kick via
 *    `meetingsActions.removeParticipant`).
 *  - Speaker / grid layout toggle, fullscreen, participant avatar stack and a
 *    participants panel with per-row mic/cam/hand status.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Track, type Participant } from 'livekit-client';
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
} from '@livekit/components-react';
import { useAction } from 'convex/react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

function MeetingTile({
  participant,
  isLocal,
  speaking,
  handRaised,
  fallbackName,
  className,
}: {
  participant: Participant;
  isLocal: boolean;
  speaking: boolean;
  handRaised: boolean;
  fallbackName: string;
  className?: string;
}) {
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
        'group relative aspect-video min-h-0 overflow-hidden rounded-2xl bg-white/[0.06] transition-all duration-200',
        speaking
          ? 'ring-2 ring-(--brand) shadow-[0_0_0_4px_rgb(37_99_235/0.18),0_16px_48px_-16px_rgb(37_99_235/0.5)]'
          : 'shadow-[0_2px_12px_-2px_rgba(0,0,0,0.35)]',
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

      {handRaised && (
        <span
          title={fallbackName}
          className="meeting-hand-badge absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-amber-400 shadow-lg shadow-amber-400/40"
        >
          <Hand className="h-3.5 w-3.5 text-amber-950" />
        </span>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/50 px-2 py-1 backdrop-blur-sm">
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

function ParticipantRow({
  participant,
  localIdentity,
  hands,
  isHost,
  onMuteMic,
  onMuteCam,
  onAskUnmute,
  onRemove,
  onToggleSelfMic,
  onToggleSelfCam,
}: {
  participant: Participant;
  localIdentity: string;
  hands: Record<string, boolean>;
  isHost: boolean;
  onMuteMic: (identity: string) => void;
  onMuteCam: (identity: string) => void;
  onAskUnmute: (identity: string) => void;
  onRemove: (identity: string) => void;
  onToggleSelfMic?: () => void;
  onToggleSelfCam?: () => void;
}) {
  const { t } = useTranslation();
  const micRefs = useParticipantTracks([Track.Source.Microphone], participant.identity);
  const camRefs = useParticipantTracks([Track.Source.Camera], participant.identity);
  const micMuted = !micRefs[0]?.publication?.track || !!micRefs[0]?.publication?.isMuted;
  const camMuted = !camRefs[0]?.publication?.track || !!camRefs[0]?.publication?.isMuted;
  const isSelf = participant.identity === localIdentity;
  const isRowHost = participantRole(participant.metadata) === 'host';
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
      <button
        type="button"
        onClick={() => (isSelf ? onToggleSelfMic?.() : undefined)}
        className={cn(
          'shrink-0 rounded-md p-0.5 transition',
          isSelf && 'cursor-pointer hover:bg-white/10',
          micMuted ? 'text-red-400' : 'text-white/50',
        )}
        title={isSelf ? (micMuted ? t('meetings.micOn') : t('meetings.micOff')) : undefined}
      >
        {micMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={() => (isSelf ? onToggleSelfCam?.() : undefined)}
        className={cn(
          'shrink-0 rounded-md p-0.5 transition',
          isSelf && 'cursor-pointer hover:bg-white/10',
          camMuted ? 'text-red-400' : 'text-white/50',
        )}
        title={isSelf ? (camMuted ? t('meetings.camOn') : t('meetings.camOff')) : undefined}
      >
        {camMuted ? <VideoOff className="h-3.5 w-3.5" /> : <Video className="h-3.5 w-3.5" />}
      </button>
      {isHost && !isSelf && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
          <IconBtn
            title={t('meetings.muteMic')}
            onClick={() => onMuteMic(identity)}
            className="size-7 bg-white/[0.06] hover:bg-red-500/30 hover:text-red-300"
          >
            <MicOff className="h-3 w-3" />
          </IconBtn>
          <IconBtn
            title={t('meetings.muteCam')}
            onClick={() => onMuteCam(identity)}
            className="size-7 bg-white/[0.06] hover:bg-red-500/30 hover:text-red-300"
          >
            <VideoOff className="h-3 w-3" />
          </IconBtn>
          <IconBtn
            title={t('meetings.askUnmute')}
            onClick={() => onAskUnmute(identity)}
            className="size-7 bg-white/[0.06]"
          >
            <Mic className="h-3 w-3" />
          </IconBtn>
          <IconBtn
            title={t('meetings.remove')}
            onClick={() => onRemove(identity)}
            className="size-7 bg-white/[0.06] hover:bg-red-500/40 hover:text-red-200"
          >
            <X className="h-3 w-3" />
          </IconBtn>
        </div>
      )}
    </div>
  );
}

export function CustomConference(props: ConferenceProps) {
  const { roomName, title, statusKey, elapsed, mode, linkCopied, onCopyLink, onLeave } = props;
  const { t } = useTranslation();
  const { localParticipant } = useLocalParticipant();
  const remotes = useParticipants();
  const speaking = useSpeakingParticipants();
  const connectionState = useConnectionState();

  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const share = useTrackToggle({ source: Track.Source.ScreenShare });

  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState('');
  const { chatMessages, send } = useChat();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [unread, setUnread] = useState(0);

  const [floating, setFloating] = useState<{ id: number; emoji: string }[]>([]);
  const floatId = useRef(0);
  const pushReaction = (emoji: string) => {
    const id = ++floatId.current;
    setFloating((prev) => [...prev, { id, emoji }]);
    setTimeout(() => setFloating((prev) => prev.filter((f) => f.id !== id)), 2600);
  };
  useDataChannel('reactions', (msg) => {
    try {
      const emoji = new TextDecoder().decode(msg.payload as unknown as Uint8Array);
      if (emoji) pushReaction(emoji);
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
  const isHost = useMemo(
    () => participantRole(localParticipant?.metadata) === 'host',
    [localParticipant?.metadata],
  );
  const { send: sendHostCtrl } = useDataChannel('hostCtrl');
  const removeParticipant = useAction(api.meetingsActions.removeParticipant);

  useDataChannel('hostCtrl', (msg) => {
    // Only the host's commands are honored — role is read from the token
    // metadata LiveKit exposes on the remote participant, so spoofing the
    // topic cannot mute others.
    if (participantRole(msg.from?.metadata) !== 'host') return;
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

  const handleRemove = async (identity: string) => {
    try {
      await removeParticipant({ roomName, identity });
      toast.success(t('meetings.removed'));
    } catch {
      toast.error(t('meetings.removedFailed', { defaultValue: 'Could not remove participant' }));
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

  // Speaker view: the active speaker (or first remote) takes the stage.
  const focusParticipant = useMemo(() => {
    if (layout !== 'speaker' || shareTrack || participants.length <= 1) return null;
    const speaker =
      speakingSet.size > 0 ? participants.find((p) => speakingSet.has(p.identity)) : null;
    return (
      speaker ?? participants.find((p) => p.identity !== localIdentity) ?? participants[0] ?? null
    );
  }, [layout, shareTrack, participants, speakingSet, localIdentity]);

  // ── Chat state ─────────────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatOpen]);

  useEffect(() => {
    if (chatOpen) setUnread(0);
  }, [chatOpen, chatMessages.length]);

  useEffect(() => {
    if (!chatOpen) setUnread((u) => u + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages.length]);

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
    pushReaction(emoji);
    try {
      await sendReaction(new TextEncoder().encode(emoji), { reliable: true });
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

  const n = participants.length;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
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
          {!shareTrack && (
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
          <button
            type="button"
            onClick={onLeave}
            className="ml-0.5 flex h-9 items-center gap-1.5 rounded-xl bg-red-500/90 px-3 text-xs font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-500"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            {t('meetings.leave')}
          </button>
        </div>
      </header>

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
                className="h-full"
              />
            </div>
            {filmstrip(participants.filter((p) => p.identity !== focusParticipant.identity))}
          </>
        ) : (
          <div
            className={cn(
              'mx-auto grid h-full w-full content-center gap-4',
              n <= 1 && 'max-w-4xl',
              n === 2 && 'max-w-5xl',
              n >= 3 && 'max-w-[1400px]',
            )}
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {participants.map((p) => (
              <MeetingTile
                key={p.identity || p.sid}
                participant={p}
                isLocal={p.identity === localIdentity}
                speaking={speakingSet.has(p.identity)}
                handRaised={!!hands[p.identity || p.sid]}
                fallbackName={youName}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Floating reactions ── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center overflow-hidden">
        {floating.map((f) => (
          <span key={f.id} className="meeting-reaction absolute text-3xl">
            {f.emoji}
          </span>
        ))}
      </div>

      {/* ── Connection banner ── */}
      {connectionState !== 'connected' && connectionState !== 'connecting' && (
        <div className="absolute top-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300 shadow-lg backdrop-blur">
          <WifiOff className="h-3.5 w-3.5" />
          {t('meetings.connectionLost', { defaultValue: 'Connection lost — reconnecting…' })}
        </div>
      )}

      {/* ── Right panels (chat + participants, stacked like Zoom) ── */}
      {(chatOpen || participantsOpen) && (
        <div className="absolute top-14 right-3 bottom-24 z-20 flex w-80 max-w-[calc(100%-1.5rem)] flex-col gap-3">
          {chatOpen && (
            <section className="meeting-panel-in flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-[#141824]/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
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
                            mine
                              ? 'rounded-br-md bg-(--brand)/90 text-white'
                              : 'rounded-bl-md bg-white/[0.07]',
                            !groupStart && (mine ? 'mr-0' : 'ml-0'),
                          )}
                        >
                          {groupStart && (
                            <div
                              className={cn(
                                'mb-0.5 flex items-baseline gap-1.5',
                                mine && 'flex-row-reverse',
                              )}
                            >
                              <span
                                className={cn(
                                  'text-[10px] font-semibold',
                                  mine ? 'text-white/80' : 'text-[#93b4fd]',
                                )}
                              >
                                {mine ? t('meetings.you') : sender}
                              </span>
                              <span className="text-[9px] text-white/35">
                                {fmtTime(m.timestamp)}
                              </span>
                            </div>
                          )}
                          <p
                            className={cn(
                              'text-xs leading-relaxed break-words whitespace-pre-wrap',
                              mine ? 'text-white' : 'text-white/90',
                            )}
                          >
                            {m.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitChat();
                }}
                className="border-t border-white/10 px-3 py-2.5"
              >
                <div className="flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-1.5 focus-within:bg-white/[0.09]">
                  <input
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    placeholder={t('meetings.chatPlaceholder', { defaultValue: 'Message…' })}
                    className="w-full bg-transparent text-xs text-white outline-none placeholder:text-white/40"
                  />
                  <button
                    type="submit"
                    disabled={!chatDraft.trim()}
                    className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--brand) text-white transition hover:opacity-90 disabled:opacity-40"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            </section>
          )}

          {participantsOpen && (
            <section className="meeting-panel-in flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-[#141824]/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
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
              {isHost && (
                <div className="border-b border-white/10 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => sendHostCommand('muteMic', '*')}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/25"
                  >
                    <MicOff className="h-3.5 w-3.5" />
                    {t('meetings.muteAll', { defaultValue: 'Mute all' })}
                  </button>
                </div>
              )}
              <div className="chat-scroll flex-1 space-y-1 overflow-y-auto p-2">
                {participants.map((p) => (
                  <ParticipantRow
                    key={p.identity || p.sid}
                    participant={p}
                    localIdentity={localIdentity}
                    hands={hands}
                    isHost={isHost}
                    onMuteMic={(id) => sendHostCommand('muteMic', id)}
                    onMuteCam={(id) => sendHostCommand('muteCam', id)}
                    onAskUnmute={(id) => sendHostCommand('askUnmute', id)}
                    onRemove={handleRemove}
                    onToggleSelfMic={() => toggleTrack(() => mic.toggle(), t('meetings.micDenied'))}
                    onToggleSelfCam={() => toggleTrack(() => cam.toggle(), t('meetings.camDenied'))}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── Control dock ── */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center px-3 pb-5">
        <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-[#141824]/85 px-2.5 py-2 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <DockBtn
            on={mic.enabled}
            onIcon={<Mic className="h-4.5 w-4.5" />}
            offIcon={<MicOff className="h-4.5 w-4.5" />}
            label={mic.enabled ? t('meetings.micOn') : t('meetings.micOff')}
            onClick={() => toggleTrack(() => mic.toggle(), t('meetings.micDenied'))}
          />
          <DockBtn
            on={cam.enabled}
            onIcon={<Video className="h-4.5 w-4.5" />}
            offIcon={<VideoOff className="h-4.5 w-4.5" />}
            label={cam.enabled ? t('meetings.camOn') : t('meetings.camOff')}
            onClick={() => toggleTrack(() => cam.toggle(), t('meetings.camDenied'))}
          />
          <DockBtn
            on={share.enabled}
            onIcon={<MonitorUp className="h-4.5 w-4.5" />}
            offIcon={<MonitorOff className="h-4.5 w-4.5" />}
            label={t('meetings.share', { defaultValue: 'Share screen' })}
            onClick={() => toggleTrack(() => share.toggle(), t('meetings.shareDenied'))}
          />

          <div className="mx-1 h-7 w-px bg-white/10" />

          <div className="flex items-center gap-0.5 rounded-xl bg-white/[0.06] px-1.5 py-1">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => react(emoji)}
                className="rounded-lg px-1 py-0.5 text-base transition hover:scale-125"
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="mx-1 h-7 w-px bg-white/10" />

          <button
            type="button"
            onClick={toggleHand}
            title={handRaised ? t('meetings.lowerHand') : t('meetings.raiseHand')}
            className={cn(
              'flex size-11 items-center justify-center rounded-xl transition-all hover:scale-105',
              handRaised
                ? 'bg-amber-400 text-amber-950 shadow-lg shadow-amber-400/40'
                : 'bg-white/10 text-white hover:bg-white/15',
            )}
          >
            <Hand className="h-4.5 w-4.5" />
          </button>

          <button
            type="button"
            onClick={() => setChatOpen((o) => !o)}
            className={cn(
              'relative flex size-11 items-center justify-center rounded-xl transition',
              chatOpen ? 'bg-(--brand)/25 text-white' : 'text-white/70 hover:bg-white/10',
            )}
            title={t('meetings.chat', { defaultValue: 'Chat' })}
          >
            <MessageSquare className="h-4.5 w-4.5" />
            {unread > 0 && !chatOpen && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setParticipantsOpen((o) => !o)}
            className={cn(
              'relative flex size-11 items-center justify-center rounded-xl transition',
              participantsOpen ? 'bg-(--brand)/25 text-white' : 'text-white/70 hover:bg-white/10',
            )}
            title={t('meetings.participants', { defaultValue: 'Participants' })}
          >
            <Users className="h-4.5 w-4.5" />
            {handsCount > 0 && !participantsOpen && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[9px] font-bold text-amber-950">
                {handsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onLeave}
            className="ml-1 flex h-11 items-center gap-2 rounded-xl bg-red-500/90 px-4 text-sm font-semibold text-white shadow-lg shadow-red-500/30 transition hover:bg-red-500"
          >
            <PhoneOff className="h-4.5 w-4.5" />
            {t('meetings.leave')}
          </button>
        </div>
      </div>
    </div>
  );
}
