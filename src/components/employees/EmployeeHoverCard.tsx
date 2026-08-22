'use client';

/**
 * EmployeeHoverCard — a polished hover card that appears when the user hovers
 * over an employee name or avatar. Shows a mini-profile card with avatar,
 * name, position, department, email, and a "View Profile" link.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/lib/stringUtils';
import { ArrowRight, Building2, Mail, Phone, User } from 'lucide-react';
import { EmployeeSheet } from '@/components/employees/EmployeeSheet';

/** Shape accepted by the `employeeData` prop — a subset of the Convex user doc. */
interface EmployeeData {
  name?: string | null;
  position?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  role?: string | null;
  location?: string | null;
}

interface EmployeeHoverCardProps {
  userId?: string | null;
  name: string;
  children: React.ReactNode;
  openDelay?: number;
  elevated?: boolean;
  onViewProfile?: (userId: string, name: string) => void;
  employeeData?: EmployeeData | null;
}

export function EmployeeHoverCard({
  userId,
  name,
  children,
  openDelay = 400,
  elevated,
  onViewProfile,
  employeeData,
}: EmployeeHoverCardProps) {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queriedData = useQuery(
    api.users.queries.getUserById,
    !employeeData && userId ? { userId: userId as Id<'users'> } : 'skip',
  );

  const userData = employeeData ?? queriedData;

  const hasProfile = !!userId;

  const CARD_HEIGHT = 340;
  const CARD_WIDTH = 288;

  const updatePosition = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      // Vertical: prefer below, flip above if not enough space
      let y = rect.bottom + 8;
      if (y + CARD_HEIGHT > vh) {
        y = rect.top - CARD_HEIGHT - 8;
      }
      // Clamp to viewport
      y = Math.max(8, Math.min(y, vh - CARD_HEIGHT - 8));

      // Horizontal: align left, clamp to viewport width
      let x = rect.left;
      if (x + CARD_WIDTH > vw) {
        x = vw - CARD_WIDTH - 8;
      }
      x = Math.max(8, x);

      setPos({ x, y });
    }
  }, []);

  const handleEnter = useCallback(() => {
    timerRef.current = setTimeout(() => {
      updatePosition();
      setHoverOpen(true);
    }, openDelay);
  }, [openDelay, updatePosition]);

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHoverOpen(false), 150);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Keep position updated while open (for scroll)
  useEffect(() => {
    if (!hoverOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [hoverOpen, updatePosition]);

  const card = hoverOpen
    ? createPortal(
        <div
          className="pointer-events-auto z-[9999] w-72 overflow-hidden rounded-2xl border border-(--border) bg-(--card) p-0 shadow-xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200"
          style={{ position: 'fixed', left: pos.x, top: pos.y }}
          onMouseEnter={() => {
            if (timerRef.current) clearTimeout(timerRef.current);
          }}
          onMouseLeave={handleLeave}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Gradient header */}
          <div
            className="relative h-16 w-full"
            style={{
              background:
                'linear-gradient(135deg, var(--brand) 0%, var(--brand) 80%, transparent 100%)',
            }}
          >
            <div className="absolute inset-0 bg-black/10" />
            <div className="absolute -top-6 -right-6 h-20 w-20 rounded-full bg-white/10" />
            <div className="absolute -bottom-4 -left-4 h-16 w-16 rounded-full bg-white/5" />
          </div>

          {/* Avatar overlapping the header */}
          <div className="-mt-8 px-4">
            <div className="relative">
              <Avatar className="h-14 w-14 border-[3px] border-(--card) shadow-lg">
                <AvatarImage src={userData?.avatarUrl ?? undefined} alt={name} />
                <AvatarFallback className="text-base">{getInitials(name || 'U')}</AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-(--card) bg-emerald-400" />
            </div>
          </div>

          {/* Info */}
          <div className="px-4 pt-3 pb-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-(--text-primary)">
                  {userData?.name ?? name}
                </p>
                {userData?.position && (
                  <p className="mt-0.5 truncate text-xs text-(--text-secondary)">
                    {userData.position}
                  </p>
                )}
              </div>
              {userData?.role && (
                <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">
                  {t(`roles.${userData.role}` as const, {
                    defaultValue: userData.role,
                  })}
                </Badge>
              )}
            </div>

            <div className="mt-3 space-y-1.5">
              {userData?.department && <DetailRow icon={Building2} text={userData.department} />}
              {userData?.email && <DetailRow icon={Mail} text={userData.email} />}
              {userData?.phone && <DetailRow icon={Phone} text={userData.phone} />}
              {!userData && userId && (
                <div className="flex items-center gap-2 py-1 text-xs text-(--text-muted)">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="animate-pulse">Loading...</span>
                </div>
              )}
              {!userId && (
                <div className="flex items-center gap-2 py-1 text-xs text-(--text-muted)">
                  <User className="h-3 w-3 shrink-0" />
                  <span>{name}</span>
                </div>
              )}
            </div>

            {hasProfile && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 w-full justify-between text-xs font-medium text-(--brand)"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onViewProfile && userId) {
                    onViewProfile(userId, name);
                    setHoverOpen(false);
                  } else {
                    setSheetOpen(true);
                  }
                }}
              >
                {t('employeeHover.viewProfile', 'View Profile')}
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className="inline"
      >
        {children}
      </span>
      {card}
      {!onViewProfile && (
        <EmployeeSheet
          employeeId={sheetOpen ? (userId as Id<'users'>) : null}
          onClose={() => setSheetOpen(false)}
          employeeName={name}
          elevated={elevated}
        />
      )}
    </>
  );
}

function DetailRow({
  icon: Icon,
  text,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-(--text-muted)">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
}
