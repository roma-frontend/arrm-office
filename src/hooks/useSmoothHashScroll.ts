'use client';

import { useEffect } from 'react';

function smoothScrollToY(targetY: number, duration = 650) {
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduceMotion) {
    window.scrollTo(0, targetY);
    return;
  }

  const startY = window.scrollY || window.pageYOffset;
  const diff = targetY - startY;
  const start = performance.now();

  const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const step = (now: number) => {
    const elapsed = now - start;
    const p = Math.min(1, elapsed / duration);
    const eased = easeInOutCubic(p);
    window.scrollTo(0, startY + diff * eased);
    if (p < 1) requestAnimationFrame(step);
  };

  requestAnimationFrame(step);
}

function scrollToHash(hash: string, offset: number) {
  const el = document.getElementById(hash);
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const y = (window.scrollY || window.pageYOffset) + rect.top - offset;
  smoothScrollToY(Math.max(0, y));
}

export function useSmoothHashScroll(offset = 84) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const run = () => {
      const hash = window.location.hash.replace('#', '');
      if (!hash) return;

      // Даём странице дорендериться (избавляет от “не нашёл элемент” на переходах)
      requestAnimationFrame(() => {
        // иногда секции появляются после hydration → небольшой повтор
        scrollToHash(hash, offset);
        setTimeout(() => scrollToHash(hash, offset), 90);
        setTimeout(() => scrollToHash(hash, offset), 220);
      });
    };

    run();
    window.addEventListener('hashchange', run);
    return () => window.removeEventListener('hashchange', run);
  }, [offset]);
}
