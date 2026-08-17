'use client';

import React, { useCallback, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useMotionValueEvent } from 'framer-motion';
import { useLandingTranslation } from './useLandingTranslation';

/**
 * Scroll storytelling — the landing's "cinematic" section.
 *
 * Four scenes of the product (check-in → cascade → AI → analytics) play out
 * inside a pinned phone frame as the visitor scrolls through 400vh. The scene
 * index is derived from scroll progress (no scroll listeners beyond
 * framer-motion's rAF-driven useScroll), the phone's contents crossfade and
 * slide per scene, and a vertical progress rail on the left doubles as
 * clickable navigation. Reduced-motion users get a plain stacked layout
 * instead — no pinning, no parallax.
 */

const SCENES = [
  { key: 'storyCheckin', color: '#8b5cf6' },
  { key: 'storyCascade', color: '#3b82f6' },
  { key: 'storyAssistant', color: '#06b6d4' },
  { key: 'storyAnalytics', color: '#10b981' },
] as const;

const REDUCED = '(prefers-reduced-motion: reduce)';

function useReducedMotion(): boolean {
  // Lazy initializer runs on the client once; SSR default is "no preference".
  const [reduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(REDUCED).matches;
  });
  return reduced;
}

/* ── Inline SVG icon set (landing bundle avoids lucide) ──────────────────── */

function FingerprintIcon() {
  return (
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
      <path d="M12 11c0 3.5-1.5 6.5-3 8.5" />
      <path d="M15.5 7.5c.3 1.5.5 3 .5 4.5 0 2-.3 4-.8 5.8" />
      <path d="M8.5 5.8A8 8 0 0 1 20 12" />
      <path d="M4 12a8 8 0 0 1 2.5-5.8" />
      <path d="M7.5 19.5c-.5-1.2-.8-2.6-.9-4" />
    </svg>
  );
}

function GitBranchIcon() {
  return (
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
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M6 9v6" />
      <path d="M18 9c0 4-4 5-8 5" />
    </svg>
  );
}

function BotIcon() {
  return (
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
      <path d="M12 8V4H8" />
      <rect width="16" height="12" x="4" y="8" rx="2" />
      <path d="M2 14h2" />
      <path d="M20 14h2" />
      <path d="M15 13v2" />
      <path d="M9 13v2" />
    </svg>
  );
}

function BarChartIcon() {
  return (
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
      <path d="M3 3v16a2 2 0 0 0 2 2h16" />
      <path d="M7 13v4" />
      <path d="M12 8v9" />
      <path d="M17 5v12" />
    </svg>
  );
}

const SCENE_ICONS = [FingerprintIcon, GitBranchIcon, BotIcon, BarChartIcon];

/* ── Scene contents: the phone's four "screens" ──────────────────────────── */

