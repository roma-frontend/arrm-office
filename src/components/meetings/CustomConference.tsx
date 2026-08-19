'use client';

/**
 * CustomConference — fully custom in-call UI on top of raw LiveKit primitives.
 *
 * Dark, immersive "stage" design: centered aspect-video participant tiles with
 * speaking glow, screen-share focus layout, floating glass control dock, chat
 * drawer and floating emoji reactions — all in the app's design language.
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  fallbackName,
}: {
  participant: Participant;
  isLocal: boolean;
  speaking: boolean;
  fallbackName: string;
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
          : 'ring-1 ring-white/10',
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
        <span className="absolute top-2 right-2 rounded-md bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/60 backdrop-blur-sm">
          You
        </span>
      )}

      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-lg bg-black/50 px-2 py-1 backdrop-blur-sm">
        {micMuted ? (
          <MicOff className="h-3 w-3 text-red-400" />
        ) : (
          <Mic className={cn('h-3 w-3', speaking ? 'text-emerald-400' : 'text-white/70')} />
        )}
        <span className="max-w-40 truncate text-[11px] font-medium text-white/90">{name}</span>
      </div>
    </div>
  );
}

const REACTIONS = ['👍', '❤️', '😂', '🎉', '👏'];

export function CustomConference({ onLeave }: { onLeave: () => void }) {
  const { t } = useTranslation();
  const { localParticipant } = useLocalParticipant();
  const remotes = useParticipants();
  const speaking = useSpeakingParticipants();
  const connectionState = useConnectionState();

  const mic = useTrackToggle({ source: Track.Source.Microphone });
  const cam = useTrackToggle({ source: Track.Source.Camera });
  const share = useTrackToggle({ source: Track.Source.ScreenShare });

  const [chatOpen, setChatOpen] = useState(false);
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

  // Dedupe by identity — some kit versions surface the local participant in
  // useParticipants() as well, which produced duplicate React keys.
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

  const screenShares = useTracks([Track.Source.ScreenShare]);
  const activeShare = screenShares.find(
    (ref) => ref.publication?.track && !ref.publication?.isMuted,
  );
  const shareTrack = activeShare?.publication?.track;

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

  const n = participants.length;
  const cols = shareTrack ? 0 : n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : 4;
  const youName = t('meetings.you', { defaultValue: 'You' });

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[radial-gradient(1100px_520px_at_50%_-12%,rgb(37_99_235/0.14),transparent)]">
      {/* ── Stage ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-4 pb-28">
        {shareTrack && (
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
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
          <div className="flex shrink-0 gap-3 overflow-x-auto pb-1">
            {participants.map((p) => (
              <div key={p.identity || p.sid} className="w-44 shrink-0">
                <MeetingTile
                  participant={p}
                  isLocal={p.identity === localParticipant.identity}
                  speaking={speakingSet.has(p.identity)}
                  fallbackName={youName}
                />
              </div>
            ))}
          </div>
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
                isLocal={p.identity === localParticipant.identity}
                speaking={speakingSet.has(p.identity)}
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
        <div className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs font-medium text-red-300 shadow-lg backdrop-blur">
          <WifiOff className="h-3.5 w-3.5" />
          {t('meetings.connectionLost', { defaultValue: 'Connection lost — reconnecting…' })}
        </div>
      )}

      {/* ── Chat drawer ── */}
      {chatOpen && (
        <div className="absolute top-3 right-3 bottom-24 z-20 flex w-80 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#141824]/95 shadow-2xl shadow-black/50 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
            <span className="text-sm font-semibold text-white/90">
              {t('meetings.chat', { defaultValue: 'Chat' })}
            </span>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="text-xs text-white/50 transition hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
            {chatMessages.length === 0 && (
              <p className="pt-6 text-center text-xs text-white/40">
                {t('meetings.chatEmpty', { defaultValue: 'No messages yet' })}
              </p>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className="rounded-xl bg-white/[0.06] px-3 py-2">
                <p className="text-[10px] font-semibold text-[#93b4fd]">
                  {m.from?.name ?? m.from?.identity}
                </p>
                <p className="text-xs text-white/90">{m.message}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex items-center gap-2 border-t border-white/10 px-3 py-2.5">
            <input
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitChat()}
              placeholder={t('meetings.chatPlaceholder', { defaultValue: 'Message…' })}
              className="w-full bg-transparent text-xs text-white outline-none placeholder:text-white/40"
            />
            <button
              type="button"
              onClick={submitChat}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--brand) text-white transition hover:opacity-90"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Control dock ── */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center pb-5">
        <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-[#141824]/85 px-2.5 py-2 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <DockBtn
            on={mic.enabled}
            onIcon={<Mic className="h-4.5 w-4.5" />}
            offIcon={<MicOff className="h-4.5 w-4.5" />}
            label={mic.enabled ? t('meetings.micOn') : t('meetings.micOff')}
            onClick={() => mic.toggle()}
          />
          <DockBtn
            on={cam.enabled}
            onIcon={<Video className="h-4.5 w-4.5" />}
            offIcon={<VideoOff className="h-4.5 w-4.5" />}
            label={cam.enabled ? t('meetings.camOn') : t('meetings.camOff')}
            onClick={() => cam.toggle()}
          />
          <DockBtn
            on={share.enabled}
            onIcon={<MonitorUp className="h-4.5 w-4.5" />}
            offIcon={<MonitorOff className="h-4.5 w-4.5" />}
            label={t('meetings.share', { defaultValue: 'Share screen' })}
            onClick={() => share.toggle()}
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
            onClick={() => setChatOpen((v) => !v)}
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
