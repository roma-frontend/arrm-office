'use client';
import Image from 'next/image';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { useTranslation } from 'react-i18next';
import type { ActiveCall } from './ChatClient';

export type { ActiveCall };

interface Props {
  call: ActiveCall;
  currentUserId: Id<'users'>;
  currentUserName: string;
  currentUserAvatar?: string;
  onEnd: () => void;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function CallModal({
  call,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  onEnd,
}: Props) {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(call.type === 'video');
  const [speakerOn, setSpeakerOn] = useState(true);
  const { t } = useTranslation();
  const [callStatus, setCallStatus] = useState<'ringing' | 'connecting' | 'active' | 'ended'>(
    'ringing',
  );
  const [duration, setDuration] = useState(0);
  const [peerConnected, setPeerConnected] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLAudioElement>(null);
  const remoteVideoDisplayRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  // The auto-retry timer runs initMedia from the render that scheduled it, so a
  // plain state read inside the catch block would always see the first value
  // (infinite "Attempt 1" retries, final message unreachable). Mirror it in a ref.
  const retryCountRef = useRef(0);
  useEffect(() => {
    retryCountRef.current = retryCount;
  }, [retryCount]);

  const endCallMutation = useMutation(api.chat.calls.endCall);
  const answerCallMutation = useMutation(api.chat.calls.answerCall);
  const updateOfferMutation = useMutation(api.chat.calls.updateOffer);
  const updateIceMutation = useMutation(api.chat.calls.updateIceCandidates);
  const setInCallStatusMutation = useMutation(api.users.mutations.setInCallStatus);
  const resetCallStatusMutation = useMutation(api.users.mutations.resetFromCallStatus);
  const callData = useQuery(api.chat.calls.getActiveCall, { conversationId: call.conversationId });
  const addedIceCandidatesRef = useRef<Set<string>>(new Set());

  const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: 'ac986faa3d8fec75bb7c4aff',
      credential: 'WOCnG2giai1RFd3N',
    },
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: 'ac986faa3d8fec75bb7c4aff',
      credential: 'WOCnG2giai1RFd3N',
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: 'ac986faa3d8fec75bb7c4aff',
      credential: 'WOCnG2giai1RFd3N',
    },
    {
      urls: 'turns:global.relay.metered.ca:443?transport=tcp',
      username: 'ac986faa3d8fec75bb7c4aff',
      credential: 'WOCnG2giai1RFd3N',
    },
  ];

  const [iceServers, setIceServers] = useState<RTCIceServer[]>(FALLBACK_ICE_SERVERS);

  // Fetch TURN credentials from Metered.ca
  useEffect(() => {
    const fetchIceServers = async () => {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_METERED_URL || 'https://hr-project.metered.live'}/api/v1/turn/credentials?apiKey=${process.env.NEXT_PUBLIC_METERED_API_KEY}`,
        );
        const servers = (await response.json()) as RTCIceServer[];
        if (Array.isArray(servers) && servers.length > 0) {
          setIceServers(servers);
        }
      } catch {
        // fallback to STUN only
      }
    };
    fetchIceServers();
  }, []);

  // Format duration
  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const cleanup = useCallback(() => {
    logger.log('[CallModal] Cleaning up media resources...');

    // Stop ALL tracks — browser immediately releases camera/mic indicator
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      logger.log('[CallModal] Stopping', tracks.length, 'local tracks');

      tracks.forEach((t) => {
        try {
          t.stop();
          logger.log('[CallModal] Stopped track:', t.kind);
        } catch (e) {
          logger.warn('Error stopping track:', e);
        }
      });
      // Clear all references to ensure garbage collection
      localStreamRef.current = null;
    }
    // Detach srcObject so browser fully releases camera/mic
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (remoteVideoDisplayRef.current) {
      remoteVideoDisplayRef.current.srcObject = null;
    }
    // Remove handlers before closing to avoid stale callbacks
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.ontrack = null;
        // Remove all transceiver tracks
        const senders = peerConnectionRef.current.getSenders();
        logger.log('[CallModal] Stopping', senders.length, 'peer connection senders');

        senders.forEach((sender) => {
          try {
            if (sender.track) {
              sender.track.stop();
              logger.log('[CallModal] Stopped sender track:', sender.track.kind);
            }
          } catch (e) {
            logger.warn('Error stopping sender track:', e);
          }
        });
        peerConnectionRef.current.close();
        logger.log('[CallModal] Closed peer connection');
      } catch (e) {
        logger.warn('Error closing peer connection:', e);
      }
      peerConnectionRef.current = null;
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    logger.log('[CallModal] Cleanup complete');
  }, []);

  // Initialize media and WebRTC
  const initMedia = useCallback(async () => {
    try {
      setMediaError(null);
      logger.log('[CallModal] Requesting media with constraints:', {
        audio: true,
        video: call.type === 'video',
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: call.type === 'video',
      });

      logger.log('[CallModal] Got media stream:', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create RTCPeerConnection
      const pc = new RTCPeerConnection({ iceServers });
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = async (event) => {
        if (event.candidate && call.callId) {
          const candidates = [JSON.stringify(event.candidate)];
          await updateIceMutation({ callId: call.callId, userId: currentUserId, candidates });
        }
      };

      pc.ontrack = (event) => {
        const stream = event.streams[0];
        // Set remote stream on hidden audio element (ensures audio always plays)
        if (remoteVideoRef.current && stream) {
          remoteVideoRef.current.srcObject = stream as unknown as MediaProvider;
        }
        // Set remote stream on visible video element (for video calls)
        if (remoteVideoDisplayRef.current && stream) {
          remoteVideoDisplayRef.current.srcObject = stream as unknown as MediaProvider;
        }
        setPeerConnected(true);
        setCallStatus('active');
        // Set user status to "in_call"
        setInCallStatusMutation({ userId: currentUserId }).catch((e) =>
          logger.error('[CallModal] Failed to set in_call status:', e),
        );
        // Start duration timer
        if (!durationTimerRef.current) {
          durationTimerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setCallStatus('active');
          // Set user status to "in_call"
          setInCallStatusMutation({ userId: currentUserId }).catch((e) =>
            logger.error('[CallModal] Failed to set in_call status:', e),
          );
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          handleEnd();
        }
      };

      if (call.isInitiator) {
        // Create offer and store it via dedicated mutation (does NOT change call status)
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await updateOfferMutation({
          callId: call.callId,
          userId: currentUserId,
          offer: JSON.stringify(offer),
        });
        setCallStatus('connecting');
      }
    } catch (err: unknown) {
      logger.error('[CallModal] Media error:', {
        name: err instanceof Error ? err.name : 'Unknown',
        message: err instanceof Error ? err.message : 'Unknown error',
        code: (err as { code?: number })?.code,
      });

      if (
        err instanceof Error &&
        (err.name === 'NotReadableError' || err.name === 'TrackStartError')
      ) {
        const attempt = retryCountRef.current;
        const message =
          attempt >= 3
            ? t('chat.call.mediaErrorFinal')
            : t('chat.call.mediaErrorRetry', { attempt: attempt + 1 });

        setMediaError(message);

        // Clean up any partial state before retrying
        cleanup();

        // Auto-retry after delay (exponential backoff with longer delays for device conflicts)
        if (attempt < 3) {
          // Longer delays to ensure device is fully released
          const delays = [2000, 4000, 8000]; // 2s, 4s, 8s
          const delay = attempt < delays.length ? delays[attempt] : 10000;
          logger.log(`[CallModal] Scheduling retry in ${delay}ms (attempt ${attempt + 2})...`);

          retryTimerRef.current = setTimeout(() => {
            logger.log(`[CallModal] Retrying media initialization (attempt ${attempt + 2})`);
            setRetryCount((c) => c + 1);
            initMedia();
          }, delay);
        }
      } else if (
        err instanceof Error &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      ) {
        setMediaError(t('chat.call.mediaPermissionDenied'));
      } else if (err instanceof Error && err.name === 'NotFoundError') {
        setMediaError(t('chat.call.mediaNotFound'));
      } else {
        setMediaError(t('chat.call.mediaGenericError'));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleEnd is declared below (TDZ); remaining deps are stable mutations/callbacks
  }, [
    call,
    currentUserId,
    iceServers,
    retryCount,
    cleanup,
    setInCallStatusMutation,
    t,
    updateIceMutation,
    updateOfferMutation,
  ]);

  useEffect(() => {
    initMedia();
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only — cleanup is stable (no deps), initMedia runs once

  // Detect when remote side ends the call
  // getActiveCall returns null when status is no longer "ringing"/"active" (i.e. ended/declined/missed)
  const callEndedByRemoteRef = useRef(false);
  useEffect(() => {
    // callData becomes null when the call is ended/declined/missed
    // But it's also null initially before data loads, so only trigger after we've seen it non-null
    if (callData) {
      callEndedByRemoteRef.current = true; // We've seen the call exist
    }
    if (callData === null && callEndedByRemoteRef.current && callStatus !== 'ended') {
      logger.log('[CallModal] Remote side ended the call (callData became null), cleaning up...');
      cleanup();
      setMicOn(false);
      setCamOn(false);
      setCallStatus('ended');
      setTimeout(() => onEnd(), 100);
    }
  }, [callData, callStatus, cleanup, onEnd]);

  // Poll for answer from remote peer
  useEffect(() => {
    if (!callData || !peerConnectionRef.current) return;
    const pc = peerConnectionRef.current;

    callData.participants?.forEach(async (p) => {
      // === Receiver side: read the initiator's SDP offer from p.offer ===
      if (!call.isInitiator && p.userId !== currentUserId && p.offer && !pc.remoteDescription) {
        try {
          logger.log('[CallModal] Receiver: setting remote description from initiator offer');
          const offerSDP = JSON.parse(p.offer) as RTCSessionDescriptionInit;
          await pc.setRemoteDescription(new RTCSessionDescription(offerSDP));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          // Store SDP answer on receiver's participant record (answerCall already called from ChatClient accept button)
          await answerCallMutation({
            callId: call.callId,
            userId: currentUserId,
            answer: JSON.stringify(answer),
          });
        } catch (e) {
          logger.error('[CallModal] Error processing offer:', e);
        }
      }

      // === Initiator side: read the receiver's SDP answer from p.answer ===
      if (call.isInitiator && p.userId !== currentUserId && p.answer && !pc.remoteDescription) {
        try {
          logger.log('[CallModal] Initiator: setting remote description from receiver answer');
          const answerSDP = JSON.parse(p.answer) as RTCSessionDescriptionInit;
          await pc.setRemoteDescription(new RTCSessionDescription(answerSDP));
        } catch (e) {
          logger.error('[CallModal] Error processing answer:', e);
        }
      }

      // === Process ICE candidates from remote (deduplicated) ===
      if (p.userId !== currentUserId && p.iceCandidates) {
        for (const candStr of p.iceCandidates) {
          if (addedIceCandidatesRef.current.has(candStr)) continue;
          addedIceCandidatesRef.current.add(candStr);
          try {
            const cand = new RTCIceCandidate(JSON.parse(candStr) as RTCIceCandidateInit);
            if (pc.remoteDescription) {
              await pc.addIceCandidate(cand);
            }
          } catch (e) {
            logger.error('[CallModal] Error adding ICE candidate:', e);
          }
        }
      }
    });
  }, [callData, answerCallMutation, call.callId, call.isInitiator, currentUserId]);

  const handleEnd = async () => {
    logger.log('[CallModal] Ending call and turning off media devices...');

    // Stop all media tracks and cleanup peer connection
    cleanup();

    // Clear media states
    setMicOn(false);
    setCamOn(false);

    setCallStatus('ended');
    try {
      await endCallMutation({ callId: call.callId, userId: currentUserId });
      // Reset status from "in_call" back to "available"
      await resetCallStatusMutation({ userId: currentUserId });
    } catch (e) {
      logger.error('[CallModal] Error ending call:', e);
    }

    // Give a moment for cleanup to complete before closing
    setTimeout(() => {
      logger.log('[CallModal] Call ended, closing modal');
      onEnd();
    }, 100);
  };

  const toggleMic = () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  };

  const toggleCam = () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setCamOn(track.enabled);
    }
  };

  // Apply speaker mute/unmute to remote audio/video elements
  useEffect(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.muted = !speakerOn;
    }
    if (remoteVideoDisplayRef.current) {
      remoteVideoDisplayRef.current.muted = !speakerOn;
    }
  }, [speakerOn]);

  const statusText = {
    ringing: t('chat.call.ringing'),
    connecting: t('chat.call.connecting'),
    active: formatDuration(duration),
    ended: t('chat.call.ended'),
  }[callStatus];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md">
      {/* Hidden audio element for remote stream — ensures audio works for both call types */}
      <audio ref={remoteVideoRef} autoPlay playsInline style={{ display: 'none' }} />

      <div
        className="relative w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
        style={{
          background: 'linear-gradient(160deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
          minHeight: call.type === 'video' ? '500px' : '320px',
        }}
      >
        {/* Video area */}
        {call.type === 'video' && (
          <div className="relative w-full h-72 bg-black rounded-t-3xl overflow-hidden">
            {/* Remote video */}
            <video
              ref={remoteVideoDisplayRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
              style={{ display: peerConnected ? 'block' : 'none' }}
            />
            {!peerConnected && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Avatar className="w-20 h-20 mx-auto mb-3 ring-4 ring-white/20">
                    <AvatarFallback className="text-2xl font-bold text-white bg-linear-to-br from-purple-600 to-blue-600">
                      {getInitials(call.remoteUserName ?? '?')}
                    </AvatarFallback>
                  </Avatar>
                  <p className="text-white font-semibold">
                    {call.remoteUserName ?? t('chat.call.connecting')}
                  </p>
                </div>
              </div>
            )}
            {/* Local video (PiP) */}
            <div className="absolute bottom-3 right-3 w-24 h-16 rounded-xl overflow-hidden border-2 border-white/30 shadow-lg">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {!camOn && (
                <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
                  <VideoOff className="w-5 h-5 text-gray-400" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audio call UI */}
        {call.type === 'audio' && (
          <div className="flex flex-col items-center py-10 gap-4">
            <div className={cn('relative', callStatus === 'active' && 'animate-pulse')}>
              <Avatar className="w-24 h-24 ring-4 ring-white/20">
                <AvatarFallback className="text-3xl font-bold text-white bg-linear-to-br from-purple-600 to-blue-600">
                  {getInitials(call.remoteUserName ?? '?')}
                </AvatarFallback>
              </Avatar>
              {callStatus === 'active' && (
                <>
                  <span className="absolute inset-0 rounded-full ring-4 ring-green-500/30 animate-ping" />
                  <span
                    className="absolute inset-0 rounded-full ring-4 ring-green-500/20 animate-ping"
                    style={{ animationDelay: '0.5s' }}
                  />
                </>
              )}
            </div>
            <p className="text-white text-xl font-semibold">
              {call.remoteUserName ?? t('common.unknown')}
            </p>
          </div>
        )}

        {/* Media Error */}
        {mediaError && (
          <div className="mx-4 mb-3 px-4 py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-center">
            <p className="text-red-300 text-xs leading-relaxed">{mediaError}</p>
            <div className="flex gap-2 mt-2 justify-center">
              {retryCount < 3 && (
                <button
                  onClick={() => {
                    cleanup();
                    setMediaError(null);
                    setRetryCount((c) => c + 1);
                    // Give device a moment to fully release
                    setTimeout(() => {
                      initMedia();
                    }, 500);
                  }}
                  className="text-xs px-3 py-1 rounded bg-blue-500/30 text-blue-300 hover:bg-blue-500/50 transition"
                >
                  {t('chat.call.retry')}
                </button>
              )}
              <button
                onClick={handleEnd}
                className="text-xs px-3 py-1 rounded bg-red-500/30 text-red-300 hover:bg-red-500/50 transition"
              >
                {t('chat.call.closeCall')}
              </button>
            </div>
          </div>
        )}

        {/* Status */}
        <div className="text-center pb-3">
          <p className="text-white/70 text-sm font-mono">{statusText}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4 pb-8 px-6">
          <ControlBtn
            icon={micOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            label={micOn ? t('chat.call.mute') : t('chat.call.unmute')}
            onClick={toggleMic}
            active={!micOn}
          />
          {call.type === 'video' && (
            <ControlBtn
              icon={camOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              label={camOn ? t('chat.call.cameraOff') : t('chat.call.cameraOn')}
              onClick={toggleCam}
              active={!camOn}
            />
          )}
          <ControlBtn
            icon={speakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            label={speakerOn ? t('chat.call.muteSpeaker') : t('chat.call.unmute')}
            onClick={() => setSpeakerOn(!speakerOn)}
            active={!speakerOn}
          />
          {/* End call */}
          <button
            onClick={handleEnd}
            className="w-14 h-14 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 transition-all hover:scale-110 shadow-lg shadow-red-500/30"
            title={t('chat.call.endCall')}
          >
            <PhoneOff className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Caller info */}
        <div className="absolute top-4 left-4">
          <div className="flex items-center gap-2">
            <Avatar className="w-7 h-7">
              {currentUserAvatar && (
                <Image
                  src={currentUserAvatar}
                  alt=""
                  width={28}
                  height={28}
                  unoptimized
                  className="w-full h-full object-cover rounded-full"
                />
              )}
              <AvatarFallback className="text-xs text-white bg-gray-700">
                {getInitials(currentUserName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-white/70 text-xs">{currentUserName}</span>
          </div>
        </div>

        {/* Call type badge */}
        <div className="absolute top-4 right-4">
          <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 text-white/70 text-xs">
            {call.type === 'video' ? <Video className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
            {call.type === 'video' ? t('chat.call.videoCall') : t('chat.call.audioCall')}
          </span>
        </div>
      </div>
    </div>
  );
}

function ControlBtn({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 group" title={label}>
      <div
        className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110',
          active ? 'bg-white/30' : 'bg-white/10 hover:bg-white/20',
        )}
      >
        <span className="text-white">{icon}</span>
      </div>
      <span className="text-[10px] text-white/50 group-hover:text-white/70">{label}</span>
    </button>
  );
}
