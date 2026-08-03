'use client';

import { useEffect } from 'react';

/**
 * Freezes the page behind an open dialog.
 *
 * The dashboard scrolls inside `main.main-scrollable`, not on `<body>`, so
 * locking the body alone leaves the background scrollable. Hiding the scroll
 * container's overflow removes its scrollbar, which reflows the content by the
 * scrollbar width and looks like the page jumps sideways — so the same width is
 * added back as padding while the dialog is open.
 *
 * @param locked whether a dialog is currently open
 */
export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;

    const scroller =
      document.querySelector<HTMLElement>('main.main-scrollable') ??
      document.querySelector<HTMLElement>('main');
    const targets: HTMLElement[] = [document.body];
    if (scroller) targets.push(scroller);

    const previous = targets.map((element) => ({
      element,
      overflow: element.style.overflow,
      paddingRight: element.style.paddingRight,
      scrollTop: element.scrollTop,
    }));

    for (const element of targets) {
      // Only the element that actually shows a scrollbar needs compensation.
      const scrollbarWidth = element.offsetWidth - element.clientWidth;
      element.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        const current = parseFloat(getComputedStyle(element).paddingRight) || 0;
        element.style.paddingRight = `${current + scrollbarWidth}px`;
      }
    }

    return () => {
      for (const { element, overflow, paddingRight, scrollTop } of previous) {
        element.style.overflow = overflow;
        element.style.paddingRight = paddingRight;
        // Some browsers reset scrollTop while overflow is hidden.
        if (element.scrollTop !== scrollTop) {
          element.scrollTo({ top: scrollTop, behavior: 'instant' });
        }
      }
    };
  }, [locked]);
}
