'use client';

/**
 * LiveKit video meeting room — the full-screen page behind `/meetings/{roomName}`.
 *
 * Two phases:
 *   1. Pre-join — themed screen with a live camera preview, mic/camera toggles
 *      and the participant's name. Uses `usePreviewTracks` from the LiveKit kit
 *      (self-contained, no server connection needed yet).
 *   2. In-call — a real LiveKit room rendered with the kit's `VideoConference`
 *      prefab (grid + speaker view, control bar, chat, reactions, screen share)
 *      wrapped in our header (title, status, timer, copy link, leave).
 *
 * Token minting happens server-side in the Convex action `meetings.getJoinToken`
 * — the page never sees the LiveKit API secret, and joining is limited to the
 * room's organization (Phase 1; guest-by-link lands with the lobby in Phase 2).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Room, type LocalVideoTrack } from 'livekit-client';
import { LiveKitRoom, RoomAudioRenderer, usePreviewTracks } from '@livekit/components-react';
import { CustomConference } from './CustomConference';
import type { LocalUserChoices } from '@livekit/components-core';
import {
  Loader2,
  Monitor,
  PhoneOff,
  Radio,
  Users,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Check,
  Link2,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ensureAppNamespaces } from '@/i18n/config';
import '@livekit/components-styles';
import './meetings.css';

const MEETING_PUBLISH_STATES = ['scheduled', 'live', 'ended'] as const;

/** Live camera preview for the pre-join screen. */
function CameraPreview({
  videoTrack,
  muted,
}: {
  videoTrack: LocalVideoTrack | undefined;
  muted: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !videoTrack || videoTrack.kind !== 'video') return;
    videoTrack.attach(el);
    return () => {
      videoTrack.detach(el);
    };
  }, [videoTrack]);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
      <video ref={ref} muted playsInline className="h-full w-full object-cover" />
      {muted && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <VideoOff className="h-8 w-8 text-white/50" />
        </div>
      )}
    </div>
  );
}