function CheckinScene({ t }: { t: (k: string) => string }) {
  const key = (k: string) => `landing.${k}`;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold" style={{ color: 'var(--landing-text-muted)' }}>
          {t(key('storySceneHeadline'))}
        </span>
        <span className="text-[9px] font-semibold" style={{ color: 'var(--success-text)' }}>
          ● {t(key('storySceneLive'))}
        </span>
      </div>
      {/* Face scan ring */}
      <div className="flex items-center justify-center py-3">
        <div
          className="relative w-20 h-20 rounded-full flex items-center justify-center"
          style={{ border: '2px solid rgb(var(--brand-600-ch) / 30%)' }}
        >
          <div
            className="absolute inset-0 rounded-full story-scan-ring"
            style={{ border: '2px solid var(--primary)', borderTopColor: 'transparent' }}
          />
          <FingerprintIcon />
        </div>
      </div>
      <div
        className="rounded-xl p-2.5 space-y-1.5"
        style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
      >
        {[
          { k: 'storyCheckinLine1', w: '62%', c: 'var(--primary)' },
          { k: 'storyCheckinLine2', w: '44%', c: 'var(--success-text)' },
        ].map(({ k, w, c }) => (
          <div key={k} className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
            <span
              className="h-1.5 rounded-full story-bar-inner"
              style={{ width: w, background: c, opacity: 0.85 }}
            />
            <span
              className="text-[9px] font-medium truncate flex-1"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              {t(key(k))}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[98.2, 124, 87].map((v, i) => (
          <div
            key={i}
            className="rounded-lg p-2 text-center"
            style={{ border: '1px solid var(--border)', background: 'var(--muted)' }}
          >
            <p
              className="num text-[13px] font-bold leading-none"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {v}
              {i !== 1 ? '%' : ''}
            </p>
            <p
              className="mt-1 text-[8px] font-medium uppercase tracking-wide"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              {i === 0
                ? t(key('storyMetricAttend'))
                : i === 1
                  ? t(key('storyMetricPeople'))
                  : t(key('storyMetricGoals'))}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CascadeScene({ t }: { t: (k: string) => string }) {
  const key = (k: string) => `landing.${k}`;
  return (
    <div className="space-y-2.5">
      <span className="text-[10px] font-semibold" style={{ color: 'var(--landing-text-muted)' }}>
        {t(key('storySceneHeadline'))}
      </span>
      {/* Root node */}
      <div
        className="rounded-xl px-3 py-2.5 flex items-center gap-2.5"
        style={{
          border: '1px solid rgb(var(--brand-600-ch) / 25%)',
          background: 'rgb(var(--brand-600-ch) / 8%)',
        }}
      >
        <GitBranchIcon />
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-bold truncate"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {t(key('storyCascadeRoot'))}
          </p>
          <p
            className="text-[8px] font-medium truncate"
            style={{ color: 'var(--landing-text-muted)' }}
          >
            {t(key('storyCascadeRootSub'))}
          </p>
        </div>
        <span className="num text-[11px] font-bold" style={{ color: 'var(--primary)' }}>
          72%
        </span>
      </div>
      {/* Connector */}
      <div className="mx-auto w-px h-3" style={{ background: 'var(--border)' }} />
      <div className="grid grid-cols-2 gap-2">
        {[
          { k: 'storyCascadeTeam1', sub: 'storyCascadeTeam1Sub', v: 68 },
          { k: 'storyCascadeTeam2', sub: 'storyCascadeTeam2Sub', v: 54 },
        ].map(({ k, sub, v }) => (
          <div
            key={k}
            className="rounded-xl px-2.5 py-2 space-y-1.5"
            style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
          >
            <p
              className="text-[9px] font-bold truncate"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {t(key(k))}
            </p>
            <div
              className="h-1 rounded-full overflow-hidden"
              style={{ background: 'var(--muted)' }}
            >
              <div
                className="h-full rounded-full story-bar-inner"
                style={{ width: `${v}%`, background: 'var(--primary)' }}
              />
            </div>
            <p
              className="text-[8px] font-medium truncate"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              {t(key(sub))}
            </p>
          </div>
        ))}
      </div>
      <div
        className="rounded-xl px-3 py-2 flex items-center justify-between"
        style={{
          border: '1px solid rgb(var(--green-500-ch) / 25%)',
          background: 'rgb(var(--green-500-ch) / 8%)',
        }}
      >
        <span className="text-[9px] font-semibold" style={{ color: 'var(--landing-text-primary)' }}>
          {t(key('storyCascadeYou'))}
        </span>
        <span className="num text-[11px] font-bold" style={{ color: 'var(--success-text)' }}>
          45%
        </span>
      </div>
    </div>
  );
}

function AssistantScene({ t }: { t: (k: string) => string }) {
  const key = (k: string) => `landing.${k}`;
  return (
    <div className="space-y-2.5">
      <div
        className="flex items-center gap-2 pb-2 border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        <span
          className="flex items-center justify-center w-6 h-6 rounded-lg"
          style={{ background: 'rgb(var(--brand-600-ch) / 12%)', color: 'var(--primary)' }}
        >
          <BotIcon />
        </span>
        <span className="text-[10px] font-bold" style={{ color: 'var(--landing-text-primary)' }}>
          {t(key('storyAssistantName'))}
        </span>
        <span
          className="ml-auto flex items-center gap-1 text-[8px] font-medium"
          style={{ color: 'var(--success-text)' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--success-solid)' }}
          />
          {t(key('storySceneLive'))}
        </span>
      </div>
      <div className="flex justify-end">
        <p
          className="max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-[9px] font-medium"
          style={{ background: 'var(--primary)', color: 'var(--brand-contrast)' }}
        >
          {t(key('storyAssistantAsk'))}
        </p>
      </div>
      <div className="flex justify-start">
        <p
          className="max-w-[90%] rounded-2xl rounded-bl-md px-3 py-2 text-[9px] font-medium"
          style={{ background: 'var(--muted)', color: 'var(--landing-text-primary)' }}
        >
          {t(key('storyAssistantAnswer'))}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[t(key('storyAssistantChip1')), t(key('storyAssistantChip2'))].map((chip) => (
          <span
            key={chip}
            className="px-2 py-1 rounded-full text-[8px] font-semibold"
            style={{
              border: '1px solid rgb(var(--brand-600-ch) / 22%)',
              background: 'rgb(var(--brand-600-ch) / 8%)',
              color: 'var(--primary)',
            }}
          >
            {chip}
          </span>
        ))}
      </div>
      <div
        className="rounded-xl px-3 py-2 flex items-center gap-2.5"
        style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
      >
        <span
          className="w-6 h-6 rounded-lg flex items-center justify-center"
          style={{ background: 'rgb(var(--green-500-ch) / 12%)', color: 'var(--success-text)' }}
        >
          <FingerprintIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[9px] font-bold truncate"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {t(key('storyAssistantAction'))}
          </p>
          <p
            className="text-[8px] font-medium truncate"
            style={{ color: 'var(--landing-text-muted)' }}
          >
            {t(key('storyAssistantActionSub'))}
          </p>
        </div>
        <span className="text-[9px] font-bold" style={{ color: 'var(--success-text)' }}>
          {t(key('storySceneDone'))}
        </span>
      </div>
    </div>
  );
}

function AnalyticsScene({ t }: { t: (k: string) => string }) {
  const key = (k: string) => `landing.${k}`;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold" style={{ color: 'var(--landing-text-muted)' }}>
          {t(key('storySceneHeadline'))}
        </span>
        <span className="num text-[11px] font-bold" style={{ color: 'var(--success-text)' }}>
          ▲ 9.4%
        </span>
      </div>
      {/* Line chart */}
      <div
        className="rounded-xl p-2.5"
        style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
      >
        <div className="relative h-24">
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 240 96"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {[24, 48, 72].map((y) => (
              <line
                key={y}
                x1="0"
                x2="240"
                y1={y}
                y2={y}
                stroke="var(--muted)"
                strokeWidth="1"
                strokeDasharray="3 5"
                opacity="0.5"
              />
            ))}
            <path
              d="M2,88 L2,80 30,74 58,78 86,58 114,64 142,40 170,46 198,24 238,14 238,96 Z"
              fill="rgb(var(--brand-600-ch) / 10%)"
            />
            <polyline
              points="2,80 30,74 58,78 86,58 114,64 142,40 170,46 198,24 238,14"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="238" cy="14" r="3.5" fill="var(--primary)" />
          </svg>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { k: 'storyMetricRetention', v: '96%', c: 'var(--primary)' },
          { k: 'storyMetricAttrition', v: '-4.2%', c: 'var(--success-text)' },
        ].map(({ k, v, c }) => (
          <div
            key={k}
            className="rounded-lg p-2"
            style={{ border: '1px solid var(--border)', background: 'var(--muted)' }}
          >
            <p className="num text-[13px] font-bold leading-none" style={{ color: c }}>
              {v}
            </p>
            <p
              className="mt-1 text-[8px] font-medium uppercase tracking-wide"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              {t(key(k))}
            </p>
          </div>
        ))}
      </div>
      {/* Pulse row */}
      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2"
        style={{
          border: '1px solid rgb(var(--green-500-ch) / 25%)',
          background: 'rgb(var(--green-500-ch) / 8%)',
        }}
      >
        <span
          className="w-1.5 h-1.5 rounded-full pulse-dot"
          style={{ background: 'var(--success-solid)' }}
        />
        <span
          className="text-[9px] font-semibold truncate"
          style={{ color: 'var(--landing-text-primary)' }}
        >
          {t(key('storyAnalyticsLive'))}
        </span>
      </div>
    </div>
  );
}

