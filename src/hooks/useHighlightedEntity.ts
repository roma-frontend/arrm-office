'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Reads `?highlight=<entityId>` and reports which row a list page should flash.
 *
 * This is the receiving end of the notification flow: `notificationTarget`
 * appends the parameter for every route listed in `HIGHLIGHT_ROUTES`, and the
 * page renders a ring around the element carrying the matching id so the user
 * lands on the exact task / leave request / event the notification was about.
 *
 * Two details are deliberate rather than incidental:
 *
 * - The URL is polled instead of read through `useSearchParams`. `popstate`
 *   does not fire for `router.push()`, and clicking a second notification while
 *   already on the target page changes nothing but the query string — without
 *   polling that second click would highlight nothing. Reading `window.location`
 *   also keeps the caller out of a Suspense boundary, which matters for pages
 *   that own their whole query string (tasks writes it via `replaceState`).
 * - The element is looked for on a timer. Lists arrive asynchronously (and the
 *   target may be on a later page of a paginated query), so scrolling is retried
 *   for a few seconds instead of once on the first render.
 */

/** How long the row stays highlighted. */
const HIGHLIGHT_MS = 4000;
/** On/off period of the blink. */
const PULSE_MS = 600;
/** URL poll interval — a query-string change is the only navigation signal. */
const URL_POLL_MS = 500;
/** Element lookup: 40 × 250ms = 10s for a slow list to render the target. */
const SCROLL_RETRY_MS = 250;
const SCROLL_MAX_ATTEMPTS = 40;

export interface UseHighlightedEntityOptions {
  /**
   * Attribute holding the entity id on the scroll target.
   * Defaults to `data-highlight-id`; tasks pass their pre-existing
   * `data-task-id`.
   */
  attribute?: string;
  /** Query parameter to read. Defaults to `highlight`. */
  param?: string;
}

export interface UseHighlightedEntityResult {
  /** Id of the entity to highlight, or null when nothing is highlighted. */
  highlightId: string | null;
  /** Flips every {@link PULSE_MS} while highlighted — drive the blink with it. */
  pulse: boolean;
}

export function useHighlightedEntity({
  attribute = 'data-highlight-id',
  param = 'highlight',
}: UseHighlightedEntityOptions = {}): UseHighlightedEntityResult {
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [pulse, setPulse] = useState(true);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pulseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback((entityId: string) => {
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
    setHighlightId(entityId);
    setPulse(true);
    pulseTimerRef.current = setInterval(() => setPulse((prev) => !prev), PULSE_MS);
    clearTimerRef.current = setTimeout(() => {
      setHighlightId(null);
      setPulse(true);
      if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
    }, HIGHLIGHT_MS);
  }, []);

  useEffect(() => {
    const read = (search: string) => new URLSearchParams(search).get(param);

    const initial = read(window.location.search);
    if (initial) start(initial);

    let lastSearch = window.location.search;
    const poll = setInterval(() => {
      if (window.location.search === lastSearch) return;
      lastSearch = window.location.search;
      const next = read(lastSearch);
      if (next) start(next);
    }, URL_POLL_MS);

    return () => {
      clearInterval(poll);
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      if (pulseTimerRef.current) clearInterval(pulseTimerRef.current);
    };
  }, [param, start]);

  useEffect(() => {
    if (!highlightId) return;
    // Attribute-selector values only need quotes and backslashes escaped; entity
    // ids never contain them, but a stray one would otherwise break the query.
    const value = highlightId.replace(/["\\]/g, '\\$&');
    let attempts = 0;
    const tryScroll = () => {
      // Responsive lists render the same row twice (a mobile card and a desktop
      // table row, one of them `display:none`). Scrolling a hidden node does
      // nothing, so prefer the one that is actually laid out.
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(`[${attribute}="${value}"]`),
      );
      const el = candidates.find((node) => node.offsetParent !== null) ?? candidates[0];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (++attempts < SCROLL_MAX_ATTEMPTS) {
        scrollTimerRef.current = setTimeout(tryScroll, SCROLL_RETRY_MS);
      }
    };
    tryScroll();
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [attribute, highlightId]);

  return { highlightId, pulse };
}
