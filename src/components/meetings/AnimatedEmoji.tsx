'use client';

/**
 * AnimatedEmoji — emoji character moves + SVG effect overlays.
 *
 * Each emoji TEXT element has its own CSS animation that makes it
 * perform the character's action (thrust, beat, shake, bounce, clap).
 * SVG overlays add sparkle/tears/confetti on top.
 */

import React from 'react';

interface AnimatedEmojiProps {
  emoji: string;
  size?: number;
  className?: string;
}

/* Per-emoji CSS animation for the text element itself */
const charAnimations: Record<string, string> = {
  '👍': 'ae-thrust 0.8s cubic-bezier(0.22,1.2,0.36,1) infinite',
  '❤️': 'ae-heartbeat 1s cubic-bezier(0.21,0.61,0.35,1) infinite',
  '😂': 'ae-laugh 0.3s ease-in-out infinite alternate',
  '🎉': 'ae-bounce 0.7s cubic-bezier(0.22,1.2,0.36,1) infinite',
  '👏': 'ae-clap 0.5s ease-in-out infinite alternate',
};

const charTransformOrigins: Record<string, string> = {
  '👍': 'center bottom',
  '❤️': 'center center',
  '😂': 'center bottom',
  '🎉': 'center center',
  '👏': 'center center',
};

export function AnimatedEmoji({ emoji, size = 64, className }: AnimatedEmojiProps) {
  const Effect = effects[emoji];

  return (
    <>
      <style>{`
        @keyframes ae-thrust {
          0%   { transform: translateY(8px) scale(0.88) rotate(-4deg); }
          20%  { transform: translateY(-14px) scale(1.18) rotate(2deg); }
          35%  { transform: translateY(-4px) scale(1.02) rotate(-1deg); }
          50%  { transform: translateY(-10px) scale(1.1) rotate(1deg); }
          65%  { transform: translateY(-2px) scale(1.01) rotate(0deg); }
          80%  { transform: translateY(-6px) scale(1.05); }
          100% { transform: translateY(8px) scale(0.88) rotate(-4deg); }
        }
        @keyframes ae-heartbeat {
          0%   { transform: scale(1); }
          10%  { transform: scale(1.28); }
          20%  { transform: scale(0.92); }
          30%  { transform: scale(1.2); }
          40%  { transform: scale(0.97); }
          50%  { transform: scale(1.1); }
          65%  { transform: scale(1); }
          100% { transform: scale(1); }
        }
        @keyframes ae-laugh {
          0%   { transform: rotate(-5deg) translateY(1px); }
          100% { transform: rotate(5deg) translateY(-3px); }
        }
        @keyframes ae-bounce {
          0%   { transform: translateY(0) scale(1) rotate(0deg); }
          15%  { transform: translateY(-16px) scale(1.12) rotate(-3deg); }
          30%  { transform: translateY(2px) scale(0.95) rotate(1deg); }
          45%  { transform: translateY(-8px) scale(1.06) rotate(-1deg); }
          60%  { transform: translateY(1px) scale(0.98); }
          100% { transform: translateY(0) scale(1) rotate(0deg); }
        }
        @keyframes ae-clap {
          0%   { transform: scaleX(1) scaleY(1); }
          40%  { transform: scaleX(1.2) scaleY(0.88); }
          100% { transform: scaleX(0.9) scaleY(1.05); }
        }
      `}</style>

      <span
        className={className}
        style={{
          position: 'relative',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          fontSize: size * 0.65,
          lineHeight: 1,
        }}
      >
        <span
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'inline-block',
            animation: charAnimations[emoji],
            transformOrigin: charTransformOrigins[emoji] || 'center center',
            willChange: 'transform',
          }}
        >
          {emoji}
        </span>

        {Effect && (
          <svg
            width={size * 1.8}
            height={size * 1.8}
            viewBox="0 0 180 180"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            <Effect />
          </svg>
        )}
      </span>
    </>
  );
}

const effects: Record<string, React.FC> = {
  '👍': ThumbsEffect,
  '❤️': HeartEffect,
  '😂': LaughEffect,
  '🎉': CelebrationEffect,
  '👏': ClapEffect,
};

