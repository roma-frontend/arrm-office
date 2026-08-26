'use client';

/**
 * LiveKit video meeting room — the full-screen page behind `/meetings/{roomName}`.
 *
 * Three phases:
 *   1. **Lobby** — shown to unauthenticated external visitors when the host
 *      turned the waiting room on. They fill out a registration form
 *      (configured per-meeting), get an invite link, and the host admits them.
 *   2. **Pre-join** — themed screen with a live camera preview, mic/camera
 *      toggles and the participant's name. Internal members and admitted
 *      guests land here directly.
 *   3. **In-call** — a real LiveKit room rendered with our `CustomConference`
 *      (grid + speaker view, control bar, chat, reactions, screen share).
 *
 * Token minting happens server-side in the Convex action `meetings.getJoinToken`
 * — the page never sees the LiveKit API secret, and joining is gated by org
 * membership for staff or by an HMAC-signed one-shot invite for guests.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAction, useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Room, type LocalAudioTrack, type LocalVideoTrack } from 'livekit-client';
import { LiveKitRoom, RoomAudioRenderer, usePreviewTracks } from '@livekit/components-react';
import { CustomConference } from './CustomConference';
import { DeviceSettings, MicMeter } from './DeviceSettings';
import { BackgroundPicker } from './BackgroundPicker';
import { useMeetingDevices, useMicLevel, type MeetingDeviceKind } from './useMeetingDevices';
import { useVideoEffects } from './useVideoEffects';
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
import { LobbyForm } from './LobbyForm';
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
  const searchParams = useSearchParams();
  const roomName = params?.id ?? '';
  // External guests reach the room via a one-time invite URL the host shares
  // from the admit dialog. Anything else (or an unauthenticated visitor with
  // no invite) gets bounced to the lobby if the host turned it on.
  const inviteToken = searchParams?.get('invite') ?? undefined;
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
  // After a registration-only lobby submit, the visitor advances to the
  // pre-join screen via this local flag — must live above any early return
  // so hooks fire in the same order every render.
  const [registrationDone, setRegistrationDone] = useState(false);
  const roomRef = useRef<Room | null>(null);
  // Wall-clock second the call was joined; `elapsed` is the difference from it.
  // (Storing `Date.now()` directly here printed the epoch in the header clock.)
  const startedAtRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const { choices, choose } = useMeetingDevices();

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
    () =>
      joined
        ? { audio: false, video: false }
        : {
            audio: choices.audioinput ? { deviceId: choices.audioinput } : true,
            video: choices.videoinput ? { deviceId: choices.videoinput } : true,
          },
    [joined, choices.audioinput, choices.videoinput],
  );
  const previewTracks = usePreviewTracks(previewOptions, handlePreviewError);
  const previewVideo = previewTracks?.find((track) => track.kind === 'video') as
    | LocalVideoTrack
    | undefined;
  const previewAudio = previewTracks?.find((track) => track.kind === 'audio') as
    | LocalAudioTrack
    | undefined;
  const micLevel = useMicLevel(previewAudio, micOn && !joined);
  // Background blur / virtual background on the *preview* track: what you see
  // here is what the room will publish, because the choice is persisted and the
  // in-call picker reads the same key.
  const effects = useVideoEffects(joined ? undefined : previewVideo);

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
        const args: { roomName: string; invite?: string } = { roomName };
        if (inviteToken) args.invite = inviteToken;
        const { token: jwt, url } = await getJoinToken(args);
        const userChoices: LocalUserChoices = {
          username: displayName.trim() || user?.name || 'Participant',
          videoEnabled: withVideo && camOn,
          audioEnabled: micOn,
          videoDeviceId: choices.videoinput ?? '',
          audioDeviceId: choices.audioinput ?? '',
        };
        // Hand the devices over to the Room: stop the pre-join preview first so
        // the camera is never double-held (LED flicker / NotReadableError).
        (previewTracks ?? []).forEach((tr) => tr.stop());

        // The official LiveKit pattern: prepare the Room with the pre-join
        // choices, then hand the instance to <LiveKitRoom connect>.
        // The capture defaults matter: without them the browser decides whether
        // to run echo cancellation / noise suppression / auto gain, and Chrome
        // silently skips them for some device profiles.
        const newRoom = new Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            deviceId: userChoices.audioDeviceId || undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          videoCaptureDefaults: {
            deviceId: userChoices.videoDeviceId || undefined,
            resolution: { width: 1280, height: 720, frameRate: 30 },
          },
        });
        newRoom.localParticipant.setCameraEnabled(userChoices.videoEnabled);
        newRoom.localParticipant.setMicrophoneEnabled(userChoices.audioEnabled);
        roomRef.current = newRoom;
        setRoom(newRoom);
        setToken(jwt);
        setServerUrl(url);
        startedAtRef.current = Date.now();
        setElapsed(0);
        setJoined(true);
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : String(err));
        setJoined(false);
      } finally {
        setJoining(false);
      }
    },
    [
      roomName,
      getJoinToken,
      displayName,
      user?.name,
      micOn,
      camOn,
      previewTracks,
      choices.audioinput,
      choices.videoinput,
      inviteToken,
    ],
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
    // Output device cannot be set through RoomOptions — apply the remembered
    // speaker once the room is up.
    if (choices.audiooutput) {
      try {
        await roomRef.current?.switchActiveDevice('audiooutput', choices.audiooutput);
      } catch {
        /* the device may have been unplugged — stay on the default */
      }
    }
    if (isHostFromRoom()) {
      try {
        await setStatus({ roomName, status: 'live' });
      } catch {
        /* non-fatal */
      }
    }
  }, [roomName, setStatus, isHostFromRoom, choices.audiooutput]);

  /** In-call device switch: remember it and move the live tracks over. */
  const handleDeviceChange = useCallback(
    (kind: MeetingDeviceKind, deviceId: string) => {
      choose(kind, deviceId);
      const active = roomRef.current;
      if (!active || !deviceId) return;
      void active.switchActiveDevice(kind, deviceId).catch(() => {
        toast.error(t('meetings.actionFailed'));
      });
    },
    [choose, t],
  );

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
    startedAtRef.current = null;
    setElapsed(0);
  }, [roomName, setStatus, isHostFromRoom]);

  // Elapsed timer while connected — seconds since the join, not since epoch.
  useEffect(() => {
    if (!joined) return;
    const tick = () => {
      const startedAt = startedAtRef.current;
      setElapsed(startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0);
    };
    tick();
    const interval = setInterval(tick, 1000);
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

  const meetingTitle =
    'event' in meeting && meeting.event?.title ? meeting.event.title : t('meetings.untitled');

  // ── Lobby (waiting room / registration) ─────────────────────────────────
  // External visitors without an invite land here when EITHER waiting room
  // or registration is on. The two flags are independent:
  //   - waiting room on, registration off → "wait for admit" screen
  //   - waiting room off, registration on → "fill form → continue" flow
  //   - both on → fill form, then wait for admit
  // Once the form is submitted and there is no waiting room, the visitor
  // advances to the pre-join screen via local state.
  const isExternalUnauthed = !user && !inviteToken;
  const isLobbyUser = Boolean(
    meeting &&
      'waitingRoomEnabled' in meeting &&
      (meeting.waitingRoomEnabled || meeting.registrationEnabled) &&
      isExternalUnauthed &&
      !registrationDone,
  );

  if (isLobbyUser) {
    const isRegistrationOnly = !meeting.waitingRoomEnabled && meeting.registrationEnabled;
    return (
      <LobbyForm
        roomName={roomName}
        title={meetingTitle}
        hostName={('hostName' in meeting && meeting.hostName) || ''}
        fields={meeting.registrationFields ?? []}
        waitingRoomEnabled={Boolean(meeting.waitingRoomEnabled)}
        onCancel={() => router.push('/dashboard')}
        onRegistered={isRegistrationOnly ? () => setRegistrationDone(true) : undefined}
      />
    );
  }

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
            onError={(error) => {
              const msg = String(error);
              if (msg.includes('Client initiated disconnect') || msg.includes('disconnect')) return;
              toast.error(`${t('meetings.joinError')} — ${msg}`);
            }}
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
              deviceChoices={choices}
              onDeviceChange={handleDeviceChange}
              isOriginalHost={Boolean('isOriginalHost' in meeting && meeting.isOriginalHost)}
              cohostIds={
                'cohostIds' in meeting && meeting.cohostIds
                  ? (meeting.cohostIds as unknown as readonly string[])
                  : ([] as readonly string[])
              }
              waitingRoomEnabled={Boolean('waitingRoomEnabled' in meeting && meeting.waitingRoomEnabled)}
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
            <p className="text-[10px] font-semibold uppercase tracking-wider text-(--text-3)">
              {meeting.mode === 'webinar' ? t('meetings.webinar') : t('meetings.meeting')}
            </p>
            <p className="truncate text-[11px] text-(--text-4)">{t('meetings.joinHint')}</p>
          </div>
        </div>
      </motion.div>

      {/* Main content — one card split into two panes rather than two floating
          cards. A single frame cannot have a "left block higher than the right
          one": both panes share the card's top and bottom edge, and the seam
          between them is the divider. */}
      <div className="relative z-10 flex flex-1 items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' }}
          className="w-full max-w-5xl"
        >
          <div className="prejoin-card grid overflow-hidden rounded-3xl border border-(--border-default) bg-(--surface-1) shadow-xl shadow-black/5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            {/* Preview pane */}
            <div className="order-2 flex flex-col border-t border-(--border-default) p-4 sm:p-5 lg:order-1 lg:border-t-0">
              {/* Mic / camera controls float on the video instead of sitting in
                  their own band: the video stays the loudest thing in the pane
                  and the pane keeps the height of its content, not of a stack
                  of control rows. */}
              <div className="relative">
                <CameraPreview videoTrack={previewVideo} muted={!camOn} />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
                  <MicMeter level={micLevel} compact />
                  <div className="pointer-events-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMicOn((v) => !v)}
                      aria-pressed={micOn}
                      className={`flex size-10 items-center justify-center rounded-full backdrop-blur-md transition hover:scale-105 ${
                        micOn
                          ? 'bg-white/15 text-white hover:bg-white/25'
                          : 'bg-red-500/90 text-white hover:bg-red-500'
                      }`}
                      title={micOn ? t('meetings.micOn') : t('meetings.micOff')}
                    >
                      {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCamOn((v) => !v)}
                      aria-pressed={camOn}
                      className={`flex size-10 items-center justify-center rounded-full backdrop-blur-md transition hover:scale-105 ${
                        camOn
                          ? 'bg-white/15 text-white hover:bg-white/25'
                          : 'bg-red-500/90 text-white hover:bg-red-500'
                      }`}
                      title={camOn ? t('meetings.camOn') : t('meetings.camOff')}
                    >
                      {camOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                    </button>
                  </div>
                  {/* Balances the meter on the left so the buttons stay centred. */}
                  <span className="w-11 shrink-0" aria-hidden="true" />
                </div>
              </div>

              {/* Device pickers and the background row, so nobody discovers a
                  dead headset once the meeting has started. */}
              <div className="mt-4 space-y-3.5">
                <DeviceSettings
                  choices={choices}
                  onChange={choose}
                  tone="canvas"
                  className="sm:grid-cols-3"
                />
                <BackgroundPicker
                  effect={effects.effect}
                  pending={effects.pending}
                  supported={effects.supported}
                  failed={effects.failed}
                  hasCamera={Boolean(previewVideo)}
                  tone="canvas"
                  onSelect={effects.setEffect}
                />
              </div>
            </div>

            {/* Join pane — tinted so the seam reads as one composition, and laid
                out as a column so the security note can hold the bottom edge
                however tall the preview pane turns out to be. */}
            <div className="order-1 flex flex-col bg-(--surface-2)/45 p-6 sm:p-7 lg:order-2 lg:border-l lg:border-(--border-default)">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-(--brand-quiet)">
                <Video className="h-5.5 w-5.5 text-(--brand)" />
              </div>
              <h2 className="mt-4 text-xl font-semibold leading-tight text-(--text-1)">
                {meetingTitle}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-(--text-3)">
                {'event' in meeting && meeting.event?.description
                  ? meeting.event.description
                  : t('meetings.joinHint')}
              </p>

              {/* Name input */}
              <div className="mt-6">
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
              </div>

              {/* Error */}
              {joinError && (
                <div className="mt-4 rounded-xl border border-(--danger-outline) bg-(--danger-quiet) px-3 py-2.5 text-xs text-(--danger-text)">
                  {t('meetings.joinError')} — {joinError}
                </div>
              )}

              {/* Join buttons */}
              <div className="mt-5 grid gap-2.5">
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
                  className="flex items-center justify-center gap-2 rounded-xl border border-(--border-default) bg-(--surface-1) px-4 py-2.5 text-sm font-medium text-(--text-2) transition hover:bg-(--surface-3) disabled:opacity-50"
                >
                  <Monitor className="h-4 w-4" />
                  {t('meetings.joinWithoutVideo')}
                </button>
              </div>

              {/* Security note — `mt-auto` keeps it on the bottom edge so both
                  panes finish on the same line. */}
              <p className="mt-auto flex items-center gap-1.5 pt-6 text-[11px] text-(--text-4)">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                {t('meetings.secureNote')}
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
