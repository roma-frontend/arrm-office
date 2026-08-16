'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Defers mounting (and therefore chunk loading + hydration) of below-fold
 * landing sections until they approach the viewport.
 *
 * The sections used to render at page mount, so every dynamic() chunk —
 * ~500KB of JS including the framer-motion runtime and a 360KB date-fns
 * locale chunk — was fetched and executed within seconds of load, on a page
 * the visitor may never scroll. `content-visibility: auto` only skips
 * rendering; it does not defer the JavaScript.
 *
 * The placeholder keeps a min-height so the scrollbar (and Speed Index) stay
 * stable; sections mount ~1200px before entering the viewport, so they are
 * fully rendered by the time the visitor scrolls to them.
 */
export default function LazyMount({
  minHeight = 384,
  className = '',
  children,
}: {
  minHeight?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (visible) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time feature-detection fallback for browsers without IO
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          setVisible(true);
        }
      },
      // Mount a bit before the section is visible so it's ready on arrival.
      // Kept tight: a generous margin mounts (and hydrates) sections that a
      // first-visit viewport never reaches during the initial load window.
      { rootMargin: '200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className={className}>
      {visible ? (
        children
      ) : (
        <div
          className="animate-pulse rounded-3xl"
          style={{ minHeight, backgroundColor: 'var(--landing-card-bg)' }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
