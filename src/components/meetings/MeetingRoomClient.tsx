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
  Video,
  VideoOff,
  Mic,
  MicOff,
  ShieldCheck,
  ArrowLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from '@/lib/cssMotion';
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

  const handleBack = useCallback(() => {
    (previewTracks ?? []).forEach((tr) => tr.stop());
    router.back();
  }, [previewTracks, router]);

  const statusKey =
    meeting?.status && MEETING_PUBLISH_STATES.includes(meeting.status)
      ? meeting.status
      : 'scheduled';

  // ── Loading / missing states ──────────────────────────────────────────────
  if (meeting === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--canvas)">
        <Skeleton className="h-64 w-[min(92vw,720px)] rounded-3xl" />
      </div>
    );
  }

  if (meeting === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--canvas) p-6">
        <div className="w-full max-w-md rounded-3xl border border-(--border-default) bg-(--surface-1) p-8 text-center shadow-lg">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-(--danger-quiet)">
            <ShieldCheck className="h-7 w-7 text-(--danger-text)" />
          </div>
          <h1 className="text-lg font-semibold text-(--text-1)">{t('meetings.notFoundTitle')}</h1>
          <p className="mt-2 text-sm text-(--text-3)">{t('meetings.notFoundDesc')}</p>
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
            <CustomConference
              roomName={roomName}
              title={meetingTitle}
              statusKey={statusKey}
              elapsed={elapsed}
              mode={meeting.mode}
              linkCopied={linkCopied}
              onCopyLink={copyLink}
              onLeave={handleDisconnect}
            />
            <RoomAudioRenderer />
          </LiveKitRoom>
        </main>
      </div>
    );
  }

  // ── Pre-join ──────────────────────────────────────────────────────────────
  return (
    <div className="prejoin-screen relative flex min-h-screen flex-col bg-(--canvas) p-4 sm:p-6">
      {/* Subtle brand glow at the top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(800px_320px_at_50%_-10%,var(--brand-quiet),transparent)]" />
      {/* Top bar with back button */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative z-10 mb-6 flex items-center gap-3"
      >
        <button
          type="button"
          onClick={handleBack}
          className="flex size-9 items-center justify-center rounded-xl text-(--text-3) transition hover:bg-(--surface-2) hover:text-(--text-1)"
          title={t('meetings.backToDashboard', 'Back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-(--brand-quiet)">
            <Video className="h-4 w-4 text-(--brand)" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-(--text-1)">{meetingTitle}</h1>
            <p className="text-[11px] text-(--text-3)">
              {meeting.event?.description || t('meetings.joinHint')}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Main content — two-column on large screens */}
      <div className="relative z-10 flex flex-1 items-center justify-center">
        <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.3fr_1fr]">
          {/* Preview card */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
            className="order-2 lg:order-1"
          >
            <div className="prejoin-preview-card overflow-hidden rounded-2xl border border-(--border-default) bg-(--surface-1) shadow-lg backdrop-blur-xl">
              <CameraPreview videoTrack={previewVideo} muted={!camOn} />
              {/* Device toggles inside the preview card */}
              <div className="flex items-center justify-center gap-3 border-t border-(--border-subtle) bg-(--surface-2) px-4 py-3">
                <button
                  type="button"
                  onClick={() => setMicOn((v) => !v)}
                  className={`flex size-11 items-center justify-center rounded-xl transition-all hover:scale-105 ${
                    micOn
                      ? 'bg-(--surface-3) text-(--text-1) hover:bg-(--brand-quiet)'
                      : 'bg-(--danger-quiet) text-(--danger-text) hover:bg-(--danger-outline)'
                  }`}
                  title={micOn ? t('meetings.micOn') : t('meetings.micOff')}
                >
                  {micOn ? <Mic className="h-4.5 w-4.5" /> : <MicOff className="h-4.5 w-4.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setCamOn((v) => !v)}
                  className={`flex size-11 items-center justify-center rounded-xl transition-all hover:scale-105 ${
                    camOn
                      ? 'bg-(--surface-3) text-(--text-1) hover:bg-(--brand-quiet)'
                      : 'bg-(--danger-quiet) text-(--danger-text) hover:bg-(--danger-outline)'
                  }`}
                  title={camOn ? t('meetings.camOn') : t('meetings.camOff')}
                >
                  {camOn ? <Video className="h-4.5 w-4.5" /> : <VideoOff className="h-4.5 w-4.5" />}
                </button>
              </div>
            </div>
          </motion.div>

          {/* Join card */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
            className="order-1 flex flex-col justify-center lg:order-2"
          >
            <div className="rounded-2xl border border-(--border-default) bg-(--surface-1) p-6 shadow-lg sm:p-8">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.35, ease: 'easeOut' }}
                className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-(--brand-quiet)"
              >
                <Video className="h-6 w-6 text-(--brand)" />
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.4 }}
                className="text-xl font-semibold text-(--text-1)"
              >
                {meetingTitle}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.45 }}
                className="mt-1 text-sm text-(--text-3)"
              >
                {meeting.event?.description || t('meetings.joinHint')}
              </motion.p>

              {/* Name input */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.5 }}
                className="mt-5"
              >
                <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-(--text-3)">
                  {t('meetings.name')}
                </label>
                <div className="flex items-center gap-2 rounded-xl bg-(--sunken) px-3 py-2.5 ring-1 ring-(--border-default) transition focus-within:ring-(--brand)">
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={60}
                    className="w-full bg-transparent text-sm text-(--text-1) outline-none placeholder:text-(--text-4)"
                    placeholder={t('meetings.namePlaceholder')}
                  />
                </div>
              </motion.div>

              {/* Error */}
              {joinError && (
                <div className="mt-4 rounded-xl border border-(--danger-outline) bg-(--danger-quiet) px-3 py-2.5 text-xs text-(--danger-text)">
                  {t('meetings.joinError')} — {joinError}
                </div>
              )}

              {/* Join buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.55 }}
                className="mt-6 grid gap-2.5"
              >
                <button
                  type="button"
                  disabled={joining}
                  onClick={() => handleJoin(true)}
                  className="btn-gradient flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {joining ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="h-4 w-4" />
                  )}
                  {t('meetings.joinNow')}
                </button>
                <button
                  type="button"
                  disabled={joining}
                  onClick={() => handleJoin(false)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-(--border-default) bg-(--surface-2) px-4 py-2.5 text-sm font-medium text-(--text-2) transition hover:bg-(--surface-3) disabled:opacity-50"
                >
                  <Monitor className="h-4 w-4" />
                  {t('meetings.joinWithoutVideo')}
                </button>
              </motion.div>

              {/* Security note */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.65 }}
                className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-(--text-4)"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {t('meetings.secureNote')}
              </motion.p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
