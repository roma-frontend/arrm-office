'use client';

import React, { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Mic, Square, Send, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';

interface Props {
  onRecordingStart: () => void;
  onRecordingStop: (blob: Blob, duration: number) => void;
  onRecordingCancel: () => void;
  disabled?: boolean;
}

export function VoiceMessageRecorder({
  onRecordingStart,
  onRecordingStop,
  onRecordingCancel,
  disabled,
}: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const { t } = useTranslation();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      startTimeRef.current = Date.now();
      setRecordingTime(0);

      // Update timer every 100ms
      timerRef.current = setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - startTimeRef.current) / 100) / 10);
      }, 100);

      onRecordingStart();
    } catch (err) {
      logger.error('Error accessing microphone:', err);
      toast.error(
        t('chat.micAccessError', 'Could not access microphone. Please check permissions.'),
      );
    }
  }, [onRecordingStart, t]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      // Create blob from chunks directly
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
      onRecordingStop(blob, duration);
    }
  }, [isRecording, onRecordingStop]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setIsRecording(false);
      setRecordingTime(0);
      setAudioBlob(null);
      setAudioUrl(null);
      onRecordingCancel();
    }
  }, [isRecording, onRecordingCancel]);

  const sendRecording = useCallback(() => {
    if (audioBlob) {
      const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);
      onRecordingStop(audioBlob, duration);
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingTime(0);
    }
  }, [audioBlob, onRecordingStop]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Visualizer bars
  const renderVisualizer = () => {
    if (!isRecording && !audioUrl) return null;
    return (
      <div className="flex items-center gap-0.5 h-8">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'w-1 rounded-full transition-all duration-100',
              isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-400',
            )}
            style={{
              height: isRecording ? `${Math.random() * 24 + 8}px` : '4px',
              animationDelay: `${i * 0.05}s`,
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <div
      className="flex items-center gap-2 p-2 rounded-xl border"
      style={{
        borderColor: isRecording ? 'rgba(239,68,68,0.3)' : 'var(--border)',
        background: isRecording ? 'rgba(239,68,68,0.05)' : 'var(--background-subtle)',
      }}
    >
      {isRecording ? (
        <>
          {/* Recording indicator */}
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />

          {/* Timer */}
          <span className="text-sm font-mono min-w-[50px]" style={{ color: 'var(--text-primary)' }}>
            {formatTime(recordingTime)}
          </span>

          {/* Visualizer */}
          {renderVisualizer()}

          {/* Cancel button */}
          <button
            onClick={cancelRecording}
            className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
            title={t('chat.voice.cancelRecording')}
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>

          {/* Stop and send button */}
          <button
            onClick={stopRecording}
            className="p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
            title={t('chat.voice.stopRecording')}
          >
            <Square className="w-4 h-4" />
          </button>
        </>
      ) : audioBlob ? (
        <>
          {/* Preview mode */}
          <div className="flex items-center gap-2 flex-1">
            {renderVisualizer()}
            <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {formatTime(recordingTime)}
            </span>
          </div>

          {/* Cancel */}
          <button
            onClick={cancelRecording}
            className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>

          {/* Send */}
          <button
            onClick={sendRecording}
            className="p-2 rounded-lg bg-green-500 hover:bg-green-600 text-white transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          {/* Record button */}
          <button
            onClick={startRecording}
            disabled={disabled}
            className={cn(
              'p-2 rounded-lg transition-colors',
              disabled
                ? 'opacity-50 cursor-not-allowed'
                : 'hover:bg-red-100 dark:hover:bg-red-900/20',
            )}
            style={{ background: 'transparent' }}
            title={t('chat.voice.record')}
          >
            <Mic className={cn('w-4 h-4', disabled ? '' : 'text-red-500')} />
          </button>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('chat.voice.voiceMessage')}
          </span>
        </>
      )}
    </div>
  );
}
