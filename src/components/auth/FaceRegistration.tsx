'use client';
import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { useRef, useState, useEffect } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, CheckCircle, XCircle } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { CustomSelect } from '@/components/ui/CustomSelect';
import { toast } from 'sonner';
import { detectFace, detectFaceBox, loadFaceApiModels, createCanvasFromVideo } from '@/lib/faceApi';
import { uploadAvatarToCloudinary } from '@/actions/cloudinary';
import { Id } from '../../../convex/_generated/dataModel';
import { logger } from '@/lib/logger';
import { getErrorName, getErrorMessage } from '@/lib/error-handler';

interface FaceRegistrationProps {
  userId: Id<'users'>;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function FaceRegistration({ userId, onSuccess, onCancel }: FaceRegistrationProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>('');

  const registerFace = useMutation(api.faceRecognition.registerFace);

  useEffect(() => {
    // Load models on mount
    loadFaceApiModels().catch((err) => {
      logger.error('Failed to load face models:', err);
      toast.error(t('faceRegistration.modelLoadFailed', 'Failed to load face recognition models'));
    });

    // Get available cameras
    async function getCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        logger.log('Available cameras:', videoDevices);
        setCameras(videoDevices);
        if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0]!.deviceId);
        }
      } catch (err) {
        logger.error('Failed to enumerate devices:', err);
      }
    }
    getCameras();

    return () => {
      // Cleanup webcam on unmount
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream, t]);

  const startWebcam = async () => {
    try {
      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error(
          t(
            'faceRegistration.cameraNotSupported',
            'Camera access is not supported in this browser. Please use Chrome, Edge, or Firefox.',
          ),
        );
        return;
      }

      logger.log('🎥 Requesting camera access...');
      logger.log('Selected camera:', selectedCamera);

      const constraints: MediaStreamConstraints = {
        video: selectedCamera
          ? {
              deviceId: { exact: selectedCamera },
              width: { ideal: 640 },
              height: { ideal: 480 },
            }
          : {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: 'user',
            },
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      logger.log('✅ Camera access granted');

      // Set state to trigger video element rendering
      setStream(mediaStream);
      setIsWebcamActive(true);

      // Wait for React to render the video element
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Wait for video element to be available in DOM
      const waitForVideoElement = async (maxAttempts = 20) => {
        for (let i = 0; i < maxAttempts; i++) {
          if (videoRef.current) {
            logger.log('📹 Video element found on attempt', i + 1);
            return true;
          }
          logger.log(`⏳ Waiting for video element... attempt ${i + 1}`);
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return false;
      };

      const videoElementAvailable = await waitForVideoElement();

      if (!videoElementAvailable || !videoRef.current) {
        logger.error('❌ Video element ref is null after waiting!');
        toast.error(
          t('faceRegistration.videoNotFound', 'Video element not found. Please try again.'),
        );
        // Stop the stream and reset state
        mediaStream.getTracks().forEach((track) => track.stop());
        setStream(null);
        setIsWebcamActive(false);
        return;
      }

      logger.log('📹 Setting up video element...');
      videoRef.current.srcObject = mediaStream;

      logger.log('⏳ Waiting for metadata to load...');

      // Ensure video plays
      const playVideo = async () => {
        if (!videoRef.current) {
          logger.error('❌ videoRef is null when trying to play');
          return;
        }

        try {
          logger.log('🎬 Attempting to play video...');
          logger.log('Video element state:', {
            readyState: videoRef.current.readyState,
            paused: videoRef.current.paused,
            srcObject: !!videoRef.current.srcObject,
          });
          await videoRef.current.play();
          logger.log('✅ Video playing successfully');
          detectFaceLoop(true); // Force start with true flag
        } catch (err) {
          logger.error('❌ Failed to play video:', err);
          toast.error(t('faceRegistration.videoPlaybackFailed', 'Failed to start video playback'));
        }
      };

      // Wait for metadata and play
      videoRef.current.onloadedmetadata = () => {
        logger.log('✅ Video metadata loaded');
        playVideo();
      };

      // Fallback: try to play after a short delay if metadata event doesn't fire
      setTimeout(() => {
        if (videoRef.current && isWebcamActive) {
          logger.log("⚠️ Metadata event didn't fire, trying to play anyway...");
          playVideo();
        }
      }, 1000);
    } catch (error) {
      logger.error('❌ Error accessing webcam:', error);

      // Reset state on error
      setIsWebcamActive(false);
      setStream(null);

      const errName = getErrorName(error);
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        toast.error(
          t(
            'faceRegistration.cameraPermissionDenied',
            'Camera permission denied. Please allow camera access in your browser settings.',
          ),
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        toast.error(
          t(
            'faceRegistration.noCameraFound',
            'No camera found. Please connect a camera and try again.',
          ),
        );
      } else if (errName === 'NotReadableError' || errName === 'TrackStartError') {
        toast.error(
          t('faceRegistration.cameraInUse', 'Camera is already in use by another application.'),
        );
      } else {
        toast.error(
          t('faceRegistration.cameraAccessError', 'Unable to access camera: {{message}}', {
            message: getErrorMessage(error),
          }),
        );
      }
    }
  };

  const stopWebcam = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsWebcamActive(false);
    setFaceDetected(false);
  };

  const detectFaceLoop = (forceStart = false) => {
    logger.log('🔄 Starting face detection loop...');
    logger.log(
      'forceStart:',
      forceStart,
      'videoRef.current:',
      !!videoRef.current,
      'isWebcamActive:',
      isWebcamActive,
    );

    if (!videoRef.current) {
      logger.warn('⚠️ Cannot start detection loop - videoRef is null');
      return;
    }

    if (!forceStart && !isWebcamActive) {
      logger.warn('⚠️ Cannot start detection loop - isWebcamActive is false');
      return;
    }

    const interval = setInterval(async () => {
      if (!videoRef.current) {
        logger.log('🛑 Stopping face detection loop - videoRef is null');
        clearInterval(interval);
        return;
      }

      try {
        // Check if video is actually playing and has valid dimensions
        if (videoRef.current.readyState < 2) {
          logger.log('⏳ Video not ready yet, readyState:', videoRef.current.readyState);
          return;
        }

        // Detector only — this loop just drives the "face detected" badge, so it
        // has no use for the landmarks or the descriptor that cost most of the time.
        const detection = await detectFaceBox(videoRef.current);
        const faceFound = !!detection;

        // Only log when face detection status changes
        if (faceFound !== faceDetected) {
          logger.log(faceFound ? '✅ Face detected!' : '❌ No face detected');
        }

        setFaceDetected(faceFound);
      } catch (error) {
        logger.error('Error in face detection loop:', error);
      }
    }, 500);

    return () => clearInterval(interval);
  };

  const captureFace = async () => {
    if (!videoRef.current) return;

    setIsProcessing(true);

    try {
      // Detect face and get descriptor
      const detection = await detectFace(videoRef.current);

      if (!detection) {
        toast.error(
          t(
            'faceRegistration.noFaceDetected',
            'No face detected. Please position your face in the frame.',
          ),
        );
        setIsProcessing(false);
        return;
      }

      // Get face descriptor (128-dimensional array)
      const descriptor = Array.from(detection.descriptor);

      // Create canvas and capture image
      const canvas = createCanvasFromVideo(videoRef.current);
      const base64Image = canvas.toDataURL('image/jpeg', 0.95);

      // Upload face image to Cloudinary
      const imageUrl = await uploadAvatarToCloudinary(base64Image, `face-${userId}`);

      // Save to database
      await registerFace({
        userId,
        faceDescriptor: descriptor,
        faceImageUrl: imageUrl,
      });

      setCapturedImage(canvas.toDataURL());
      stopWebcam();

      toast.success(
        t(
          'faceRegistration.faceRegistered',
          'Face registered successfully! You can now use Face ID to login.',
        ),
      );
      onSuccess?.();
    } catch (error) {
      logger.error('Error capturing face:', error);
      toast.error(
        t('faceRegistration.registrationFailed', 'Failed to register face. Please try again.'),
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="p-6 bg-[var(--surface-base)] border-[var(--border-primary)]">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-(--text-primary)">
            {t('faceRegistration.title', 'Register Face ID')}
          </h3>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            {t(
              'faceRegistration.subtitle',
              'Position your face in the camera frame to register Face ID login',
            )}
          </p>
        </div>

        {/* Camera Preview */}
        <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
          {!isWebcamActive && !capturedImage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60">
              <Camera className="w-16 h-16 mb-4" />
              <p className="text-sm">
                {t('faceRegistration.cameraNotActive', 'Camera not active')}
              </p>
            </div>
          )}

          {isWebcamActive && (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Face detection indicator */}
              <div className="absolute top-4 right-4">
                {faceDetected ? (
                  <div className="flex items-center gap-2 bg-green-500/90 text-white px-3 py-1.5 rounded-full text-sm">
                    <CheckCircle className="w-4 h-4" />
                    {t('faceRegistration.faceDetected', 'Face Detected')}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-red-500/90 text-white px-3 py-1.5 rounded-full text-sm">
                    <XCircle className="w-4 h-4" />
                    {t('faceRegistration.noFace', 'No Face')}
                  </div>
                )}
              </div>

              {/* Face frame guide */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-80 border-4 border-white/50 rounded-2xl" />
              </div>
            </>
          )}

          {capturedImage && (
            <Image
              src={capturedImage}
              alt="Captured face"
              width={640}
              height={480}
              unoptimized
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Camera Selection */}
        {!isWebcamActive && !capturedImage && cameras.length > 1 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-(--text-secondary)">
              {t('faceRegistration.selectCamera', 'Select Camera:')}
            </label>
            <CustomSelect
              value={selectedCamera}
              onChange={setSelectedCamera}
              fullWidth
              options={cameras.map((camera) => ({
                value: camera.deviceId,
                label: camera.label || `Camera ${cameras.indexOf(camera) + 1}`,
              }))}
              triggerClassName="w-full px-3 py-2 rounded-lg border border-[var(--border-primary)] bg-[var(--surface-base)] text-(--text-primary)"
              dropdownClassName="bg-[var(--surface-base)] border border-[var(--border-primary)] text-[var(--text-primary)]"
            />
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3">
          {!isWebcamActive && !capturedImage && (
            <Button onClick={startWebcam} className="flex-1">
              <Camera className="w-4 h-4 mr-2" />
              {t('faceRegistration.startCamera', 'Start Camera')}
            </Button>
          )}

          {isWebcamActive && (
            <>
              <Button
                onClick={captureFace}
                disabled={!faceDetected || isProcessing}
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <ShieldLoader size="xs" variant="inline" className="mr-2" />
                    {t('common.processing', 'Processing...')}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {t('faceRegistration.captureAndRegister', 'Capture & Register')}
                  </>
                )}
              </Button>
              <Button onClick={stopWebcam} variant="outline">
                {t('common.cancel', 'Cancel')}
              </Button>
            </>
          )}

          {capturedImage && onCancel && (
            <Button onClick={onCancel} variant="outline" className="flex-1">
              {t('common.close', 'Close')}
            </Button>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-400 mb-2">
            {t('faceRegistration.instructions', 'Instructions:')}
          </h4>
          <ul className="text-xs text-(--text-secondary) space-y-1 list-disc list-inside">
            <li>{t('faceRegistration.positionFace', 'Position your face within the frame')}</li>
            <li>{t('faceRegistration.goodLighting', 'Ensure good lighting on your face')}</li>
            <li>{t('faceRegistration.lookAtCamera', 'Look directly at the camera')}</li>
            <li>{t('faceRegistration.removeGlasses', 'Remove glasses or hats if possible')}</li>
            <li>{t('faceRegistration.waitForDetection', 'Wait for "Face Detected" indicator')}</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
