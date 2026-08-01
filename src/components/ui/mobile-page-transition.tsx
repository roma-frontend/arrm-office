'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface MobilePageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps page content with a slide-in transition on route change (mobile only).
 * Uses CSS transitions for performance — no framer-motion dependency.
 */
export function MobilePageTransition({ children, className }: MobilePageTransitionProps) {
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (pathname !== prevPath.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fade out before the slide-in transition on route change
      setVisible(false);
      // Short delay then slide in
      const t = setTimeout(() => {
        prevPath.current = pathname;
        setVisible(true);
      }, 50);
      return () => clearTimeout(t);
    }
  }, [pathname]);

  return (
    <div
      className={cn(
        'transition-[opacity,transform] duration-200 ease-out will-change-[opacity,transform]',
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4',
        'lg:!opacity-100 lg:!translate-x-0 lg:!transition-none',
        className,
      )}
    >
      {children}
    </div>
  );
}
