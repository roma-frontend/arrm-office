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
      // переинициализация
      observer?.disconnect();
      entriesRef.current.clear();

      const elements = sectionIds
        .map((id) => document.getElementById(id))
        .filter(Boolean) as HTMLElement[];

      if (!elements.length) return; // ещё не смонтировались

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

    // ✅ ловим появление секций после dynamic import (ssr:false)
    const mo = new MutationObserver(() => {
      // если активная секция не определена — пробуем настроиться ещё раз
      setup();
    });

    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      observer?.disconnect();
    };
  }, [idsKey, rootMargin, JSON.stringify(threshold)]);

  return active;
}
