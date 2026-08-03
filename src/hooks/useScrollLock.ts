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
 * Locks are reference counted per element, because they nest: /calendar locks
 * the page for "any modal open" while the dialog's own shell locks it again.
 * When each lock saved and restored the inline styles itself, the inner one
 * (which mounts first, so it captures the *unlocked* value) released to
 * `overflow: ''` while a dialog was still open, and the outer one then wrote
 * back the `hidden` it had captured — leaving the page permanently unable to
 * scroll after a dialog was closed. Counting makes the result independent of
 * release order: the original styles are captured on the first lock and
 * restored when the last one lets go.
 *
 * @param locked whether a dialog is currently open
 */

interface LockState {
  count: number;
  overflow: string;
  paddingRight: string;
  scrollTop: number;
}

/** Module-level so every hook instance shares one count per element. */
const locks = new WeakMap<HTMLElement, LockState>();

function lockTargets(): HTMLElement[] {
  const targets: HTMLElement[] = [document.body];
  const scroller =
    document.querySelector<HTMLElement>('main.main-scrollable') ??
    document.querySelector<HTMLElement>('main');
  if (scroller) targets.push(scroller);
  return targets;
}

function acquire(element: HTMLElement): void {
  const existing = locks.get(element);
  if (existing) {
    existing.count += 1;
    return;
  }

  locks.set(element, {
    count: 1,
    overflow: element.style.overflow,
    paddingRight: element.style.paddingRight,
    scrollTop: element.scrollTop,
  });

  // Only the element that actually shows a scrollbar needs compensation.
  const scrollbarWidth = element.offsetWidth - element.clientWidth;
  element.style.overflow = 'hidden';
  if (scrollbarWidth > 0) {
    const current = parseFloat(getComputedStyle(element).paddingRight) || 0;
    element.style.paddingRight = `${current + scrollbarWidth}px`;
  }
}

function release(element: HTMLElement): void {
  const state = locks.get(element);
  if (!state) return;

  state.count -= 1;
  if (state.count > 0) return;

  locks.delete(element);
  element.style.overflow = state.overflow;
  element.style.paddingRight = state.paddingRight;
  // Some browsers reset scrollTop while overflow is hidden.
  if (element.scrollTop !== state.scrollTop) {
    element.scrollTo({ top: state.scrollTop, behavior: 'instant' });
  }
}

export function useScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;

    const targets = lockTargets();
    for (const element of targets) acquire(element);

    return () => {
      for (const element of targets) release(element);
    };
  }, [locked]);
}
