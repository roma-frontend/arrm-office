'use client';

/**
 * Presentation half of the mobile dock.
 *
 * Deliberately free of Convex, auth and routing state: everything it needs
 * arrives as props. That keeps the layout renderable in isolation (a harness
 * page, a story, a test) which is the only practical way to check the geometry
 * of a bar whose alignment depends on grid columns and safe-area insets.
 *
 * Layout contract — the reason the rows line up:
 *   tab  = icon box (h-8 w-12) + 4px gap + label box (h-4)  = 52px
 *   dock = h-16 (64px), content centred → 6px above and below
 * Both boxes are fixed height for every tab, so no translation can make one tab
 * sit higher than another, and a long label truncates inside its own box instead
 * of pushing the icon around.
 */

import React from 'react';
import Link from 'next/link';
import { LayoutGrid, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Column index in the 5-column track; column 2 belongs to the centre button. */
export type DockSlot = 0 | 1 | 3 | 4;

export type DockTab = {
  href: string;
  icon: LucideIcon;
  label: string;
  slot: DockSlot;
  badge?: number;
};

export interface MobileDockBarProps {
  tabs: readonly DockTab[];
  /** Slot of the tab matching the current route, or `null` when none does. */
  activeSlot: DockSlot | null;
  menuOpen: boolean;
  onMenuToggle: () => void;
  menuLabel: string;
  navLabel: string;
  /** Draws a dot on the centre button (unread items living inside the menu). */
  menuDot?: boolean;
  onTabClick?: () => void;
}

export function MobileDockBar({
  tabs,
  activeSlot,
  menuOpen,
  onMenuToggle,
  menuLabel,
  navLabel,
  menuDot = false,
  onTabClick,
}: MobileDockBarProps) {
  const bySlot = (slot: DockSlot) => tabs.find((tab) => tab.slot === slot);

  const renderTab = (slot: DockSlot) => {
    const tab = bySlot(slot);
    if (!tab) return <span key={`empty-${slot}`} aria-hidden />;
    const active = tab.slot === activeSlot;
    const count = tab.badge ?? 0;
    const Icon = tab.icon;
    return (
      <Link
        key={tab.href}
        href={tab.href}
        onClick={onTabClick}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative z-[1] flex h-full min-w-0 flex-col items-center justify-center gap-1 text-[10px] transition-colors duration-200',
          active
            ? 'font-semibold text-(--primary)'
            : 'font-medium text-(--text-muted) active:text-(--text-primary)',
        )}
      >
        <span className="relative flex h-8 w-12 items-center justify-center">
          <span
            aria-hidden
            className={cn(
              'absolute inset-0 rounded-2xl bg-(--primary)/10 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
              active ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
            )}
          />
          {/* The active icon is emphasised with weight and colour only. Scaling
              it made its top edge sit a pixel higher than its neighbours', which
              is exactly the kind of "almost aligned" that gets noticed. */}
          <Icon className="relative h-5 w-5" strokeWidth={active ? 2.4 : 1.9} />
          {count > 0 && (
            <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--destructive) px-1 text-[9px] font-bold leading-none text-white shadow-sm">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </span>
        <span className="relative block h-4 w-full truncate px-0.5 text-center leading-4">
          {tab.label}
        </span>
      </Link>
    );
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[105] px-3 lg:hidden"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.625rem)' }}
    >
      <nav
        aria-label={navLabel}
        className="mobile-dock pointer-events-auto relative mx-auto grid h-16 w-full max-w-[28rem] grid-cols-5 grid-rows-1 items-stretch rounded-[26px]"
      >
        {/* The only element that travels between tabs. A hairline centred in its
            column is forgiving; a box that has to register with four separate
            tabs is not, which is what the first version got wrong. */}
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 w-1/5 transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
            activeSlot === null ? 'opacity-0' : 'opacity-100',
          )}
          style={{ transform: `translate3d(${(activeSlot ?? 0) * 100}%, 0, 0)` }}
        >
          <span
            className="absolute left-1/2 top-0 h-[3px] w-8 -translate-x-1/2 rounded-full"
            style={{ background: 'var(--primary-gradient, var(--primary))' }}
          />
        </span>

        {/* Rendered in visual order, with no explicit `grid-column`. Pinning the
            centre button to column 3 while the tabs claimed 1, 2, 4, 5 pushed it
            onto a second row (the grid auto-placement cursor had already passed
            column 3), which split `h-16` in two and left the button hanging
            below the bar. */}
        {renderTab(0)}
        {renderTab(1)}

        {/* Centre action: opens every other section, morphs into a close icon. */}
        <div className="relative z-[2] flex items-start justify-center">
          {/* Painted before the button so it reads as a halo around it rather
              than a wash over the gradient. */}
          <span aria-hidden className="mobile-dock-fab-aura" />
          <button
            type="button"
            onClick={onMenuToggle}
            aria-expanded={menuOpen}
            aria-label={menuLabel}
            className="mobile-dock-fab relative -mt-5 flex h-14 w-14 items-center justify-center rounded-full text-white transition-transform duration-200 active:scale-95"
          >
            <LayoutGrid
              className={cn(
                'absolute h-6 w-6 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                menuOpen ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100',
              )}
            />
            <X
              className={cn(
                'absolute h-6 w-6 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                menuOpen ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0',
              )}
            />
            {!menuOpen && menuDot && (
              <span className="absolute right-0.5 top-0.5 h-3 w-3 rounded-full bg-(--destructive) ring-2 ring-(--card)" />
            )}
          </button>
        </div>

        {renderTab(3)}
        {renderTab(4)}
      </nav>
    </div>
  );
}
