'use client';

import { useEffect, useRef, useState } from 'react';

export type ScrollDirection = 'up' | 'down' | null;

/**
 * Tracks scroll direction. Returns 'up' when scrolling up (show header),
 * 'down' when scrolling down (hide header), null initially.
 * Header always shows when near top (< threshold).
 *
 * Scroll source: the dashboard content scrolls inside `main`, not the document —
 * see `Providers` (`main.main-scrollable`). Watching only `window` therefore made
 * the header react to the wrong thing: on most pages the document never scrolls,
 * and on pages with no scroller at all (/chat) the only movement `window` ever
 * reported was spurious document overflow, which hid the header with no gesture
 * available to bring it back. Element scrolls are picked up via a capture-phase
 * listener (scroll events do not bubble) and filtered to `main`, so nested
 * scrollers such as dropdowns and lists do not drive the header.
 *
 * @param threshold px from the top within which the header always shows
 * @param resetKey change this (e.g. the pathname) to force the header visible
 *   again — a navigation starts at the top of a fresh scroll container
 */
export function useScrollDirection(threshold = 64, resetKey?: string): ScrollDirection {
  const [direction, setDirection] = useState<ScrollDirection>(null);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    // Runs on mount and on every navigation. Without this the header stays
    // hidden after arriving on a page that cannot scroll, because no further
    // scroll event ever arrives to flip the direction back to 'up'.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset
    setDirection('up');
    lastY.current = 0;
  }, [threshold, resetKey]);

  useEffect(() => {
    const onScroll = (event: Event) => {
      const target = event.target;

      let y: number;
      if (target instanceof HTMLElement) {
        // Only the page-level scroll container moves the header.
        if (target.tagName !== 'MAIN') return;
        y = target.scrollTop;
      } else {
        y = window.scrollY;
      }

      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
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
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [threshold]);

  return direction;
}
