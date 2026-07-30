'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';
import { useRouter } from 'next/navigation';

interface Props {
  userId: string;
  enabled: boolean; // from security settings
  intervalMinutes?: number; // how often to check, default 10
  onVerificationFail?: () => void;
}

/**
 * ContinuousFaceVerification
 * Periodically captures a frame from the camera and compares it
 * against the stored face descriptor using @vladmandic/face-api (already loaded in the app).
 * If verification fails 2× in a row → logs out the user.
 */
export default function ContinuousFaceVerification({
  userId,
  enabled,
  intervalMinutes = 10,
  onVerificationFail,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const failCountRef = useRef(0);
  const [status, setStatus] = useState<'idle' | 'checking' | 'ok' | 'warning' | 'failed'>('idle');
  const [_showWarning, setShowWarning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const performVerification = useCallback(async () => {
    if (!enabled) return;
    setStatus('checking');

    try {
      // Dynamically import face-api to avoid SSR issues
      const faceapi = await import('@vladmandic/face-api');

      // Start camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((resolve) => {
          videoRef.current!.onloadedmetadata = () => {
            videoRef.current!.play().then(resolve);
          };
        });
      }

      // Wait for face to be detected
      await new Promise((r) => setTimeout(r, 1500));

      // Detect face
      const detection = await faceapi
        .detectSingleFace(videoRef.current!, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();

      stopCamera();

      if (!detection) {
        // No face detected — could be looking away
        failCountRef.current += 1;
        setStatus('warning');
        setShowWarning(true);
        if (failCountRef.current >= 2) {
          await handleVerificationFailed('No face detected in continuous check');
        }
        return;
      }

      // Get stored descriptor from server
      const res = await fetch(`/api/security/face-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          descriptor: Array.from(detection.descriptor),
        }),
      });

      const data = await res.json();

      if (data.match) {
        failCountRef.current = 0;
        setStatus('ok');
        setShowWarning(false);
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        failCountRef.current += 1;
        setStatus('warning');
        setShowWarning(true);
        if (failCountRef.current >= 2) {
          await handleVerificationFailed('Face does not match registered profile');
        }
      }
    } catch (err) {
      // Camera not available or permission denied — skip silently
      logger.warn('Continuous face verification skipped:', err);
      stopCamera();
      setStatus('idle');
    }
  }, [enabled, userId, stopCamera]);

  const handleVerificationFailed = useCallback(
    async (reason: string) => {
      setStatus('failed');
      setShowWarning(false);

      // Log security event
      await fetch('/api/security/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          event: 'continuous_face_verification_failed',
          details: reason,
        }),
      }).catch(() => {});

      onVerificationFail?.();

      // Auto logout after 3 seconds
      setTimeout(async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        router.replace('/login?reason=identity_verification_failed');
      }, 3000);
    },
    [userId, onVerificationFail, router],
  );

  useEffect(() => {
    if (!enabled) return;

    const intervalMs = intervalMinutes * 60 * 1000;

    intervalRef.current = setInterval(performVerification, intervalMs);

    return () => {
      clearInterval(intervalRef.current!);
      stopCamera();
    };
  }, [enabled, intervalMinutes, performVerification, stopCamera]);

  if (!enabled) return null;

  return (
    <>
      {/* Hidden video element for face capture */}
      <video ref={videoRef} style={{ display: 'none' }} muted playsInline />

      {/* Status indicator — small badge in corner */}
      {status !== 'idle' && (
        <div className="fixed bottom-4 left-4 z-50">
          {status === 'checking' && (
            <div className="flex items-center gap-2 bg-blue-900/90 border border-blue-500 text-blue-100 px-3 py-2 rounded-lg text-sm shadow-lg">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              {t('faceVerification.verifying')}
            </div>
          )}
          {status === 'ok' && (
            <div className="flex items-center gap-2 bg-green-900/90 border border-green-500 text-green-100 px-3 py-2 rounded-lg text-sm shadow-lg">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              {t('faceVerification.verified')}
            </div>
          )}
          {status === 'warning' && (
            <div className="flex items-center gap-2 bg-yellow-900/90 border border-yellow-500 text-yellow-100 px-3 py-2 rounded-lg text-sm shadow-lg">
              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
              {t('faceVerification.couldNotVerify')}
            </div>
          )}
          {status === 'failed' && (
            <div className="flex items-center gap-2 bg-red-900/90 border border-red-500 text-red-100 px-3 py-2 rounded-lg text-sm shadow-lg animate-pulse">
              {t('faceVerification.failed')}
            </div>
          )}
        </div>
      )}
    </>
  );
}
