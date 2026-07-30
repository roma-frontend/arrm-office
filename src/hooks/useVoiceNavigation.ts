/**
 * Voice Navigation Hook
 *
 * Provides voice-controlled navigation with role-based permissions
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { detectIntent, type UserRole } from '@/lib/aiAssistant';
import { logger } from '@/lib/logger';

interface VoiceNavigationOptions {
  enabled?: boolean;
  language?: 'ru-RU' | 'en-US';
  continuous?: boolean;
}

export function useVoiceNavigation(options: VoiceNavigationOptions = {}) {
  const { enabled = true, language = 'ru-RU', continuous = false } = options;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SpeechRecognition API has incomplete TS types
  const recognitionRef = useRef<any>(null);

  const navigate = useCallback(
    (route: string) => {
      logger.log('🎯 Voice navigation:', route);
      router.push(route);
    },
    [router],
  );

  const processVoiceCommand = useCallback(
    (command: string) => {
      if (!user) return;

      logger.log('🎤 Voice command:', command);
      setTranscript(command);

      // Detect intent based on user role
      const intent = detectIntent(command, user.role as UserRole);

      if (intent?.action) {
        logger.log('✅ Intent detected:', intent.name, '→', intent.action);
        navigate(intent.action);

        // Provide voice feedback
        if (window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(
            language === 'ru-RU' ? `Открываю ${intent.name}` : `Opening ${intent.name}`,
          );
          utterance.lang = language;
          window.speechSynthesis.speak(utterance);
        }
      } else {
        logger.log('❌ No matching intent for:', command);
      }
    },
    [user, language, navigate],
  );

  const startListening = useCallback(() => {
    if (!enabled || (!window.SpeechRecognition && !window.webkitSpeechRecognition)) {
      logger.warn('Speech recognition not supported');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SpeechRecognition API has no TS types
    const recognition: any = new SpeechRecognition();

    recognition.continuous = continuous;
    recognition.interimResults = false;
    recognition.lang = language;

    recognition.addEventListener('start', () => {
      setIsListening(true);
      logger.log('🎤 Voice recognition started');
    });

    recognition.onresult = (event: any) => {
      const last = event.results[event.results.length - 1];
      const command = last[0].transcript.toLowerCase().trim();
      processVoiceCommand(command);
    };

    recognition.onerror = (event: any) => {
      logger.error('❌ Voice recognition error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      logger.log('🛑 Voice recognition stopped');
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (error) {
      logger.error('Failed to start recognition:', error);
    }
  }, [enabled, language, continuous, processVoiceCommand]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional cleanup on unmount only
  }, []);

  return {
    isListening,
    transcript,
    startListening,
    stopListening,
  };
}
