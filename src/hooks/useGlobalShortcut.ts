'use client';

import { useEffect, useRef } from 'react';

/**
 * Window-level keyboard shortcut.
 *
 * Two things this handles that an inline `useEffect` + `addEventListener`
 * usually gets wrong:
 *
 * 1. **The handler is kept in a ref.** The listener is attached exactly once per
 *    key combination. The palette's previous implementation listed a
 *    freshly-computed array in its dependency array, so it detached and
 *    re-attached a window listener on every single render.
 *
 * 2. **Typing is not a shortcut.** Bare keys (`/`, `?`) are ignored while the
 *    user is in an input, textarea, select or contenteditable — several pages
 *    already bind `/` to focus their own search box. Modifier combinations
 *    (⌘K / Ctrl+K) fire everywhere, because that is the point of them.
 */
export interface GlobalShortcut {
  /** Compared case-insensitively against `event.key`. */
  key: string;
  /** Require ⌘ on macOS or Ctrl elsewhere. Both are accepted either way. */
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Fire even when focus is inside a text field. Implied when `meta` is set. */
  allowInInput?: boolean;
  enabled?: boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function useGlobalShortcut(
  {
    key,
    meta = false,
    shift = false,
    alt = false,
    allowInInput = false,
    enabled = true,
  }: GlobalShortcut,
  handler: (event: KeyboardEvent) => void,
): void {
  const handlerRef = useRef(handler);

  // Synced in an effect rather than assigned during render: mutating a ref while
  // rendering is unsafe under concurrent React, where a render can be thrown away
  // and re-run. Effects always flush before the user can press a key, so the
  // listener never sees a stale handler in practice.
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return;

      // Accept either modifier so the same binding works on macOS and Windows
      // without sniffing the platform.
      const metaHeld = event.metaKey || event.ctrlKey;
      if (meta !== metaHeld) return;
      if (shift !== event.shiftKey) return;
      if (alt !== event.altKey) return;

      if (!meta && !allowInInput && isTypingTarget(event.target)) return;

      event.preventDefault();
      handlerRef.current(event);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, meta, shift, alt, allowInInput, enabled]);
}
