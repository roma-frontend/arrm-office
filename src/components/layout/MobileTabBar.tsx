'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, CalendarDays, CheckSquare, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { href: '/employees', icon: Users, label: 'Team' },
  { href: '/leaves', icon: CalendarDays, label: 'Leaves' },
  { href: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { href: '/chat', icon: MessageCircle, label: 'Chat' },
] as const;

export function MobileTabBar() {
  const pathname = usePathname();
  const isChatPage =
    pathname === '/ai-chat' || pathname === '/chat' || pathname?.startsWith('/chat/');

  return (
    <nav
      className={cn(
        isChatPage ? 'hidden' : 'block',
        'fixed inset-x-0 bottom-0 z-50 lg:hidden border-t border-(--border) bg-(--card)/80 backdrop-blur-lg',
      )}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-center justify-around h-14">
        {tabs.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname?.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 w-full h-full',
                'text-xs transition-colors',
                isActive ? 'text-(--primary)' : 'text-(--text-muted) active:text-(--text-primary)',
              )}
            >
              <Icon className={cn('h-5 w-5', isActive && 'stroke-[2.5]')} />
              <span className="leading-none">{label}</span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-(--primary)" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
