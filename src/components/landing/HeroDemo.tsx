'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { TFunction } from 'i18next';

/**
 * Live product demo — the hero's visual hook.
 *
 * Four hand-built screens of the product (dashboard, analytics, AI chat,
 * calendar) cycle in the browser frame with a ken-burns style crossfade and a
 * clickable progress bar. Everything is CSS-driven with no canvas or video:
 * numbers count up, bars grow, the chat types itself, cells light up. This is
 * the first thing a visitor sees, so it has to feel *alive* — but it also has
 * to respect motion preferences and never trap the pointer.
 */

const SCREEN_MS = 6200;
const REDUCED = '(prefers-reduced-motion: reduce)';

/* ── tiny inline SVG icon set (no lucide on the landing bundle) ─────────── */

function useCountUp(target: number, active: boolean, duration = 1100) {
  const [value, setValue] = React.useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // easeOutCubic — fast start, slow settle, feels like a counter.
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);
  return value;
}

function UsersIcon() {
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
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

function TrendUpIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function CalendarIcon() {
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
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function SparklesIcon() {
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
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="12"
      height="12"
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
  );
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CheckInIcon() {
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
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

function PulseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

/* ── Screen: Dashboard ───────────────────────────────────────────────────── */

const CHART_BARS = [38, 52, 44, 65, 58, 72, 60, 78, 70, 85, 76, 92];

function DashboardScreen({ t }: { t: TFunction }) {
  const attendance = useCountUp(98.2, true, 1400);
  const headcount = useCountUp(124, true, 1600);
  const onTrack = useCountUp(87, true, 1800);
  const okr1 = useCountUp(72, true, 1500);
  const okr2 = useCountUp(45, true, 1900);

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 p-4 md:p-5 min-h-[300px] md:min-h-[340px]">
      {/* Left column: stats + chart */}
      <div className="md:col-span-3 space-y-3">
        {/* Stat row */}
        <div className="grid grid-cols-3 gap-3">
          <div
            className="rounded-xl p-3 demo-pop"
            style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
          >
            <p
              className="text-[10px] font-medium uppercase tracking-wide truncate"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              {t('landing.mockAttendance')}
            </p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span
                className="num text-lg md:text-xl font-semibold leading-none"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {attendance}%
              </span>
              <span style={{ color: 'var(--success-text)' }}>
                <TrendUpIcon />
              </span>
            </div>
          </div>
          <div
            className="rounded-xl p-3 demo-pop demo-pop-1"
            style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
          >
            <p
              className="text-[10px] font-medium uppercase tracking-wide truncate"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              {t('landing.mockHeadcount')}
            </p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span
                className="num text-lg md:text-xl font-semibold leading-none"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {headcount}
              </span>
              <span style={{ color: 'var(--success-text)' }}>
                <TrendUpIcon />
              </span>
            </div>
          </div>
          <div
            className="rounded-xl p-3 demo-pop demo-pop-2"
            style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
          >
            <p
              className="text-[10px] font-medium uppercase tracking-wide truncate"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              {t('landing.mockGoalsOnTrack')}
            </p>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span
                className="num text-lg md:text-xl font-semibold leading-none"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {onTrack}%
              </span>
              <span style={{ color: 'var(--success-text)' }}>
                <TrendUpIcon />
              </span>
            </div>
          </div>
        </div>

        {/* Bar chart — bars grow in sequence */}
        <div
          className="rounded-xl p-3.5 flex items-end gap-1.5 h-32"
          style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
        >
          {CHART_BARS.map((h, i) => (
            <div
              key={i}
              className="flex-1 flex flex-col justify-end rounded-t-sm demo-bar overflow-hidden"
              style={{ height: '100%' }}
            >
              <div
                className="w-full rounded-t-sm demo-bar-inner"
                style={{
                  height: `${h}%`,
                  background:
                    i === CHART_BARS.length - 1
                      ? 'var(--primary)'
                      : 'rgb(var(--brand-600-ch) / 18%)',
                  animationDelay: `${i * 60}ms`,
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Right column: OKR progress */}
      <div
        className="md:col-span-2 rounded-xl p-3.5 space-y-3"
        style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-semibold truncate"
            style={{ color: 'var(--landing-text-secondary)' }}
          >
            {t('landing.mockOkr1')}
          </span>
          <span
            className="num text-[11px] font-semibold"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {okr1}%
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
          <div
            className="h-full rounded-full demo-fill"
            style={{ width: `${okr1}%`, background: 'var(--primary)' }}
          />
        </div>
        <div className="flex items-center justify-between pt-2">
          <span
            className="text-[11px] font-semibold truncate"
            style={{ color: 'var(--landing-text-secondary)' }}
          >
            {t('landing.mockOkr2')}
          </span>
          <span
            className="num text-[11px] font-semibold"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            {okr2}%
          </span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--muted)' }}>
          <div
            className="h-full rounded-full demo-fill"
            style={{ width: `${okr2}%`, background: 'rgb(var(--brand-600-ch) / 55%)' }}
          />
        </div>
        <div className="flex items-center gap-1.5 pt-2">
          <span
            className="w-1.5 h-1.5 rounded-full pulse-dot"
            style={{ background: 'var(--success-solid)' }}
          />
          <span className="text-[10px] font-medium" style={{ color: 'var(--landing-text-muted)' }}>
            {t('landing.mockLiveSync')}
          </span>
        </div>
        {/* Live notification pops in */}
        <div
          className="demo-notify rounded-lg px-2.5 py-2 flex items-center gap-2"
          style={{
            border: '1px solid rgb(var(--brand-600-ch) / 20%)',
            background: 'rgb(var(--brand-600-ch) / 6%)',
          }}
        >
          <span style={{ color: 'var(--primary)' }}>
            <BellIcon />
          </span>
          <span
            className="text-[10px] font-medium truncate"
            style={{ color: 'var(--landing-text-secondary)' }}
          >
            {t('landing.demoNotify')}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Screen: Analytics ───────────────────────────────────────────────────── */

const LINE_POINTS = '2,96 42,84 82,88 122,64 162,70 202,44 242,52 282,28 322,36 362,16';

function AnalyticsScreen({ t }: { t: TFunction }) {
  const weekly = useCountUp(9.4, true, 1500);

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3 p-4 md:p-5 min-h-[300px] md:min-h-[340px]">
      <div
        className="md:col-span-3 rounded-xl p-3.5 flex flex-col"
        style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-[11px] font-semibold"
            style={{ color: 'var(--landing-text-secondary)' }}
          >
            {t('landing.demoTrend')}
          </span>
          <span
            className="num inline-flex items-center gap-1 text-[11px] font-bold"
            style={{ color: 'var(--success-text)' }}
          >
            <TrendUpIcon />
            {weekly}%
          </span>
        </div>
        <div className="flex-1 min-h-[180px] relative">
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 364 104"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {/* grid lines */}
            {[26, 52, 78].map((y) => (
              <line
                key={y}
                x1="0"
                x2="364"
                y1={y}
                y2={y}
                stroke="var(--muted)"
                strokeWidth="1"
                strokeDasharray="3 5"
                opacity="0.5"
              />
            ))}
            {/* area fill */}
            <path
              d={`M2,104 L2,96 ${LINE_POINTS.replace(/ /g, ' L')} 362,104 Z`}
              fill="rgb(var(--brand-600-ch) / 10%)"
              className="demo-area"
            />
            {/* line */}
            <polyline
              points={LINE_POINTS}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="demo-line"
            />
            {/* end dot */}
            <circle cx="362" cy="16" r="4" fill="var(--primary)" className="demo-dot" />
          </svg>
        </div>
      </div>

      <div
        className="md:col-span-2 rounded-xl p-3.5 space-y-2.5"
        style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
      >
        <span
          className="text-[11px] font-semibold"
          style={{ color: 'var(--landing-text-secondary)' }}
        >
          {t('landing.demoHeatmap')}
        </span>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 28 }, (_, i) => {
            const intensity = (i * 7) % 10;
            const lit = intensity > 3;
            return (
              <span
                key={i}
                className="aspect-square rounded-[4px] demo-cell"
                style={{
                  background: lit
                    ? `rgb(var(--brand-600-ch) / ${Math.min(0.9, 0.25 + intensity / 14)})`
                    : 'var(--muted)',
                  animationDelay: `${i * 40}ms`,
                }}
              />
            );
          })}
        </div>
        {/* stacked mini bars */}
        <div className="flex items-end gap-2 h-16 pt-2">
          {[46, 68, 52, 84, 61, 92, 74].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm demo-bar-inner"
              style={{
                height: `${h}%`,
                background: 'rgb(var(--brand-600-ch) / 40%)',
                animationDelay: `${i * 80}ms`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Screen: AI Chat ─────────────────────────────────────────────────────── */

function ChatScreen({ t }: { t: TFunction }) {
  const [step, setStep] = React.useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setStep(1), 700),
      setTimeout(() => setStep(2), 1900),
      setTimeout(() => setStep(3), 3400),
      setTimeout(() => setStep(4), 4600),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col p-4 md:p-5 min-h-[300px] md:min-h-[340px]">
      {/* chat header */}
      <div
        className="flex items-center gap-2 pb-3 border-b mb-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <span
          className="flex items-center justify-center w-6 h-6 rounded-lg"
          style={{ background: 'rgb(var(--brand-600-ch) / 12%)', color: 'var(--primary)' }}
        >
          <BotIcon />
        </span>
        <span className="text-xs font-semibold" style={{ color: 'var(--landing-text-primary)' }}>
          {t('landing.demoAiName')}
        </span>
        <span
          className="flex items-center gap-1 text-[10px] font-medium ml-auto"
          style={{ color: 'var(--success-text)' }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: 'var(--success-solid)' }}
          />
          {t('landing.demoOnline')}
        </span>
      </div>

      <div className="flex-1 space-y-3">
        {/* user bubble */}
        <div className="flex justify-end">
          <p
            className="max-w-[80%] rounded-2xl rounded-br-md px-3.5 py-2 text-xs font-medium demo-bubble"
            style={{ background: 'var(--primary)', color: 'var(--brand-contrast)' }}
          >
            {t('landing.demoUserAsk')}
          </p>
        </div>

        {/* typing indicator */}
        {step >= 1 && step < 2 && (
          <div className="flex justify-start">
            <div
              className="rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1"
              style={{ background: 'var(--muted)' }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-1.5 h-1.5 rounded-full demo-typing"
                  style={{ animationDelay: `${i * 160}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {/* AI answer */}
        {step >= 2 && (
          <div className="flex justify-start">
            <p
              className="max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2 text-xs font-medium demo-bubble"
              style={{ background: 'var(--muted)', color: 'var(--landing-text-primary)' }}
            >
              {t('landing.demoAiAnswer')}
            </p>
          </div>
        )}

        {/* suggestion chips */}
        {step >= 3 && (
          <div className="demo-pop space-y-1.5">
            <span
              className="flex items-center gap-1 text-[10px] font-semibold"
              style={{ color: 'var(--primary)' }}
            >
              <SparklesIcon />
              {t('landing.demoAiSuggestions')}
            </span>
            <div className="flex flex-wrap gap-2">
              {(
                [t('landing.demoChip1'), t('landing.demoChip2'), t('landing.demoChip3')] as const
              ).map((chip) => (
                <span
                  key={chip}
                  className="px-2.5 py-1 rounded-full text-[10px] font-semibold"
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
          </div>
        )}

        {/* second exchange */}
        {step >= 4 && (
          <>
            <div className="flex justify-end">
              <p
                className="max-w-[80%] rounded-2xl rounded-br-md px-3.5 py-2 text-xs font-medium demo-bubble"
                style={{ background: 'var(--primary)', color: 'var(--brand-contrast)' }}
              >
                {t('landing.demoUserAsk2')}
              </p>
            </div>
            <div className="flex justify-start">
              <p
                className="max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2 text-xs font-medium demo-bubble"
                style={{ background: 'var(--muted)', color: 'var(--landing-text-primary)' }}
              >
                {t('landing.demoAiAnswer2')}
              </p>
            </div>
          </>
        )}
      </div>

      {/* composer */}
      <div
        className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl"
        style={{ border: '1px solid var(--border)', background: 'var(--muted)' }}
      >
        <span className="flex-1 text-[10px]" style={{ color: 'var(--landing-text-muted)' }}>
          {t('landing.demoComposer')}
        </span>
        <span
          className="flex items-center justify-center w-6 h-6 rounded-lg"
          style={{ background: 'var(--primary)', color: 'var(--brand-contrast)' }}
        >
          <SendIcon />
        </span>
      </div>
    </div>
  );
}

/* ── Screen: Calendar / leave ────────────────────────────────────────────── */

function CalendarScreen({ t }: { t: TFunction }) {
  const events = [8, 13, 14, 19, 24, 27];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 md:p-5 min-h-[300px] md:min-h-[340px]">
      {/* month grid */}
      <div
        className="rounded-xl p-3.5"
        style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-xs font-semibold flex items-center gap-1.5"
            style={{ color: 'var(--landing-text-primary)' }}
          >
            <span style={{ color: 'var(--primary)' }}>
              <CalendarIcon />
            </span>
            {t('landing.demoMonth')}
          </span>
          <span className="text-[10px] font-medium" style={{ color: 'var(--landing-text-muted)' }}>
            {t('landing.demoSyncGoogle')}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
          {(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const).map((d) => (
            <span
              key={d}
              className="text-[9px] font-semibold uppercase"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 28 }, (_, i) => {
            const day = i + 1;
            const hasEvent = events.includes(day);
            const today = day === 19;
            return (
              <div
                key={day}
                className="relative aspect-square flex items-center justify-center demo-cell"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <span
                  className={`flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-semibold ${
                    today ? 'text-white' : ''
                  }`}
                  style={
                    today
                      ? { background: 'var(--primary)' }
                      : hasEvent
                        ? { background: 'rgb(var(--brand-600-ch) / 10%)', color: 'var(--primary)' }
                        : { color: 'var(--landing-text-muted)' }
                  }
                >
                  {day}
                </span>
                {hasEvent && (
                  <span
                    className="absolute bottom-0.5 w-1 h-1 rounded-full"
                    style={{ background: 'var(--primary)' }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* upcoming + leave card */}
      <div className="space-y-3">
        <div
          className="rounded-xl p-3.5 space-y-2 demo-pop"
          style={{ border: '1px solid var(--border)', background: 'var(--card)' }}
        >
          <span
            className="text-[11px] font-semibold"
            style={{ color: 'var(--landing-text-secondary)' }}
          >
            {t('landing.demoUpcoming')}
          </span>
          {[
            { k: 'demoEvent1', icon: <CheckInIcon />, color: 'var(--primary)' },
            { k: 'demoEvent2', icon: <HeartIcon />, color: 'var(--success-text)' },
            { k: 'demoEvent3', icon: <UsersIcon />, color: 'var(--landing-orb-3)' },
          ].map(({ k, icon, color }) => (
            <div
              key={k}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2"
              style={{ border: '1px solid var(--border)', background: 'var(--muted)' }}
            >
              <span
                className="flex items-center justify-center w-6 h-6 rounded-lg shrink-0"
                style={{ background: `rgb(var(--brand-600-ch) / 8%)`, color }}
              >
                {icon}
              </span>
              <span
                className="text-[11px] font-medium truncate flex-1"
                style={{ color: 'var(--landing-text-primary)' }}
              >
                {t(`landing.${k}`)}
              </span>
              <span
                className="text-[9px] font-semibold num"
                style={{ color: 'var(--landing-text-muted)' }}
              >
                {t('landing.demoIn2h')}
              </span>
            </div>
          ))}
        </div>

        <div
          className="rounded-xl p-3.5 flex items-center gap-3 demo-pop demo-pop-1"
          style={{
            border: '1px solid rgb(var(--green-500-ch) / 25%)',
            background: 'rgb(var(--green-500-ch) / 8%)',
          }}
        >
          <span
            className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
            style={{ background: 'rgb(var(--green-500-ch) / 15%)', color: 'var(--success-text)' }}
          >
            <PulseIcon />
          </span>
          <div className="min-w-0">
            <p
              className="text-[11px] font-semibold truncate"
              style={{ color: 'var(--landing-text-primary)' }}
            >
              {t('landing.demoApproved')}
            </p>
            <p
              className="text-[9px] font-medium truncate"
              style={{ color: 'var(--landing-text-muted)' }}
            >
              {t('landing.demoApprovedBy')}
            </p>
          </div>
          <span
            className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold shrink-0"
            style={{ color: 'var(--success-text)' }}
          >
            <CheckIcon />
            {t('landing.demoDone')}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Screens registry ────────────────────────────────────────────────────── */

export { DashboardScreen, AnalyticsScreen, ChatScreen, CalendarScreen };

const SCREENS = [
  { id: 'dashboard', labelKey: 'landing.demoTabDash', render: DashboardScreen },
  { id: 'analytics', labelKey: 'landing.demoTabAnalytics', render: AnalyticsScreen },
  { id: 'chat', labelKey: 'landing.demoTabChat', render: ChatScreen },
  { id: 'calendar', labelKey: 'landing.demoTabCalendar', render: CalendarScreen },
] as const;

/* ── Main component ──────────────────────────────────────────────────────── */

export default function HeroDemo({ t }: { t: TFunction }) {
  const [screen, setScreen] = useState<number>(0);
  const [paused, setPaused] = useState(false);
  const [reduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(REDUCED).matches;
  });
  const frameRef = useRef<HTMLDivElement>(null);

  // Auto-advance loop. Pause on hover/focus-within; never auto-advance when
  // reduced motion is requested (the dots remain clickable).
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      if (paused) return;
      setScreen((s) => (s + 1) % SCREENS.length);
    }, SCREEN_MS);
    return () => clearInterval(id);
  }, [paused, reduced]);

  const goTo = useCallback((i: number) => setScreen(i), []);

  /* Pointer spotlight (Vercel/Linear-style glass sheen): the cursor position is
     written straight onto two CSS vars — no React state, no re-renders — and a
     single absolutely-positioned radial gradient follows it. Mouse only
     (`pointer: fine`), disabled entirely under reduced motion, and it ignores
     touch so mobile never pays for it. */
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    if (window.matchMedia(REDUCED).matches) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
      el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
      el.style.setProperty('--spot-opacity', '1');
    };
    const onLeave = () => {
      el.style.setProperty('--spot-opacity', '0');
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div
      ref={frameRef}
      className="hero-demo-frame relative rounded-2xl overflow-hidden text-left"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--landing-card-border)',
        boxShadow: '0 1px 2px rgba(12, 26, 46, 0.06), 0 24px 64px -16px rgba(12, 26, 46, 0.25)',
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Pointer spotlight — position driven by --spot-x/--spot-y on the frame */}
      <div className="hero-spotlight" aria-hidden="true" />

      {/* Title bar */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--muted)' }}
      >
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: 'var(--border)' }}
            />
          ))}
        </div>
        <div
          className="mx-auto flex items-center gap-1.5 px-4 py-1 rounded-full text-[11px] font-medium num"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            color: 'var(--landing-text-muted)',
          }}
        >
          {t('landing.demoUrl')}
        </div>
        <div className="w-12" />
      </div>

      {/* Screen stage — ken-burns crossfade */}
      <div className="relative h-[320px] md:h-[380px] overflow-hidden" aria-live="off">
        {SCREENS.map(({ id, render: Screen }, i) => {
          const active = i === screen;
          return (
            <div
              key={id}
              className="absolute inset-0"
              style={{
                opacity: active ? 1 : 0,
                transform: active ? 'scale(1) translateY(0)' : 'scale(1.04) translateY(6px)',
                transition:
                  'opacity 0.55s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1)',
                pointerEvents: active ? 'auto' : 'none',
              }}
              aria-hidden={!active}
            >
              {active && <Screen t={t} />}
            </div>
          );
        })}
      </div>

      {/* Progress bar + tabs */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--muted)' }}
      >
        {SCREENS.map(({ id, labelKey }, i) => {
          const active = i === screen;
          const past = i < screen;
          return (
            <button
              key={id}
              type="button"
              onClick={() => goTo(i)}
              className="flex-1 min-w-0 group"
              aria-label={t(labelKey)}
              aria-pressed={active}
              title={t(labelKey)}
            >
              <span
                className="block h-1 rounded-full overflow-hidden"
                style={{ background: 'var(--border)' }}
              >
                <span
                  className="block h-full rounded-full demo-progress"
                  style={{
                    background: 'var(--primary)',
                    width: past ? '100%' : active ? '0%' : '0%',
                    animationPlayState: paused ? 'paused' : 'running',
                  }}
                />
              </span>
              <span
                className={`block mt-1.5 text-[9px] font-semibold uppercase tracking-wider text-center transition-colors duration-300 truncate ${
                  active ? '' : 'opacity-60'
                }`}
                style={{ color: active ? 'var(--primary)' : 'var(--landing-text-muted)' }}
              >
                {t(labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
