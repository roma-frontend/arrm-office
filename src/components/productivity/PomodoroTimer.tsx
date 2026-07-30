'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useAuthStore } from '@/store/useAuthStore';
import type { Id } from '../../../convex/_generated/dataModel';
import { Play, Pause, RotateCcw, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const DURATIONS = {
  pomodoro: 25 * 60, // 25 minutes
  shortBreak: 5 * 60, // 5 minutes
  longBreak: 15 * 60, // 15 minutes
};

export function PomodoroTimer() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [mode, setMode] = useState<'pomodoro' | 'shortBreak' | 'longBreak'>('pomodoro');
  const [timeLeft, setTimeLeft] = useState(DURATIONS.pomodoro);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState<Id<'pomodoroSessions'> | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>(null);

  const startSession = useMutation(api.productivity.startPomodoroSession);
  const completeSession = useMutation(api.productivity.completePomodoroSession);
  const interruptSession = useMutation(api.productivity.interruptPomodoroSession);
  const activeSession = useQuery(
    api.productivity.getActivePomodoroSession,
    user?.id ? { userId: user.id as Id<'users'> } : 'skip',
  );

  // Sync with active session from DB
  useEffect(() => {
    if (activeSession && !sessionId) {
      const remaining = Math.max(0, Math.floor((activeSession.endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      setSessionId(activeSession._id);
      setIsRunning(remaining > 0);
    }
  }, [activeSession, sessionId]);

  const handleTimerComplete = async () => {
    setIsRunning(false);

    if (sessionId) {
      await completeSession({ sessionId });
    }

    // Browser Notification
    if (mode === 'pomodoro') {
      toast.success(t('pomodoro.pomodoroCompleted'), {
        duration: 5000,
      });

      // Send browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(t('pomodoro.notificationTitle'), {
          body: t('pomodoro.breakReadyMsg'),
          icon: '/icon.png',
          badge: '/badge.png',
          tag: 'pomodoro-complete',
        });
      }

      // Auto switch to break
      setMode('shortBreak');
      setTimeLeft(DURATIONS.shortBreak);
    } else if (mode === 'shortBreak') {
      toast.success(t('pomodoro.breakOver'), {
        duration: 5000,
      });

      // Send browser notification
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(t('pomodoro.breakTitle'), {
          body: t('pomodoro.refreshedMsg'),
          icon: '/icon.png',
          badge: '/badge.png',
          tag: 'break-complete',
        });
      }

      // Auto switch back to pomodoro
      setMode('pomodoro');
      setTimeLeft(DURATIONS.pomodoro);
    }

    setSessionId(null);
  };

  // Timer countdown
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, timeLeft]);

  const handleStart = async () => {
    if (!user?.id) return;

    try {
      // Request notification permission on first use
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }

      const duration = mode === 'pomodoro' ? 25 : mode === 'shortBreak' ? 5 : 15;
      const id = await startSession({
        userId: user.id as Id<'users'>,
        duration,
      });
      setSessionId(id);
      setIsRunning(true);
      toast.success(t('pomodoro.sessionStarted'));
    } catch (_error) {
      toast.error(t('errors.sessionStartFailed'));
    }
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleResume = () => {
    setIsRunning(true);
  };

  const handleReset = async () => {
    if (sessionId && isRunning) {
      await interruptSession({ sessionId });
    }
    setIsRunning(false);
    setTimeLeft(DURATIONS[mode]);
    setSessionId(null);
  };

  const handleModeChange = (newMode: typeof mode) => {
    if (isRunning) {
      toast.error('Stop the current session first');
      return;
    }
    setMode(newMode);
    setTimeLeft(DURATIONS[newMode]);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = ((DURATIONS[mode] - timeLeft) / DURATIONS[mode]) * 100;

  if (activeSession === undefined)
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  return (
    <div className="px-2 py-4">
      <div className="mb-3 px-2">
        <h3 className="text-xs font-semibold text-(--text-muted) flex items-center gap-2">
          <Timer className="w-3.5 h-3.5" />
          Pomodoro Timer
        </h3>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-1 mb-4 px-2">
        <button
          onClick={() => handleModeChange('pomodoro')}
          className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
            mode === 'pomodoro'
              ? 'btn-gradient text-white shadow-sm'
              : 'bg-(--background-subtle) text-(--text-muted) hover:bg-(--background-subtle)/80'
          }`}
        >
          Focus
        </button>
        <button
          onClick={() => handleModeChange('shortBreak')}
          className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
            mode === 'shortBreak'
              ? 'btn-gradient text-white shadow-sm'
              : 'bg-(--background-subtle) text-(--text-muted) hover:bg-(--background-subtle)/80'
          }`}
        >
          Short
        </button>
        <button
          onClick={() => handleModeChange('longBreak')}
          className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-all ${
            mode === 'longBreak'
              ? 'btn-gradient text-white shadow-sm'
              : 'bg-(--background-subtle) text-(--text-muted) hover:bg-(--background-subtle)/80'
          }`}
        >
          Long
        </button>
      </div>

      {/* Timer display */}
      <div className="relative mb-4">
        {/* Progress ring */}
        <svg className="w-full h-32" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="var(--border)" strokeWidth="6" />
          <circle
            cx="60"
            cy="60"
            r="54"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 54}`}
            strokeDashoffset={`${2 * Math.PI * 54 * (1 - progress / 100)}`}
            transform="rotate(-90 60 60)"
            className="transition-all duration-1000"
          />
        </svg>

        {/* Time text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-3xl font-bold text-(--text-primary) font-mono">
            {formatTime(timeLeft)}
          </div>
          <div className="text-xs text-(--text-muted) mt-1 capitalize">
            {mode === 'pomodoro'
              ? t('pomodoro.focusTime')
              : mode === 'shortBreak'
                ? t('pomodoro.shortBreak')
                : t('pomodoro.longBreak')}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        {!isRunning && timeLeft === DURATIONS[mode] ? (
          <Button onClick={handleStart} size="sm" className="w-full">
            <Play className="w-4 h-4 mr-2" />
            {t('buttons.start')}
          </Button>
        ) : !isRunning ? (
          <Button onClick={handleResume} size="sm" className="flex-1">
            <Play className="w-4 h-4 mr-2" />
            {t('buttons.resume')}
          </Button>
        ) : (
          <Button onClick={handlePause} variant="secondary" size="sm" className="flex-1">
            <Pause className="w-4 h-4 mr-2" />
            {t('buttons.pause')}
          </Button>
        )}

        {(isRunning || timeLeft !== DURATIONS[mode]) && (
          <Button onClick={handleReset} variant="outline" size="sm">
            <RotateCcw className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Stats */}
      {mode === 'pomodoro' && (
        <div className="mt-3 px-2 text-center">
          <p className="text-[10px] text-(--text-muted)">{t('pomodoro.productivityTip')}</p>
        </div>
      )}
    </div>
  );
}
