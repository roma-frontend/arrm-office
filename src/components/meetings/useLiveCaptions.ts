'use client';

/**
 * Live captions for the meeting room.
 *
 * Each participant transcribes *their own* microphone with the browser's speech
 * recognition and broadcasts the text on a LiveKit data channel. That choice is
 * deliberate: it needs no server-side STT, no extra bill and no audio leaving the
 * call for a third party, and it degrades cleanly — a participant on a browser
 * without the API simply contributes no captions while still reading everyone
 * else's.
 *
 * Chrome and Edge implement `webkitSpeechRecognition` (Chrome ships the audio to
 * Google's service, which is worth telling people — see `meetings.cc.notice`).
 * Firefox has no implementation, Safari's is partial.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDataChannel } from '@livekit/components-react';

export interface CaptionLine {
  identity: string;
  name: string;
  text: string;
  /** Interim results are shown greyed out and replaced as the speaker continues. */
  final: boolean;
  at: number;
}

/** How long a finished line stays on screen after the speaker stopped. */
const LINE_TTL = 5000;

/** i18n language → BCP-47 tag the recognizer expects. */
const RECOGNITION_LOCALE: Record<string, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  de: 'de-DE',
  hy: 'hy-AM',
};

/**
 * Minimal structural types for the Web Speech API. Declared locally instead of
 * `declare global` so this never collides with a future lib.dom definition.
 */
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechAlternative;
}
interface SpeechResultList {
  readonly length: number;
  [index: number]: SpeechResult;
}
interface SpeechEvent {
  resultIndex: number;
  results: SpeechResultList;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function captionsSupported(): boolean {
  return recognitionCtor() !== undefined;
}

/**
 * @param enabled the local CC toggle — off means neither transcribing nor
 * rendering, so the strip disappears for the person who turned it off only.
 * @param language current i18n language.
 * @param speaking whether the local mic is live; recognition is paused while
 * muted so a muted participant cannot be transcribed.
 */
export function useLiveCaptions({
  enabled,
  language,
  micEnabled,
  localIdentity,
  localName,
}: {
  enabled: boolean;
  language: string;
  micEnabled: boolean;
  localIdentity: string;
  localName: string;
}) {
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { send } = useDataChannel('captions');

  /** Keeps `send` out of the recognition effect's dependency list. */
  const sendRef = useRef(send);
  sendRef.current = send;
  const identityRef = useRef(localIdentity);
  identityRef.current = localIdentity;
  const nameRef = useRef(localName);
  nameRef.current = localName;

  const push = useCallback((line: CaptionLine) => {
    setLines((prev) => {
      // One open line per speaker: an interim result replaces that speaker's
      // previous interim, and their final result closes it out. Finished lines
      // stack up (newest last) until the TTL sweep drops them.
      const withoutOpen = prev.filter((l) => !(l.identity === line.identity && !l.final));
      return [...withoutOpen, line].slice(-6);
    });
  }, []);

  useDataChannel('captions', (msg) => {
    if (!enabled) return;
    try {
      const data = JSON.parse(new TextDecoder().decode(msg.payload)) as {
        text?: string;
        final?: boolean;
        name?: string;
      };
      if (!data.text) return;
      const identity = msg.from?.identity ?? '';
      if (identity === identityRef.current) return; // already shown locally
      push({
        identity,
        name: data.name || msg.from?.name || identity,
        text: data.text,
        final: Boolean(data.final),
        at: Date.now(),
      });
    } catch {
      /* ignore malformed */
    }
  });

  // Expire finished lines. Interim lines are left alone — they are replaced by
  // the speaker's next result, or closed by their final one.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      const cutoff = Date.now() - LINE_TTL;
      setLines((prev) => {
        const next = prev.filter((l) => !l.final || l.at > cutoff);
        return next.length === prev.length ? prev : next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLines([]);
      return;
    }
    if (!micEnabled) return;

    const Ctor = recognitionCtor();
    if (!Ctor) {
      setError('unsupported');
      return;
    }

    let stopped = false;
    let recognition: Recognition;
    try {
      recognition = new Ctor();
    } catch {
      setError('unsupported');
      return;
    }

    recognition.lang = RECOGNITION_LOCALE[language] ?? 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript?.trim();
        if (!result || !text) continue;
        const line: CaptionLine = {
          identity: identityRef.current,
          name: nameRef.current,
          text,
          final: result.isFinal,
          at: Date.now(),
        };
        push(line);
        try {
          void sendRef.current(
            new TextEncoder().encode(
              JSON.stringify({ text, final: result.isFinal, name: nameRef.current }),
            ),
            // Interim text is superseded within a second; only the final line is
            // worth retransmitting.
            { reliable: result.isFinal },
          );
        } catch {
          /* captions are best-effort */
        }
      }
    };

    recognition.onerror = (event) => {
      // `no-speech` and `aborted` are routine; a denied mic is worth surfacing.
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('denied');
        stopped = true;
      }
    };

    // The engine stops on its own after a pause; restart it for as long as the
    // toggle is on.
    recognition.onend = () => {
      if (stopped) return;
      try {
        recognition.start();
      } catch {
        /* already restarting */
      }
    };

    try {
      recognition.start();
      setError(null);
    } catch {
      setError('unsupported');
    }

    return () => {
      stopped = true;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        /* nothing to abort */
      }
    };
  }, [enabled, micEnabled, language, push]);

  return { lines, error };
}
