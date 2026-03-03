"use client";

import { useTranslation } from "react-i18next";
import { useRef, useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Camera, CheckCircle, XCircle, ScanFace } from "lucide-react";
import { ShieldLoader } from "@/components/ui/ShieldLoader";
import { toast } from "sonner";
import { detectFace, loadFaceApiModels, findBestMatch, isFaceMatch } from "@/lib/faceApi";
import { useAuthStore } from "@/store/useAuthStore";
// Removed loginAction import - using API route instead
import { useRouter } from "next/navigation";

export function FaceLogin() {
  
  const { t } = useTranslation();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [matchStatus, setMatchStatus] = useState<"idle" | "searching" | "found" | "not_found">("idle");
  const [matchedUser, setMatchedUser] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string>("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [scanningProgress, setScanningProgress] = useState(0);
  const [detectionQuality, setDetectionQuality] = useState<"poor" | "good" | "excellent">("poor");
  const [autoLoginTriggered, setAutoLoginTriggered] = useState(false);
  const [lastAttemptTime, setLastAttemptTime] = useState(0);

  const setUser = useAuthStore((state) => state.setUser);
  const allFaceDescriptors = useQuery(api.faceRecognition.getAllFaceDescriptors);
  const verifyFaceLogin = useMutation(api.faceRecognition.verifyFaceLogin);
  const recordFaceIdAttempt = useMutation(api.users.recordFaceIdAttempt);
  const checkFaceIdStatus = useQuery(api.users.checkFaceIdStatus, 
    matchedUser ? { email: matchedUser } : "skip"
  );

  // Debug: Log face descriptors count
  useEffect(() => {
    if (allFaceDescriptors !== undefined) {
      console.log(`📊 Face descriptors loaded: ${allFaceDescriptors.length} registered faces`);
      if (allFaceDescriptors.length === 0) {
        console.warn("⚠️ No registered faces in the database");
      }
    }
  }, [allFaceDescriptors]);

  useEffect(() => {
    // Load models on mount
    loadFaceApiModels().catch((err) => {
      console.error("Failed to load face models:", err);
      toast.error("Failed to load face recognition models");
    });

    // Get available cameras
    async function getCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        console.log("Available cameras:", videoDevices);
        setCameras(videoDevices);
        if (videoDevices.length > 0) {
          setSelectedCamera(videoDevices[0].deviceId);
        }
      } catch (err) {
        console.error("Failed to enumerate devices:", err);
      }
    }
    getCameras();

    return () => {
      // Cleanup webcam on unmount
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [stream]);

  const startWebcam = async () => {
    // Проверка блокировки перед запуском камеры
    if (isBlocked) {
      toast.error("Face ID is blocked. Please use email/password login.", {
        duration: 5000,
      });
      return;
    }

    try {
      // Check if mediaDevices is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error("Camera access is not supported in this browser. Please use Chrome, Edge, or Firefox.");
        return;
      }

      console.log("🎥 Requesting camera access...");
      console.log("Selected camera:", selectedCamera);
      
      const constraints: MediaStreamConstraints = {
        video: selectedCamera ? {
          deviceId: { exact: selectedCamera },
          width: { ideal: 640 },
          height: { ideal: 480 },
        } : {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user" 
        },
      };
      
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      console.log("✅ Camera access granted");
      console.log("📹 Media stream tracks:", mediaStream.getTracks().map(t => ({
        kind: t.kind,
        label: t.label,
        enabled: t.enabled,
        readyState: t.readyState
      })));
      
      // Set state to trigger video element rendering
      setStream(mediaStream);
      setIsWebcamActive(true);
      
      // Wait for React to render the video element
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Wait for video element to be available in DOM
      const waitForVideoElement = async (maxAttempts = 20) => {
        for (let i = 0; i < maxAttempts; i++) {
          if (videoRef.current) {
            console.log("📹 Video element found on attempt", i + 1);
            return true;
          }
          console.log(`⏳ Waiting for video element... attempt ${i + 1}`);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        return false;
      };
      
      const videoElementAvailable = await waitForVideoElement();
      
      if (!videoElementAvailable || !videoRef.current) {
        console.error("❌ Video element ref is null after waiting!");
        toast.error("Video element not found. Please try again.");
        // Stop the stream and reset state
        mediaStream.getTracks().forEach(track => track.stop());
        setStream(null);
        setIsWebcamActive(false);
        return;
      }
      
      console.log("📹 Setting up video element...");
      videoRef.current.srcObject = mediaStream;
        
        console.log("⏳ Waiting for metadata to load...");
        
        // Ensure video plays
        const playVideo = async () => {
          if (!videoRef.current) {
            console.error("❌ videoRef is null when trying to play");
            return;
          }
          
          try {
            console.log("🎬 Attempting to play video...");
            console.log("Video element state:", {
              readyState: videoRef.current.readyState,
              paused: videoRef.current.paused,
              srcObject: !!videoRef.current.srcObject
            });
            await videoRef.current.play();
            console.log("✅ Video playing successfully");
            console.log("🎯 About to start face detection loop...");
            console.log("videoRef.current exists?", !!videoRef.current);
            console.log("isWebcamActive?", isWebcamActive);
            detectFaceLoop(true); // Force start with true flag
          } catch (err) {
            console.error("❌ Failed to play video:", err);
            toast.error("Failed to start video playback");
          }
        };
        
        // Wait for metadata and play
        videoRef.current.onloadedmetadata = () => {
          console.log("✅ Video metadata loaded");
          playVideo();
        };
        
      // Fallback: try to play after a short delay if metadata event doesn't fire
      setTimeout(() => {
        if (videoRef.current && isWebcamActive) {
          console.log("⚠️ Metadata event didn't fire, trying to play anyway...");
          playVideo();
        }
      }, 1000);
    } catch (error: any) {
      console.error("❌ Error accessing webcam:", error);
      console.error("Error details:", {
        name: error?.name,
        message: error?.message,
        constraint: error?.constraint,
        stack: error?.stack
      });
      
      // Reset state on error
      setIsWebcamActive(false);
      setStream(null);
      
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
        toast.error("Camera permission denied. Please allow camera access in your browser settings.", {
          duration: 6000,
          description: "Click the lock icon in the address bar and allow camera access."
        });
      } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
        toast.error("No camera found. Please connect a camera and try again.");
      } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
        toast.error("Camera is already in use by another application. Please close other apps using the camera.");
      } else if (error.name === "OverconstrainedError" || error.name === "ConstraintNotSatisfiedError") {
        console.log("🔄 Camera constraint error, retrying with basic settings...");
        toast.error("Selected camera doesn't support required settings. Trying basic settings...");
        
        // Retry with minimal constraints
        try {
          const basicStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" }
          });
          setStream(basicStream);
          setIsWebcamActive(true);
          toast.success("Camera started successfully!");
        } catch (retryError: any) {
          console.error("❌ Retry failed:", retryError);
          toast.error(`Still unable to access camera: ${retryError.message}`);
        }
      } else {
        toast.error(`Unable to access camera: ${error.message || "Unknown error"}`, {
          description: `Error type: ${error.name || "Unknown"}`
        });
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
    setMatchStatus("idle");
    setMatchedUser(null);
    setScanningProgress(0);
    setDetectionQuality("poor");
    setAutoLoginTriggered(false);
  };

  // Функция для сброса блокировки Face ID (можно вызвать после успешного входа через email/password)
  const resetFaceIdBlock = () => {
    setIsBlocked(false);
    setFailedAttempts(0);
    toast.success("Face ID has been unlocked. You can try again.");
  };

  const detectFaceLoop = (forceStart = false) => {
    console.log("🔄 Starting face detection loop...");
    console.log("forceStart:", forceStart, "videoRef.current:", !!videoRef.current, "isWebcamActive:", isWebcamActive);
    
    if (!videoRef.current) {
      console.warn("⚠️ Cannot start detection loop - videoRef is null");
      return;
    }
    
    if (!forceStart && !isWebcamActive) {
      console.warn("⚠️ Cannot start detection loop - isWebcamActive is false");
      return;
    }

    const interval = setInterval(async () => {
      if (!videoRef.current) {
        console.log("🛑 Stopping face detection loop - videoRef is null");
        clearInterval(interval);
        return;
      }

      try {
        // Check if video is actually playing and has valid dimensions
        if (videoRef.current.readyState < 2) {
          console.log("⏳ Video not ready yet, readyState:", videoRef.current.readyState);
          return;
        }

        const detection = await detectFace(videoRef.current);
        const faceFound = !!detection;
        
        // Only log when face detection status changes
        if (faceFound !== faceDetected) {
          console.log(faceFound ? "✅ Face detected!" : "❌ No face detected");
        }
        
        setFaceDetected(faceFound);

        // Анимированное сканирование при обнаружении лица
        if (faceFound && detection) {
          // Симуляция прогресса сканирования
          let currentProgress = 0;
          setScanningProgress((prev) => {
            const newProgress = Math.min(prev + 20, 100);
            currentProgress = newProgress;
            if (newProgress === 100 && prev !== 100) {
              console.log("📊 Scanning reached 100%!");
            }
            return newProgress;
          });

          // Определение качества детекции на основе размера лица
          const box = detection.detection.box;
          const faceSize = box.width * box.height;
          
          let quality: "poor" | "good" | "excellent" = "poor";
          if (faceSize > 40000) {
            quality = "excellent";
          } else if (faceSize > 20000) {
            quality = "good";
          }
          setDetectionQuality(quality);
          
          // Auto-login when face is detected with good quality and scanning is complete
          console.log("🔍 Auto-login check:", {
            quality,
            scanningProgress: currentProgress,
            autoLoginTriggered,
            isProcessing,
            shouldTrigger: (quality === "good" || quality === "excellent") && currentProgress >= 100 && !autoLoginTriggered && !isProcessing
          });
          
          if ((quality === "good" || quality === "excellent") && currentProgress >= 100 && !autoLoginTriggered && !isProcessing) {
            // Cooldown: prevent multiple attempts within 5 seconds
            const now = Date.now();
            if (now - lastAttemptTime < 5000) {
              console.warn("⚠️ Cooldown active - preventing rapid retry");
              return;
            }
            
            // Check if there are registered faces before triggering auto-login
            if (!allFaceDescriptors || allFaceDescriptors.length === 0) {
              console.warn("⚠️ Cannot auto-trigger login - no registered faces");
              setScanningProgress(0);
              setAutoLoginTriggered(false);
              toast.error("No registered faces found. Please register your face first.", { id: 'no-faces' });
              return;
            }
            
            console.log("🚀 Auto-triggering face login NOW!");
            setAutoLoginTriggered(true);
            setLastAttemptTime(now);
            setTimeout(() => {
              console.log("🚀 Calling attemptFaceLogin...");
              attemptFaceLogin();
            }, 100); // Small delay to ensure state is updated
          }
        } else {
          setScanningProgress(0);
          setDetectionQuality("poor");
          setAutoLoginTriggered(false);
        }
      } catch (error) {
        console.error("❌ Error in face detection loop:", error);
      }
    }, 500);

    return () => clearInterval(interval);
  };

  const attemptFaceLogin = useCallback(async () => {
    // Проверка блокировки
    if (isBlocked) {
      console.warn("⚠️ Face ID is blocked");
      return;
    }

    if (!videoRef.current) {
      console.warn("⚠️ Video ref is null");
      return;
    }

    if (!allFaceDescriptors || allFaceDescriptors.length === 0) {
      console.warn("⚠️ No registered faces found in the system");
      // Only show toast once, not repeatedly
      if (!isProcessing) {
        toast.error("No registered faces found in the system. Please register your face first.");
        setAutoLoginTriggered(false); // Reset to prevent infinite loop
      }
      return;
    }

    setIsProcessing(true);
    setMatchStatus("searching");

    try {
      console.log("🔍 Step 1: Detecting face...");
      // Detect face and get descriptor
      const detection = await detectFace(videoRef.current);

      if (!detection) {
        console.error("❌ No face detected in frame");
        toast.error("No face detected. Please position your face in the frame.");
        setIsProcessing(false);
        setMatchStatus("not_found");
        
        // Локальное увеличение счетчика неудачных попыток
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        
        if (newAttempts >= 3) {
          setIsBlocked(true);
          toast.error("Too many failed attempts. Face ID is now blocked. Please use email/password login.");
          stopWebcam();
        }
        
        setTimeout(() => setMatchStatus("idle"), 2000);
        return;
      }

      console.log("✅ Face detected, getting descriptor...");
      // Get face descriptor
      const descriptor = detection.descriptor;
      console.log("✅ Descriptor obtained, length:", descriptor.length);

      // Find best match from registered faces
      console.log("🔍 Step 2: Finding best match from", allFaceDescriptors.length, "registered faces");
      const knownFaces = allFaceDescriptors.map((user) => ({
        userId: user.userId,
        name: user.name,
        descriptor: user.faceDescriptor,
      }));

      const bestMatch = findBestMatch(descriptor, knownFaces);
      console.log("🎯 Best match found:", bestMatch);

      if (!bestMatch) {
        console.error("❌ No matching face found");
        toast.error("No matching face found.");
        setMatchStatus("not_found");
        setTimeout(() => setMatchStatus("idle"), 2000);
        setIsProcessing(false);
        return;
      }

      // Check if match is good enough (threshold: 0.6)
      console.log("🔍 Step 3: Checking match quality. Distance:", bestMatch.distance, "Threshold: 0.6");
      if (!isFaceMatch(bestMatch.distance, 0.6)) {
        console.error("❌ Match quality too low. Distance:", bestMatch.distance);
        
        // Записываем неудачную попытку в базу данных
        if (bestMatch.userId) {
          try {
            const result = await recordFaceIdAttempt({ 
              userId: bestMatch.userId as any, 
              success: false 
            });
            
            setFailedAttempts(result.attempts);
            
            if (result.blocked) {
              setIsBlocked(true);
              toast.error("Too many failed attempts. Face ID is now blocked. Please use email/password login.");
              stopWebcam();
            } else {
              toast.error(`Face not recognized. Attempt ${result.attempts} of 3.`);
            }
          } catch (error) {
            console.error("Failed to record attempt:", error);
            // Фоллбэк на локальное увеличение
            const newAttempts = failedAttempts + 1;
            setFailedAttempts(newAttempts);
            toast.error(`Face not recognized. Attempt ${newAttempts} of 3.`);
            
            if (newAttempts >= 3) {
              setIsBlocked(true);
              toast.error("Too many failed attempts. Face ID is now blocked.");
              stopWebcam();
            }
          }
        }
        
        setMatchStatus("not_found");
        setTimeout(() => setMatchStatus("idle"), 2000);
        setIsProcessing(false);
        return;
      }

      // Match found! Успешная попытка - записываем в БД и сбрасываем счетчик
      console.log("✅ Match confirmed! User:", bestMatch.name);
      
      // Записываем успешную попытку в базу данных
      try {
        await recordFaceIdAttempt({ 
          userId: bestMatch.userId as any, 
          success: true 
        });
      } catch (error) {
        console.error("Failed to record successful attempt:", error);
      }
      
      setFailedAttempts(0);
      setMatchedUser(bestMatch.name);
      setMatchStatus("found");

      // Find matched user data
      console.log("🔍 Step 4: Finding matched user data...");
      const matchedUserData = allFaceDescriptors.find(u => u.userId === bestMatch.userId);
      if (!matchedUserData) {
        console.error("❌ User data not found in allFaceDescriptors");
        throw new Error("User data not found");
      }
      console.log("✅ Matched user data:", matchedUserData);

      console.log("🔍 Step 5: Creating session via API...");
      console.log("📧 Login params:", {
        email: matchedUserData.email,
        isFaceLogin: true
      });
      
      try {
        const response = await fetch('/api/auth/face-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: matchedUserData.email,
            isFaceLogin: true,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Login failed');
        }

        const data = await response.json();
        console.log("✅ Session created successfully", data);
      } catch (loginError: any) {
        console.error("❌ Face login API failed:", loginError);
        console.error("Error details:", {
          name: loginError?.name,
          message: loginError?.message,
        });
        throw new Error(`Login failed: ${loginError?.message || 'Unknown error'}`);
      }

      // Don't update auth store here - let Providers.tsx load from session
      console.log("🔍 Step 6: Session created, user data will be loaded by Providers");
      
      // Redirect to dashboard after ensuring session is set
      console.log("🔍 Step 7: Redirecting to dashboard...");
      
      // Wait for session cookies to be properly set
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Hard navigation to ensure fresh page load with new session
      // Providers will load user data from session automatically
      window.location.href = "/dashboard";

    } catch (error: any) {
      console.error("❌ Error during face login:", error);
      console.error("Error name:", error?.name);
      console.error("Error message:", error?.message);
      console.error("Error stack:", error?.stack);
      
      // Determine specific error message
      let errorMessage = "Failed to login with Face ID. Please try again.";
      if (error?.message?.includes("Failed to fetch")) {
        errorMessage = "Network error: Cannot connect to server. Please check your connection.";
      } else if (error?.message?.includes("Login action failed")) {
        errorMessage = "Server error: " + (error.message.replace("Login action failed: ", ""));
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      // Only show toast once with specific error
      toast.error(errorMessage, { 
        id: 'face-login-error',
        duration: 5000 
      });
      
      setMatchStatus("not_found");
      setAutoLoginTriggered(false); // Reset to allow retry
      setScanningProgress(0); // Reset scanning
      setTimeout(() => setMatchStatus("idle"), 2000);
    } finally {
      setIsProcessing(false);
    }
  }, [isBlocked, allFaceDescriptors, recordFaceIdAttempt, failedAttempts, setUser, isProcessing]);

  return (
    <Card className="p-6 bg-[var(--surface-base)] border-[var(--border-primary)]">
      <div className="space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-4">
            <ScanFace className="w-8 h-8 text-blue-500" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">
            Face ID Login
          </h3>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            Position your face in the camera to login
          </p>
        </div>

        {/* Camera Preview */}
        <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
          {!isWebcamActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/60">
              <Camera className="w-16 h-16 mb-4" />
              <p className="text-sm">Camera not active</p>
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
              <div className="absolute top-4 right-4 space-y-2">
                {faceDetected ? (
                  <div className="flex items-center gap-2 bg-green-500/90 text-white px-3 py-1.5 rounded-full text-sm animate-pulse">
                    <CheckCircle className="w-4 h-4" />
                    Face Detected
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-red-500/90 text-white px-3 py-1.5 rounded-full text-sm">
                    <XCircle className="w-4 h-4" />
                    No Face
                  </div>
                )}
                
                {/* Quality indicator */}
                {faceDetected && (
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs text-white ${
                    detectionQuality === "excellent" ? "bg-green-600/90" :
                    detectionQuality === "good" ? "bg-yellow-600/90" : "bg-orange-600/90"
                  }`}>
                    {detectionQuality === "excellent" && "✓ Excellent"}
                    {detectionQuality === "good" && "◐ Good"}
                    {detectionQuality === "poor" && "⚠ Move Closer"}
                  </div>
                )}
              </div>

              {/* Match status */}
              {matchStatus !== "idle" && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                  {matchStatus === "searching" && (
                    <div className="flex items-center gap-2 bg-blue-500/90 text-white px-4 py-2 rounded-full text-sm">
                      <ShieldLoader size="xs" variant="inline" />
                      Searching for match...
                    </div>
                  )}
                  {matchStatus === "found" && matchedUser && (
                    <div className="flex items-center gap-2 bg-green-500/90 text-white px-4 py-2 rounded-full text-sm">
                      <CheckCircle className="w-4 h-4" />
                      Welcome, {matchedUser}!
                    </div>
                  )}
                  {matchStatus === "not_found" && (
                    <div className="flex items-center gap-2 bg-red-500/90 text-white px-4 py-2 rounded-full text-sm">
                      <XCircle className="w-4 h-4" />
                      Face not recognized
                    </div>
                  )}
                </div>
              )}

              {/* Face frame guide with animated scanning */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative">
                  <div className={`w-64 h-80 border-4 rounded-2xl transition-all duration-300 ${
                    faceDetected ? "border-green-500/70 shadow-[0_0_20px_rgba(34,197,94,0.5)]" : "border-white/50"
                  }`}>
                    {/* Scanning animation */}
                    {faceDetected && scanningProgress > 0 && (
                      <>
                        {/* Scanning line */}
                        <div 
                          className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-pulse"
                          style={{
                            top: `${scanningProgress}%`,
                            transition: 'top 0.5s ease-out'
                          }}
                        />
                        
                        {/* Corner indicators */}
                        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-green-400 animate-pulse" />
                        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-green-400 animate-pulse" />
                        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-green-400 animate-pulse" />
                        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-green-400 animate-pulse" />
                      </>
                    )}
                  </div>
                  
                  {/* Scanning progress */}
                  {faceDetected && scanningProgress > 0 && (
                    <div className="absolute -bottom-8 left-0 right-0 text-center">
                      <div className="text-white text-xs bg-black/50 px-2 py-1 rounded">
                        Scanning: {scanningProgress}%
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Camera Selection */}
        {!isWebcamActive && cameras.length > 1 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--text-secondary)]">
              Select Camera:
            </label>
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border-primary)] bg-[var(--surface-base)] text-[var(--text-primary)]"
            >
              {cameras.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label || `Camera ${cameras.indexOf(camera) + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Attempts counter */}
        {failedAttempts > 0 && !isBlocked && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3">
            <p className="text-sm text-orange-600 dark:text-orange-400 text-center">
              ⚠️ Failed attempts: {failedAttempts} of 3
            </p>
          </div>
        )}

        {/* Blocked warning */}
        {isBlocked && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <p className="text-sm text-red-600 dark:text-red-400 text-center font-medium">
              🚫 Face ID Blocked
            </p>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 text-center mt-1">
              Too many failed attempts. Please use email/password login.
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3">
          {!isWebcamActive && !isBlocked && (
            <Button onClick={startWebcam} className="flex-1">
              <Camera className="w-4 h-4 mr-2" />
              Start Face Login
            </Button>
          )}

          {isWebcamActive && !isBlocked && (
            <>
              {isProcessing ? (
                <div className="flex-1 flex items-center justify-center gap-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-4 py-3 rounded-lg border border-blue-500/20">
                  <ShieldLoader size="xs" variant="inline" />
                  <span className="text-sm font-medium">Authenticating...</span>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 bg-green-500/10 text-green-600 dark:text-green-400 px-4 py-3 rounded-lg border border-green-500/20">
                  <ScanFace className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {scanningProgress >= 100 ? "Ready to login..." : `Scanning... ${scanningProgress}%`}
                  </span>
                </div>
              )}
              <Button onClick={stopWebcam} variant="outline">
                Cancel
              </Button>
            </>
          )}
          
          {/* Alternative login button when blocked */}
          {isBlocked && (
            <Button 
              onClick={() => router.push('/login')} 
              className="flex-1"
              variant="default"
            >
              Use Email/Password Login
            </Button>
          )}
        </div>

        {/* No faces registered warning */}
        {allFaceDescriptors !== undefined && allFaceDescriptors.length === 0 && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
            <p className="text-sm text-orange-600 dark:text-orange-400 text-center font-medium">
              ⚠️ No Registered Faces
            </p>
            <p className="text-xs text-orange-600/80 dark:text-orange-400/80 text-center mt-1">
              No users have registered their face yet. Please register your face in your profile settings first.
            </p>
          </div>
        )}

        {/* Info */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <p className="text-xs text-[var(--text-secondary)]">
            <strong>🚀 Automatic Login:</strong> Position your face in the camera frame. The system will automatically authenticate you when your face is detected and scanned (100%).
            {allFaceDescriptors !== undefined && (
              <span className="block mt-1 text-[var(--text-tertiary)]">
                📊 {allFaceDescriptors.length} registered face{allFaceDescriptors.length !== 1 ? 's' : ''} in the system
              </span>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}