/* ── Main section ────────────────────────────────────────────────────────── */

export default function ScrollStorySection({
  initialLanguage = 'en',
}: {
  initialLanguage?: string;
}) {
  const { t } = useLandingTranslation(initialLanguage);
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  // Whether a real scrollable element was found (vs. the window scrolling).
  // Only pass `container` to useScroll when one exists — passing a ref whose
  // `.current` is null makes framer-motion throw "Container ref is defined but
  // not hydrated".
  const [hasScrollContainer, setHasScrollContainer] = useState(false);
  const [active, setActive] = useState(0);
  const [touring, setTouring] = useState(false);
  const touringRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // The section must track the element that actually scrolls. On the public
  // landing that is the window, but when the landing is rendered inside the app
  // shell (dashboard, landing editor canvas) the window never scrolls — a
  // `.main-scrollable` container does. Detecting the nearest real scroll
  // container (skipping html/body → window) keeps the pinned phone advancing
  // in both contexts. The callback ref runs before framer-motion's layout
  // effect, so `useScroll({ container })` sees the right element on mount.
  const setSectionRef = useCallback((node: HTMLDivElement | null) => {
    ref.current = node;
    if (node) {
      let el: HTMLElement | null = node.parentElement;
      while (el) {
        const oy = getComputedStyle(el).overflowY;
        if (oy === 'auto' || oy === 'scroll') break;
        el = el.parentElement;
      }
      // html/body are the window's scroll containers — let useScroll fall back
      // to window instead of double-counting documentElement scroll.
      const container = el && el.tagName !== 'HTML' && el.tagName !== 'BODY' ? el : null;
      scrollContainerRef.current = container;
      setHasScrollContainer(container !== null);
    }
  }, []);

  const { scrollYProgress } = useScroll({
    target: ref,
    // Pass a container ref only when a real scrollable element exists. On the
    // public landing the window scrolls, so the ref stays null there — and
    // framer-motion treats a passed ref with `.current === null` as "defined
    // but not hydrated", throwing an invariant in its effect. Omitting the
    // option entirely falls back to tracking the window.
    container: hasScrollContainer ? scrollContainerRef : undefined,
    offset: ['start start', 'end end'],
  });

  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const next = Math.min(SCENES.length - 1, Math.max(0, Math.floor(v * SCENES.length)));
    setActive((prev) => (prev === next ? prev : next));
  });

  /* ── Auto-play tour ───────────────────────────────────────────────────────
     A Play button drives the visitor through all four scenes with a controlled
     ease-in-out scroll (window.scrollTo({ behavior: 'smooth' }) would hand the
     timing to the browser). Any manual scroll wheel / touch / dot click cancels
     the tour and returns control to the visitor. */
  const stopTour = useCallback(() => {
    touringRef.current = false;
    setTouring(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const sleep = useCallback((ms: number) => new Promise<void>((r) => setTimeout(r, ms)), []);

  const scrollToAnimated = useCallback(
    (to: number, duration: number) =>
      new Promise<void>((resolve) => {
        const sc = scrollContainerRef.current;
        const from = sc ? sc.scrollTop : window.scrollY;
        const delta = to - from;
        if (Math.abs(delta) < 1 || !touringRef.current) {
          if (sc) sc.scrollTop = to;
          else window.scrollTo(0, to);
          resolve();
          return;
        }
        const start = performance.now();
        const easeInOutCubic = (p: number) =>
          p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        const step = (now: number) => {
          const p = Math.min((now - start) / duration, 1);
          if (sc) sc.scrollTop = from + delta * easeInOutCubic(p);
          else window.scrollTo(0, from + delta * easeInOutCubic(p));
          if (p < 1 && touringRef.current) {
            rafRef.current = requestAnimationFrame(step);
          } else {
            rafRef.current = null;
            resolve();
          }
        };
        rafRef.current = requestAnimationFrame(step);
      }),
    [],
  );

  const playTour = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    touringRef.current = true;
    setTouring(true);

    const sc = scrollContainerRef.current;
    const currentTop = sc ? sc.scrollTop : window.scrollY;
    const base = el.getBoundingClientRect().top + currentTop;
    const step = el.clientHeight / SCENES.length;

    // Return to the section's start, then walk each scene.
    await scrollToAnimated(base, 900);
    for (let i = 0; i < SCENES.length && touringRef.current; i++) {
      await scrollToAnimated(base + (i + 1) * step, 1500);
      if (!touringRef.current) break;
      // Dwell on the scene so its phone content can be read.
      await sleep(1600);
    }
    stopTour();
  }, [scrollToAnimated, sleep, stopTour]);

  // Phone parallax: the frame scales and tilts subtly across the section.
  const frameScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.94, 1, 0.96]);
  const frameRotate = useTransform(scrollYProgress, [0, 0.5, 1], [-2.5, 0, 2.5]);
  const frameY = useTransform(scrollYProgress, [0, 1], [30, -30]);
  // Background orbs drift for depth.
  const orb1Y = useTransform(scrollYProgress, [0, 1], [60, -120]);
  const orb2Y = useTransform(scrollYProgress, [0, 1], [-40, 100]);
  const orb3Y = useTransform(scrollYProgress, [0, 1], [20, -60]);

  const goTo = useCallback((i: number) => {
    const el = ref.current;
    if (!el) return;
    const sc = scrollContainerRef.current;
    const currentTop = sc ? sc.scrollTop : window.scrollY;
    const top = el.getBoundingClientRect().top + currentTop;
    if (sc) {
      sc.scrollTo({ top: top + (i * el.clientHeight) / SCENES.length, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: top + (i * el.clientHeight) / SCENES.length, behavior: 'smooth' });
    }
  }, []);

  // Reduced motion: plain stacked layout, no pinning, no transforms.
  if (reduced) {
    return (
      <section
        id="story"
        ref={setSectionRef}
        className="relative px-6 md:px-12 py-16 md:py-24"
        aria-label="How it works"
      >
        <div className="max-w-3xl mx-auto space-y-10">
          {SCENES.map(({ key, color }, i) => (
            <div key={key} className="grid md:grid-cols-2 gap-6 items-center">
              <div>
                <span className="text-xs font-bold tracking-widest" style={{ color }}>
                  {String(i + 1).padStart(2, '0')} — {t(`landing.${key}Title`)}
                </span>
                <h3
                  className="mt-2 text-2xl font-black leading-tight tracking-tighter"
                  style={{ color: 'var(--landing-text-primary)' }}
                >
                  {t(`landing.${key}Eyebrow`)}
                </h3>
                <p
                  className="mt-3 text-sm leading-relaxed"
                  style={{ color: 'var(--landing-text-secondary)' }}
                >
                  {t(`landing.${key}Desc`)}
                </p>
              </div>
              <div className="max-w-[260px] mx-auto phone-frame rounded-[2rem] p-3">
                {key === 'storyCheckin' && <CheckinScene t={t} />}
                {key === 'storyCascade' && <CascadeScene t={t} />}
                {key === 'storyAssistant' && <AssistantScene t={t} />}
                {key === 'storyAnalytics' && <AnalyticsScene t={t} />}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      id="story"
      ref={setSectionRef}
      className="relative h-[400vh]"
      aria-label="How it works"
    >
      {/* Background orbs (parallax drift) */}
      <motion.div
        className="absolute -top-32 -right-24 w-[640px] h-[640px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--landing-orb-1) 0%, transparent 70%)',
          filter: 'blur(70px)',
          y: orb1Y,
        }}
      />
      <motion.div
        className="absolute top-1/3 -left-32 w-[520px] h-[520px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--landing-orb-2) 0%, transparent 70%)',
          filter: 'blur(60px)',
          y: orb2Y,
        }}
      />
      <motion.div
        className="absolute bottom-0 right-1/4 w-[420px] h-[420px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, var(--landing-orb-3) 0%, transparent 70%)',
          filter: 'blur(50px)',
          y: orb3Y,
        }}
      />

      {/* Pinned stage */}
      <div
        className="sticky top-0 h-screen flex items-center overflow-hidden px-6 md:px-12"
        // Manual scrolling cancels the auto-play tour — the visitor is back in
        // control, and fighting them for the wheel would feel broken.
        onWheel={() => stopTour()}
        onTouchStart={() => stopTour()}
      >
        <div className="w-full max-w-6xl mx-auto grid md:grid-cols-2 gap-10 md:gap-16 items-center">
          {/* Left: scene text + rail */}
          <div className="relative pl-10 md:pl-12">
            {/* Progress rail */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 flex flex-col items-center gap-4">
              <div
                className="relative w-px h-56 rounded-full overflow-hidden"
                style={{ background: 'var(--border)' }}
              >
                <motion.div
                  className="absolute inset-x-0 top-0 origin-top"
                  style={{ background: 'var(--primary)', scaleY: scrollYProgress }}
                />
              </div>
              {SCENES.map(({ key, color }, i) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    stopTour();
                    goTo(i);
                  }}
                  className="relative z-10 w-3 h-3 rounded-full transition-all duration-300"
                  aria-label={t(`landing.${key}Title`)}
                  title={t(`landing.${key}Title`)}
                  style={{
                    background: active === i ? color : 'transparent',
                    border: `2px solid ${active === i ? color : 'var(--border)'}`,
                    boxShadow: active === i ? `0 0 0 4px ${color}22` : 'none',
                  }}
                />
              ))}
            </div>

            {/* Scene text — stacked, active one is visible */}
            <div className="relative h-[260px] md:h-[280px]">
              {SCENES.map(({ key, color }, i) => {
                const Icon = SCENE_ICONS[i]!;
                const isActive = active === i;
                return (
                  <div
                    key={key}
                    className="absolute inset-0"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: isActive ? 'translateY(0)' : 'translateY(28px)',
                      filter: isActive ? 'blur(0px)' : 'blur(4px)',
                      pointerEvents: isActive ? 'auto' : 'none',
                      transition:
                        'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1), filter 0.7s cubic-bezier(0.22,1,0.36,1)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <span
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
                        style={{ background: `${color}1a`, color }}
                      >
                        <Icon />
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        className="text-[11px] font-semibold uppercase tracking-widest"
                        style={{ color: 'var(--landing-text-muted)' }}
                      >
                        {t(`landing.${key}Eyebrow`)}
                      </span>
                    </div>
                    <h3
                      className="text-2xl md:text-4xl font-black leading-tight tracking-tighter"
                      style={{ color: 'var(--landing-text-primary)' }}
                    >
                      {t(`landing.${key}Title`)}
                    </h3>
                    <p
                      className="mt-3 text-sm md:text-base leading-relaxed max-w-md"
                      style={{ color: 'var(--landing-text-secondary)' }}
                    >
                      {t(`landing.${key}Desc`)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: pinned phone */}
          <motion.div
            className="relative mx-auto w-full max-w-[300px]"
            style={{ scale: frameScale, rotate: frameRotate, y: frameY }}
          >
            <div className="relative phone-frame rounded-[2.2rem] p-3 md:p-4">
              {/* Notch */}
              <div
                className="absolute top-2.5 left-1/2 -translate-x-1/2 w-16 h-4 rounded-full z-10"
                style={{ background: 'var(--landing-bg)' }}
              />
              {/* Screens */}
              <div
                className="relative h-[340px] sm:h-[400px] md:h-[430px] overflow-hidden rounded-3xl"
                style={{ background: 'var(--card)' }}
              >
                {[
                  <CheckinScene key="c" t={t} />,
                  <CascadeScene key="k" t={t} />,
                  <AssistantScene key="a" t={t} />,
                  <AnalyticsScene key="y" t={t} />,
                ].map((scene, i) => (
                  <div
                    key={i}
                    className="absolute inset-0 p-3 md:p-4"
                    style={{
                      opacity: active === i ? 1 : 0,
                      transform:
                        active === i
                          ? 'translateX(0) scale(1)'
                          : `translateX(${active < i ? 40 : -40}px) scale(0.96)`,
                      filter: active === i ? 'blur(0px)' : 'blur(3px)',
                      pointerEvents: active === i ? 'auto' : 'none',
                      transition:
                        'opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1), filter 0.7s cubic-bezier(0.22,1,0.36,1)',
                    }}
                  >
                    {scene}
                  </div>
                ))}
              </div>
            </div>
            {/* Glow under the phone */}
            <div
              className="absolute -inset-4 -z-10 rounded-[3rem] opacity-40 blur-2xl"
              style={{
                background: `radial-gradient(circle, ${SCENES[active]!.color}33 0%, transparent 70%)`,
              }}
            />
          </motion.div>
        </div>

        {/* Scene counter + play tour */}
        <div
          className="absolute bottom-6 right-6 md:bottom-8 md:right-10 flex items-center gap-4 text-xs font-bold tracking-widest"
          style={{ color: 'var(--landing-text-muted)' }}
        >
          <button
            type="button"
            onClick={() => (touring ? stopTour() : playTour())}
            aria-label={touring ? t('landing.storyTourPause') : t('landing.storyTourPlay')}
            title={touring ? t('landing.storyTourPause') : t('landing.storyTourPlay')}
            className="group flex items-center gap-2 rounded-full px-3.5 py-2 transition-all duration-300 hover:scale-[1.04] active:scale-95"
            style={{
              border: `1px solid ${touring ? 'rgb(var(--green-500-ch) / 40%)' : 'var(--border)'}`,
              background: touring ? 'rgb(var(--green-500-ch) / 10%)' : 'var(--card)',
              color: touring ? 'var(--success-text)' : 'var(--landing-text-primary)',
              boxShadow: touring ? '0 0 0 4px rgb(var(--green-500-ch) / 8%)' : 'none',
            }}
          >
            <span
              className="relative flex items-center justify-center w-6 h-6 rounded-full"
              style={{
                background: touring ? 'var(--success-solid)' : 'var(--primary)',
                color: '#fff',
              }}
            >
              {touring ? (
                <>
                  <span
                    className="absolute inline-flex h-full w-full rounded-full animate-ping opacity-60"
                    style={{ background: 'var(--success-solid)' }}
                  />
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                </>
              ) : (
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                  className="translate-x-px"
                >
                  <path d="M6 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 6 4.5Z" />
                </svg>
              )}
            </span>
            <span className="hidden sm:inline text-[11px] font-bold">
              {touring ? t('landing.storyTourPause') : t('landing.storyTourPlay')}
            </span>
          </button>

          <span style={{ color: SCENES[active]!.color }}>
            {String(active + 1).padStart(2, '0')}
          </span>
          <span className="w-8 h-px" style={{ background: 'var(--border)' }} />
          <span>{String(SCENES.length).padStart(2, '0')}</span>
        </div>
      </div>
    </section>
  );
}