export function MeetingRoomClient() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const roomName = params?.id ?? '';
  const { user } = useAuthStore();
  const getJoinToken = useAction(api.meetingsActions.getJoinToken);
  const setStatus = useMutation(api.meetings.setStatus);

  // ── Room metadata ─────────────────────────────────────────────────────────
  const meeting = useQuery(api.meetings.getByRoomName, roomName ? { roomName } : 'skip');

  // ── Pre-join state ────────────────────────────────────────────────────────
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [token, setToken] = useState<string>();
  const [serverUrl, setServerUrl] = useState<string>();
  const [room, setRoom] = useState<Room>();
  const roomRef = useRef<Room | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Prefill the name from the signed-in user once.
  useEffect(() => {
    if (!displayName && user?.name) setDisplayName(user.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name]);

  useEffect(() => {
    ensureAppNamespaces();
  }, []);

  // usePreviewTracks re-runs its acquire effect whenever the identity of its
  // onError callback changes. An inline arrow therefore caused an infinite
  // stop→getUserMedia→setState→render loop — the camera LED flickering non-stop.
  // Keep the callback (and options) stable, and drop the preview devices while
  // in the call so the Room never fights the preview for the camera.
  const handlePreviewError = useCallback(() => {
    /* device error — the join buttons still work; audio/video just stay off */
  }, []);
  const previewOptions = useMemo(
    () => (joined ? { audio: false, video: false } : { audio: true, video: true }),
    [joined],
  );
  const previewTracks = usePreviewTracks(previewOptions, handlePreviewError);
  const previewVideo = previewTracks?.find((track) => track.kind === 'video') as
    | LocalVideoTrack
    | undefined;

  // Keep preview toggles in step with the local tracks.
  useEffect(() => {
    for (const track of previewTracks ?? []) {
      if (track.kind !== 'audio') continue;
      if (micOn) track.unmute();
      else track.mute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micOn]);

  // ── Join / leave ──────────────────────────────────────────────────────────
  const handleJoin = useCallback(
    async (withVideo: boolean) => {
      if (!roomName) return;
      setJoining(true);
      setJoinError(null);
      try {
        const { token: jwt, url } = await getJoinToken({ roomName });
        const choices: LocalUserChoices = {
          username: displayName.trim() || user?.name || 'Participant',
          videoEnabled: withVideo && camOn,
          audioEnabled: micOn,
          // No explicit device selection in Phase 1 — empty means "OS default".
          videoDeviceId: '',
          audioDeviceId: '',
        };
        // Hand the devices over to the Room: stop the pre-join preview first so
        // the camera is never double-held (LED flicker / NotReadableError).
        (previewTracks ?? []).forEach((tr) => tr.stop());

        // The official LiveKit pattern: prepare the Room with the pre-join
        // choices, then hand the instance to <LiveKitRoom connect>.
        const newRoom = new Room({ adaptiveStream: true, dynacast: true });
        newRoom.localParticipant.setCameraEnabled(choices.videoEnabled);
        newRoom.localParticipant.setMicrophoneEnabled(choices.audioEnabled);
        roomRef.current = newRoom;
        setRoom(newRoom);
        setToken(jwt);
        setServerUrl(url);
        setElapsed(Math.floor(Date.now() / 1000));
        setJoined(true);
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : String(err));
        setJoined(false);
      } finally {
        setJoining(false);
      }
    },
    [roomName, getJoinToken, displayName, user?.name, micOn, camOn, previewTracks],
  );

  const handleDisconnect = useCallback(() => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    router.push('/calendar');
  }, [router]);

  // The kit's `onConnected` fires with no args — read the role from our own
  // room instance (the token's metadata is parsed server-side on the local
  // participant). Host marks the meeting live; a viewer's join must not flip
  // the status.
  const isHostFromRoom = useCallback(() => {
    const meta = roomRef.current?.localParticipant.metadata;
    if (!meta) return false;
    try {
      return (JSON.parse(meta) as { role?: string }).role === 'host';
    } catch {
      return false;
    }
  }, []);

  const onConnected = useCallback(async () => {
    if (isHostFromRoom()) {
      try {
        await setStatus({ roomName, status: 'live' });
      } catch {
        /* non-fatal */
      }
    }
  }, [roomName, setStatus, isHostFromRoom]);

  const onDisconnected = useCallback(async () => {
    if (isHostFromRoom()) {
      try {
        await setStatus({ roomName, status: 'ended' });
      } catch {
        /* non-fatal */
      }
    }
    setJoined(false);
    setToken(undefined);
    setServerUrl(undefined);
    setRoom(undefined);
    roomRef.current = null;
    setElapsed(0);
  }, [roomName, setStatus, isHostFromRoom]);

  // Elapsed timer while connected.
  useEffect(() => {
    if (!joined) return;
    const interval = setInterval(() => setElapsed(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, [joined]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/meetings/${roomName}`);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      toast.error(t('meetings.copyFailed'));
    }
  }, [roomName, t]);

  const fmtElapsed = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  const statusKey =
    meeting?.status && MEETING_PUBLISH_STATES.includes(meeting.status)
      ? meeting.status
      : 'scheduled';

  // ── Loading / missing states ──────────────────────────────────────────────
  if (meeting === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0c12]">
        <Skeleton className="h-64 w-[min(92vw,720px)] rounded-3xl" />
      </div>
    );
  }

  if (meeting === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0c12] p-6">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl shadow-black/50">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-red-500/15">
            <ShieldCheck className="h-7 w-7 text-red-300" />
          </div>
          <h1 className="text-lg font-semibold text-white">{t('meetings.notFoundTitle')}</h1>
          <p className="mt-2 text-sm text-white/60">{t('meetings.notFoundDesc')}</p>
          <Button className="mt-6 w-full" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('meetings.backToDashboard')}
          </Button>
        </div>
      </div>
    );
  }

  const meetingTitle = meeting.event?.title ?? t('meetings.untitled');

  // ── In-call ───────────────────────────────────────────────────────────────
  if (joined && token && serverUrl && room) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-[#0a0c12] text-white">
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--brand)/20">
              <Video className="h-5 w-5 text-[#608ffa]" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-white">{meetingTitle}</h1>
              <div className="flex items-center gap-2 text-xs text-white/60">
                <span className="inline-flex items-center gap-1">
                  <Radio
                    className={`h-3 w-3 ${statusKey === 'live' ? 'text-emerald-400 animate-pulse' : ''}`}
                  />
                  {t(`meetings.status.${statusKey}`)}
                </span>
                <span className="text-(--text-muted)/50">•</span>
                <span className="num">{fmtElapsed(elapsed)}</span>
                <span className="text-(--text-muted)/50">•</span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {meeting.mode === 'webinar' ? t('meetings.webinar') : t('meetings.meeting')}
                </span>
              </div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyLink}
              className="gap-2 border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
            >
              {linkCopied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {linkCopied ? t('meetings.copied') : t('meetings.copyLink')}
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              className="gap-2 border-red-500/30 bg-red-500/15 text-red-300 hover:bg-red-500/25"
            >
              <PhoneOff className="h-4 w-4" />
              {t('meetings.leave')}
            </Button>
          </div>
        </header>

        {/* Room */}
        <main className="min-h-0 flex-1 overflow-hidden">
          <LiveKitRoom
            room={room}
            token={token}
            serverUrl={serverUrl}
            connect
            onConnected={onConnected}
            onDisconnected={onDisconnected}
            onError={(error) => toast.error(`${t('meetings.joinError')} — ${String(error)}`)}
            className="h-full"
            data-lk-theme="default"
          >
            <CustomConference onLeave={handleDisconnect} />
            <RoomAudioRenderer />
          </LiveKitRoom>
        </main>
      </div>
    );
  }

  // ── Pre-join ──────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0c12] p-4 sm:p-6">
      <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* Preview */}
        <div className="order-2 lg:order-1">
          <CameraPreview videoTrack={previewVideo} muted={!camOn} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              size="lg"
              className="justify-center gap-2 border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
              onClick={() => setMicOn((v) => !v)}
            >
              {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              {micOn ? t('meetings.micOn') : t('meetings.micOff')}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="justify-center gap-2 border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
              onClick={() => setCamOn((v) => !v)}
            >
              {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              {camOn ? t('meetings.camOn') : t('meetings.camOff')}
            </Button>
          </div>
        </div>

        {/* Join card */}
        <div className="order-1 flex flex-col justify-center lg:order-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/50 sm:p-8">
            <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-(--brand)/20">
              <Video className="h-6 w-6 text-[#608ffa]" />
            </div>
            <h1 className="text-xl font-semibold text-white">{meetingTitle}</h1>
            <p className="mt-1 text-sm text-white/60">
              {meeting.event?.description || t('meetings.joinHint')}
            </p>

            <div className="mt-5 flex items-center gap-2 rounded-xl bg-white/[0.06] px-3 py-2.5">
              <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-white/50">
                {t('meetings.name')}
              </span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={60}
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/40"
                placeholder={t('meetings.namePlaceholder')}
              />
            </div>

            {joinError && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/15 px-3 py-2.5 text-sm text-red-300">
                {t('meetings.joinError')} — {joinError}
              </div>
            )}

            <div className="mt-5 grid gap-2.5">
              <Button
                size="lg"
                className="btn-gradient justify-center gap-2 font-medium"
                disabled={joining}
                onClick={() => handleJoin(true)}
              >
                {joining ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Video className="h-4 w-4" />
                )}
                {t('meetings.joinNow')}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="justify-center gap-2 border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
                disabled={joining}
                onClick={() => handleJoin(false)}
              >
                <Monitor className="h-4 w-4" />
                {t('meetings.joinWithoutVideo')}
              </Button>
            </div>

            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-white/40">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('meetings.secureNote')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