/* ─── 👍 Speed lines + burst ring ─────────────────────────────────────── */
function ThumbsEffect() {
  return (
    <g>
      <style>{`
        .te-speed { animation: te-up 0.8s ease-out infinite; opacity: 0; }
        .te-burst { animation: te-ring 0.8s ease-out infinite; opacity: 0; transform-origin: 90px 55px; }
        @keyframes te-up {
          0%   { opacity: 0; transform: translateY(0); }
          15%  { opacity: 0.9; }
          100% { opacity: 0; transform: translateY(-50px); }
        }
        @keyframes te-ring {
          0%   { opacity: 0; transform: scale(0.3); }
          20%  { opacity: 0.8; transform: scale(1); }
          100% { opacity: 0; transform: scale(2); }
        }
      `}</style>
      <line
        className="te-speed"
        x1="78"
        y1="95"
        x2="70"
        y2="40"
        stroke="#FFD54F"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line
        className="te-speed"
        x1="90"
        y1="90"
        x2="90"
        y2="28"
        stroke="#FFD54F"
        strokeWidth="3.5"
        strokeLinecap="round"
        style={{ animationDelay: '0.06s' }}
      />
      <line
        className="te-speed"
        x1="102"
        y1="95"
        x2="110"
        y2="40"
        stroke="#FFD54F"
        strokeWidth="3"
        strokeLinecap="round"
        style={{ animationDelay: '0.12s' }}
      />
      <circle
        className="te-burst"
        cx="90"
        cy="48"
        r="14"
        fill="none"
        stroke="#FFEB3B"
        strokeWidth="2.5"
      />
    </g>
  );
}

/* ─── ❤️ Glow ring + floating mini-hearts ─────────────────────────────── */
function HeartEffect() {
  return (
    <g>
      <style>{`
        .he-glow { animation: he-pulse 1s ease-in-out infinite; opacity: 0; transform-origin: 90px 90px; }
        .he-mh { animation: he-float 1.1s ease-out infinite; opacity: 0; }
        @keyframes he-pulse {
          0%   { opacity: 0; transform: scale(0.8); }
          15%  { opacity: 0.5; transform: scale(1.15); }
          40%  { opacity: 0.2; transform: scale(1.25); }
          60%  { opacity: 0.45; transform: scale(1.12); }
          100% { opacity: 0; transform: scale(1.35); }
        }
        @keyframes he-float {
          0%   { opacity: 0; transform: translate(0,0) scale(1); }
          15%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--dx), -38px) scale(0.25); }
        }
      `}</style>
      <circle
        className="he-glow"
        cx="90"
        cy="90"
        r="30"
        fill="none"
        stroke="#FF2D55"
        strokeWidth="3"
      />
      <text
        className="he-mh"
        x="68"
        y="78"
        fontSize="16"
        fill="#FF6B8A"
        style={{ '--dx': '-16px' } as React.CSSProperties}
      >
        ♥
      </text>
      <text
        className="he-mh"
        x="112"
        y="76"
        fontSize="13"
        fill="#FF8FA3"
        style={{ '--dx': '14px', animationDelay: '0.3s' } as React.CSSProperties}
      >
        ♥
      </text>
      <text
        className="he-mh"
        x="82"
        y="68"
        fontSize="11"
        fill="#FFB3C1"
        style={{ '--dx': '-6px', animationDelay: '0.55s' } as React.CSSProperties}
      >
        ♥
      </text>
      <text
        className="he-mh"
        x="102"
        y="70"
        fontSize="12"
        fill="#FF4D6D"
        style={{ '--dx': '10px', animationDelay: '0.15s' } as React.CSSProperties}
      >
        ♥
      </text>
    </g>
  );
}

