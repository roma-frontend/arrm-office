// hooks/useActiveSection.ts
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Options = {
  rootMargin?: string;
  threshold?: number | number[];
};

export function useActiveSection(sectionIds: string[], options: Options = {}) {
  const rootMargin = options.rootMargin ?? '-40% 0px -55% 0px';
  const threshold = options.threshold ?? ([0, 0.2, 0.4, 0.6] as number[]);

  const [active, setActive] = useState<string | null>(null);

  // ✅ ВАЖНО: явно типизируем Map — иначе легко словить Map<never, never>
  const entriesRef = useRef<Map<string, IntersectionObserverEntry>>(new Map());
  const observedIdsRef = useRef<Set<string>>(new Set());

  // стабильный ключ
  const idsKey = useMemo(() => sectionIds.join('|'), [sectionIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!sectionIds.length) {
      setActive(null);
      return;
    }

    let observer: IntersectionObserver | null = null;

    const setup = () => {
      const elements = sectionIds
        .map((id) => document.getElementById(id))
        .filter(Boolean) as HTMLElement[];

      if (!elements.length) return; // ещё не смонтировались

      // Rebuild only when the set of observed sections actually changed. The
      // landing is full of live components (tickers, counters, story scenes),
      // and an unconditional MutationObserver re-setup here would recreate the
      // IntersectionObserver on every DOM mutation — its callbacks then never
      // get a chance to fire, so the active section stops updating.
      const nextIds = new Set(elements.map((el) => el.id));
      const current = observedIdsRef.current;
      if (current.size === nextIds.size && [...current].every((id) => nextIds.has(id))) {
        return;
      }

      observer?.disconnect();
      entriesRef.current.clear();
      observedIdsRef.current = nextIds;

      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            entriesRef.current.set(entry.target.id, entry);
          }

          let bestId: string | null = null;
          let bestRatio = 0;

          entriesRef.current.forEach((entry, id) => {
            if (!entry.isIntersecting) return;
            if (entry.intersectionRatio >= bestRatio) {
              bestRatio = entry.intersectionRatio;
              bestId = id;
            }
          });

          if (bestId) setActive(bestId);
        },
        { root: null, rootMargin, threshold },
      );

      elements.forEach((el) => observer!.observe(el));
    };

    setup();

    // ✅ ловим появление секций после dynamic import (ssr:false) — без
    // пересоздания обсервера, когда состав секций не менялся
    const mo = new MutationObserver(() => setup());
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- JSON.stringify(threshold) is intentional for deep comparison
  }, [idsKey, rootMargin, JSON.stringify(threshold)]);

  return active;
}
