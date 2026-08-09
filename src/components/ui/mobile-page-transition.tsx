'use client';

import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface MobilePageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

/** Class carrying the enter keyframes; defined in globals.css. */
const ENTER_CLASS = 'mobile-page-enter';

/**
 * Slides page content in on route change (mobile only; a no-op from `lg` up).
 *
 * The animation is enter-only and driven by a CSS keyframe that is restarted
 * imperatively. The earlier version fired the transition from React state: it
 * set the wrapper to `opacity-0` the moment the pathname changed and back to
 * `opacity-100` 50ms later, so every navigation dipped the *already painted*
 * page to transparent and back — a visible blink, most obvious when tapping
 * through the bottom dock. Restarting a keyframe instead means the new content
 * fades in once and nothing ever fades out.
 */
export function MobilePageTransition({ children, className }: MobilePageTransitionProps) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Removing the class, forcing a reflow and re-adding it is the standard way
    // to replay a CSS animation without remounting the subtree (which would
    // throw away scroll position and any uncontrolled input state).
    el.classList.remove(ENTER_CLASS);
    void el.offsetWidth;
    el.classList.add(ENTER_CLASS);
  }, [pathname]);

  return (
    <div ref={ref} className={cn(ENTER_CLASS, className)}>
      {children}
    </div>
  );
}