/* ─── 😂 Tear drops flying outward + sparkle stars ────────────────────── */
function LaughEffect() {
  return (
    <g>
      <style>{`
        .le-tear { animation: le-fly 0.85s ease-out infinite; opacity: 0; }
        .le-star { animation: le-spark 0.7s ease-in-out infinite; opacity: 0; }
        @keyframes le-fly {
          0%   { opacity: 0; transform: translate(0,0) scale(1); }
          12%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0.3); }
        }
        @keyframes le-spark {
          0%   { opacity: 0; transform: scale(0) rotate(0deg); }
          30%  { opacity: 1; transform: scale(1.2) rotate(90deg); }
          70%  { opacity: 0.7; transform: scale(0.8) rotate(180deg); }
          100% { opacity: 0; transform: scale(0) rotate(360deg); }
        }
      `}</style>
      <circle
        className="le-tear"
        cx="68"
        cy="80"
        r="4"
        fill="#4FC3F7"
        style={{ '--tx': '-22px', '--ty': '18px' } as React.CSSProperties}
      />
      <circle
        className="le-tear"
        cx="112"
        cy="80"
        r="4"
        fill="#4FC3F7"
        style={{ '--tx': '22px', '--ty': '18px', animationDelay: '0.25s' } as React.CSSProperties}
      />
      <circle
        className="le-tear"
        cx="65"
        cy="85"
        r="3"
        fill="#29B6F6"
        style={{ '--tx': '-18px', '--ty': '24px', animationDelay: '0.45s' } as React.CSSProperties}
      />
      <circle
        className="le-tear"
        cx="115"
        cy="85"
        r="3"
        fill="#29B6F6"
        style={{ '--tx': '18px', '--ty': '24px', animationDelay: '0.65s' } as React.CSSProperties}
      />
      <g className="le-star" style={{ animationDelay: '0.1s' }}>
        <line
          x1="58"
          y1="72"
          x2="66"
          y2="72"
          stroke="#FFF176"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="62"
          y1="68"
          x2="62"
          y2="76"
          stroke="#FFF176"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
      <g className="le-star" style={{ animationDelay: '0.4s' }}>
        <line
          x1="114"
          y1="72"
          x2="122"
          y2="72"
          stroke="#FFF176"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <line
          x1="118"
          y1="68"
          x2="118"
          y2="76"
          stroke="#FFF176"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </g>
  );
}

/* ─── 🎉 Confetti burst ──────────────────────────────────────────────── */
function CelebrationEffect() {
  return (
    <g>
      <style>{`
        .ce-p { animation: ce-explode 1.1s ease-out infinite; opacity: 0; }
        @keyframes ce-explode {
          0%   { opacity: 0; transform: translate(0,0) rotate(0deg) scale(1.3); }
          10%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) rotate(var(--tr)) scale(0.15); }
        }
      `}</style>
      <rect
        className="ce-p"
        x="86"
        y="72"
        width="6"
        height="8"
        rx="1"
        fill="#E8243A"
        style={{ '--tx': '-30px', '--ty': '-48px', '--tr': '720deg' } as React.CSSProperties}
      />
      <rect
        className="ce-p"
        x="88"
        y="70"
        width="5"
        height="7"
        rx="1"
        fill="#4CAF50"
        style={
          {
            '--tx': '28px',
            '--ty': '-42px',
            '--tr': '-600deg',
            animationDelay: '0.08s',
          } as React.CSSProperties
        }
      />
      <rect
        className="ce-p"
        x="90"
        y="74"
        width="7"
        height="5"
        rx="1"
        fill="#2196F3"
        style={
          {
            '--tx': '-10px',
            '--ty': '-55px',
            '--tr': '840deg',
            animationDelay: '0.04s',
          } as React.CSSProperties
        }
      />
      <rect
        className="ce-p"
        x="84"
        y="76"
        width="5"
        height="6"
        rx="1"
        fill="#FF9800"
        style={
          {
            '--tx': '18px',
            '--ty': '-50px',
            '--tr': '-540deg',
            animationDelay: '0.14s',
          } as React.CSSProperties
        }
      />
      <rect
        className="ce-p"
        x="92"
        y="68"
        width="6"
        height="5"
        rx="1"
        fill="#E040FB"
        style={
          {
            '--tx': '-35px',
            '--ty': '-38px',
            '--tr': '900deg',
            animationDelay: '0.2s',
          } as React.CSSProperties
        }
      />
      <circle
        className="ce-p"
        cx="90"
        cy="74"
        r="3.5"
        fill="#FFEB3B"
        style={
          {
            '--tx': '6px',
            '--ty': '-58px',
            '--tr': '480deg',
            animationDelay: '0.02s',
          } as React.CSSProperties
        }
      />
      <circle
        className="ce-p"
        cx="88"
        cy="72"
        r="2.5"
        fill="#FF5722"
        style={
          {
            '--tx': '-16px',
            '--ty': '-44px',
            '--tr': '-720deg',
            animationDelay: '0.18s',
          } as React.CSSProperties
        }
      />
      <circle
        className="ce-p"
        cx="92"
        cy="76"
        r="3"
        fill="#00BCD4"
        style={
          {
            '--tx': '35px',
            '--ty': '-32px',
            '--tr': '600deg',
            animationDelay: '0.1s',
          } as React.CSSProperties
        }
      />
      <rect
        className="ce-p"
        x="87"
        y="70"
        width="4"
        height="9"
        rx="1"
        fill="#8BC34A"
        style={
          {
            '--tx': '-24px',
            '--ty': '-35px',
            '--tr': '-840deg',
            animationDelay: '0.22s',
          } as React.CSSProperties
        }
      />
      <rect
        className="ce-p"
        x="91"
        y="72"
        width="4"
        height="9"
        rx="1"
        fill="#F44336"
        style={
          {
            '--tx': '26px',
            '--ty': '-52px',
            '--tr': '780deg',
            animationDelay: '0.06s',
          } as React.CSSProperties
        }
      />
      <polygon
        className="ce-p"
        points="90,70 92,66 94,70 88,68"
        fill="#FFD700"
        style={
          {
            '--tx': '-8px',
            '--ty': '-60px',
            '--tr': '1080deg',
            animationDelay: '0.12s',
          } as React.CSSProperties
        }
      />
      <polygon
        className="ce-p"
        points="90,70 92,66 94,70 88,68"
        fill="#FF4081"
        style={
          {
            '--tx': '14px',
            '--ty': '-46px',
            '--tr': '-960deg',
            animationDelay: '0.24s',
          } as React.CSSProperties
        }
      />
    </g>
  );
}

