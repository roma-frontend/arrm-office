import { useState, useEffect, useCallback, useRef } from 'react';

const IDLE_TIMEOUT = parseInt(process.env.NEXT_PUBLIC_IDLE_TIMEOUT || '900', 10) * 1000;
const WARNING_DURATION =
  parseInt(process.env.NEXT_PUBLIC_IDLE_WARNING_DURATION || '180', 10) * 1000;

interface UseIdleTimerOptions {
  /** Called when user becomes idle */
  onIdle?: () => void;
  /** Called when user becomes active again */
  onActive?: () => void;
  /** Called when auto-logout timer expires */
  onLogout?: () => void;
}

export function useIdleTimer({ onIdle, onActive, onLogout }: UseIdleTimerOptions) {
  const [isIdle, setIsIdle] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [isLoggedOut, setIsLoggedOut] = useState(false);

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const hasLoggedOutRef = useRef(false);

  const clearAllTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    idleTimerRef.current = null;
    warningTimerRef.current = null;
    countdownRef.current = null;
  }, []);

  const startIdleTimer = useCallback(() => {
    clearAllTimers();
    setIsIdle(false);
    setShowWarning(false);
    setCountdownSeconds(0);

    idleTimerRef.current = setTimeout(() => {
      setIsIdle(true);
      setShowWarning(true);
      setCountdownSeconds(Math.floor(WARNING_DURATION / 1000));
      onIdle?.();

      // Start countdown
      countdownRef.current = setInterval(() => {
        setCountdownSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Auto-logout after warning duration
      warningTimerRef.current = setTimeout(() => {
        if (!hasLoggedOutRef.current) {
          hasLoggedOutRef.current = true;
          setIsLoggedOut(true);
          onLogout?.();
        }
      }, WARNING_DURATION);
    }, IDLE_TIMEOUT);
  }, [onIdle, onLogout, clearAllTimers]);

  const resetTimer = useCallback(() => {
    if (showWarning) return; // Don't reset if warning is already showing
    startIdleTimer();
  }, [showWarning, startIdleTimer]);

  const extendSession = useCallback(() => {
    hasLoggedOutRef.current = false;
    setShowWarning(false);
    setIsIdle(false);
    setCountdownSeconds(0);
    onActive?.();
    startIdleTimer();
  }, [onActive, startIdleTimer]);

  const handleLogout = useCallback(() => {
    hasLoggedOutRef.current = true;
    clearAllTimers();
    setIsLoggedOut(true);
    onLogout?.();
  }, [onLogout, clearAllTimers]);

  useEffect(() => {
    startIdleTimer();

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];

    const handleActivity = () => {
      resetTimer();
    };

    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      clearAllTimers();
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount-only initialisation
  }, [startIdleTimer, resetTimer, clearAllTimers]);

  return {
    isIdle,
    showWarning,
    countdownSeconds,
    isLoggedOut,
    extendSession,
    handleLogout,
  };
}
