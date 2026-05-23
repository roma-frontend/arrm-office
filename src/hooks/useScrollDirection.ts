'use client';

import { useEffect, useRef, useState } from 'react';

export type ScrollDirection = 'up' | 'down' | null;

/**
 * Tracks scroll direction. Returns 'up' when scrolling up (show header),
 * 'down' when scrolling down (hide header), null initially.
 * Header always shows when near top (< threshold).
 */
export function useScrollDirection(threshold = 64): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>(null);
  const lastY = useRef(0);
  const ticking = useRef(false);

  // Reset on mount — ensures navbar shows after navigation
  useEffect(() => {
    if (window.scrollY <= threshold) {
      setDirection('up');
      lastY.current = window.scrollY;
    }
  }, [threshold]);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const y = window.scrollY;
        // Ignore iOS rubber-band overscroll (negative or bouncing values)
        if (y <= 0) {
          setDirection('up');
          lastY.current = 0;
          ticking.current = false;
          return;
        }
        if (y < threshold) {
          setDirection('up');
        } else if (y > lastY.current + 5) {
          setDirection('down');
        } else if (y < lastY.current - 5) {
          setDirection('up');
        }
        lastY.current = y;
        ticking.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return direction;
}
