'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLandingTranslation } from './useLandingTranslation';
import '@/i18n/config';

/** Prompt chips shown under the composer — one click fills the input. */
const CHIP_KEYS = ['landing.meetAiChip1', 'landing.meetAiChip2', 'landing.meetAiChip3'] as const;

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

let messageSeq = 1;

/**
 * Meet AI — a live chat demo on the landing.
 *
 * The right panel is a real chat window: the visitor types (or clicks a prompt
 * chip) and the answer comes back from `/api/landing-demo`, which runs the same
 * Gemini → Groq → OpenRouter chain as the in-app assistant, but with a locked
 * product-only system prompt and no auth / org data. On first paint the window
 * already shows a welcome + a sample exchange, so the section has content even
 * before any network call. Renders nothing until mounted (avoids hydration
 * mismatch: server HTML cannot know the visitor's language for the chat copy).
 */
export default function MeetAISection({ initialLanguage = 'en' }: { initialLanguage?: string }) {
  const { t, mounted } = useLandingTranslation(initialLanguage);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasTyped, setHasTyped] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Seed the window once, after mount, with a welcome + a sample exchange.
  useEffect(() => {
    if (!mounted || messages.length > 0) return;
    setMessages([
      { id: messageSeq++, role: 'assistant', text: t('landing.meetAiWelcome') },
      { id: messageSeq++, role: 'user', text: t('landing.demoUserAsk') },
      { id: messageSeq++, role: 'assistant', text: t('landing.demoAiAnswer') },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput('');
      setHasTyped(true);
      setMessages((prev) => [...prev, { id: messageSeq++, role: 'user', text }]);
      setBusy(true);
      try {
        const res = await fetch('/api/landing-demo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: text, lang: 'en' }),
        });
        const data = (await res.json()) as { reply?: string; error?: string };
        setMessages((prev) => [
          ...prev,
          {
            id: messageSeq++,
            role: 'assistant',
            text: data.reply ?? data.error ?? t('landing.meetAiError'),
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          { id: messageSeq++, role: 'assistant', text: t('landing.meetAiError') },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, t],
  );

  if (!mounted) return null;

  const chips = CHIP_KEYS.map((key) => t(key));

  return (
    <section
      id="meet-ai"
      className="relative px-6 md:px-12 py-16 md:py-24 overflow-hidden"
      aria-label="Meet the AI assistant"
    >
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute -top-32 right-1/4 w-[640px] h-[640px] rounded-full"
          style={{
            background: 'radial-gradient(circle, var(--landing-orb-1) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        {/* ── Left: copy ── */}
        <div className="section-fade">
          <span className="section-eyebrow">{t('landing.meetAiEyebrow')}</span>
          <h2
            className="mt-3 text-3xl md:text-5xl font-black leading-tight tracking-tighter"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {t('landing.meetAiTitle')}{' '}
            <span className="heading-gradient">{t('landing.meetAiTitleAccent')}</span>
          </h2>
          <p
            className="mt-4 text-lg leading-normal md:leading-loose max-w-lg"
            style={{ color: 'var(--landing-text-secondary)', opacity: 0.9 }}
          >
            {t('landing.meetAiSubtitle')}
          </p>

          {/* Capability rows */}
          <ul className="mt-8 space-y-4">
            {(
              [
                ['landing.meetAiPoint1Title', 'landing.meetAiPoint1Desc'],
                ['landing.meetAiPoint2Title', 'landing.meetAiPoint2Desc'],
                ['landing.meetAiPoint3Title', 'landing.meetAiPoint3Desc'],
              ] as const
            ).map(([titleKey, descKey]) => (
              <li key={titleKey} className="flex gap-4 items-start">
                <div
                  className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    background: 'var(--landing-card-bg)',
                    border: '1px solid var(--landing-card-border)',
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    style={{ color: 'var(--primary)' }}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--landing-text-primary)' }}>
                    {t(titleKey)}
                  </p>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--landing-text-secondary)' }}>
                    {t(descKey)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Right: live chat demo ── */}
        <div className="section-fade">
          <div
            className="relative rounded-[1.75rem] overflow-hidden"
            style={{
              border: '1px solid var(--landing-card-border)',
              background: 'var(--landing-card-bg)',
              boxShadow: '0 24px 64px -24px rgba(12, 26, 46, 0.28)',
              backdropFilter: 'blur(14px)',
            }}
          >
            {/* Window header */}
            <div
              className="flex items-center gap-3 px-5 py-3.5 border-b"
              style={{ borderColor: 'var(--landing-card-border)' }}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: 'linear-gradient(135deg, var(--brand), var(--brand-hover))' }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 8V4H8" />
                  <rect width="16" height="12" x="4" y="8" rx="2" />
                  <path d="M2 14h2" />
                  <path d="M20 14h2" />
                  <path d="M15 13v2" />
                  <path d="M9 13v2" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm font-semibold truncate"
                  style={{ color: 'var(--landing-text-primary)' }}
                >
                  {t('landing.demoAiName')}
                </p>
                <p
                  className="text-xs flex items-center gap-1.5"
                  style={{ color: 'var(--landing-text-secondary)' }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: 'var(--success)', animation: 'pulse 2s infinite' }}
                  />
                  {t('landing.demoOnline')}
                </p>
              </div>
              {/* Window dots */}
              <div className="flex gap-1.5" aria-hidden="true">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: 'var(--danger-quiet)' }}
                />
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: 'var(--warning-quiet)' }}
                />
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: 'var(--success-quiet)' }}
                />
              </div>
            </div>

            {/* Messages */}
            <div
              ref={bodyRef}
              className="h-[340px] md:h-[380px] overflow-y-auto px-5 py-4 space-y-4 scroll-smooth"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      m.role === 'user' ? 'rounded-br-md' : 'rounded-bl-md'
                    }`}
                    style={
                      m.role === 'user'
                        ? { background: 'var(--primary)', color: 'white' }
                        : {
                            background: 'var(--surface-2)',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-default)',
                          }
                    }
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div
                    className="rounded-2xl rounded-bl-md px-4 py-3 flex gap-1.5 items-center"
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-default)',
                    }}
                    aria-label="Assistant is typing"
                  >
                    <span className="typing-dot" />
                    <span className="typing-dot" style={{ animationDelay: '0.15s' }} />
                    <span className="typing-dot" style={{ animationDelay: '0.3s' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="px-4 pb-4 pt-1">
              {/* Prompt chips — only before the visitor starts typing */}
              {!hasTyped && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {chips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => void send(chip)}
                      disabled={busy}
                      className="text-xs px-3 py-1.5 rounded-full transition-transform duration-200 hover:scale-[1.03] active:scale-95 disabled:opacity-60"
                      style={{
                        border: '1px solid var(--landing-card-border)',
                        background: 'var(--landing-card-bg)',
                        color: 'var(--landing-text-secondary)',
                      }}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(input);
                }}
                className="flex gap-2"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t('landing.demoComposer')}
                  aria-label={t('landing.demoComposer')}
                  disabled={busy}
                  className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors disabled:opacity-60"
                  style={{
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-transform duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, var(--brand), var(--brand-hover))',
                  }}
                >
                  {t('landing.meetAiSend')}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m22 2-7 20-4-9-9-4Z" />
                    <path d="M22 2 11 13" />
                  </svg>
                </button>
              </form>
            </div>
          </div>

          {/* Honest footnote */}
          <p
            className="mt-3 text-xs text-center"
            style={{ color: 'var(--landing-text-secondary)', opacity: 0.8 }}
          >
            {t('landing.meetAiFootnote')}
          </p>
        </div>
      </div>
    </section>
  );
}