/* ─── 👏 Impact wave + sparks ─────────────────────────────────────────── */
function ClapEffect() {
  return (
    <g>
      <style>{`
        .cl-wave { animation: cl-ring 0.5s ease-out infinite; opacity: 0; transform-origin: 90px 80px; }
        .cl-spark { animation: cl-fly 0.5s ease-out infinite; opacity: 0; }
        @keyframes cl-ring {
          0%   { opacity: 0; transform: scale(0.2); }
          18%  { opacity: 0.85; transform: scale(1); }
          50%  { opacity: 0.4; transform: scale(1.6); }
          100% { opacity: 0; transform: scale(2.2); }
        }
        @keyframes cl-fly {
          0%   { opacity: 0; transform: translate(0,0) scale(1); }
          15%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--sx), var(--sy)) scale(0.15); }
        }
      `}</style>
      <circle
        className="cl-wave"
        cx="90"
        cy="80"
        r="10"
        fill="none"
        stroke="#FFD700"
        strokeWidth="3"
      />
      <circle
        className="cl-wave"
        cx="90"
        cy="80"
        r="10"
        fill="none"
        stroke="#FFF176"
        strokeWidth="2"
        style={{ animationDelay: '0.08s' }}
      />
      <circle
        className="cl-spark"
        cx="90"
        cy="75"
        r="2.5"
        fill="#FFD700"
        style={{ '--sx': '-16px', '--sy': '-18px' } as React.CSSProperties}
      />
      <circle
        className="cl-spark"
        cx="90"
        cy="75"
        r="2"
        fill="#FFF176"
        style={{ '--sx': '18px', '--sy': '-14px', animationDelay: '0.07s' } as React.CSSProperties}
      />
      <circle
        className="cl-spark"
        cx="90"
        cy="75"
        r="3"
        fill="#FFC107"
        style={{ '--sx': '-8px', '--sy': '-24px', animationDelay: '0.14s' } as React.CSSProperties}
      />
      <circle
        className="cl-spark"
        cx="90"
        cy="75"
        r="2"
        fill="#FFEB3B"
        style={{ '--sx': '10px', '--sy': '-22px', animationDelay: '0.04s' } as React.CSSProperties}
      />
      <circle
        className="cl-spark"
        cx="90"
        cy="75"
        r="1.5"
        fill="#FFF9C4"
        style={{ '--sx': '0px', '--sy': '-26px', animationDelay: '0.18s' } as React.CSSProperties}
      />
    </g>
  );
}
