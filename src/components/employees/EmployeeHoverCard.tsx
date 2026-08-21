'use client';

/**
 * EmployeeHoverCard — a polished hover card that appears when the user hovers
 * over an employee name or avatar. Shows a mini-profile card with avatar,
 * name, position, department, email, and a "View Profile" link.
 *
 * Usage:
 *   <EmployeeHoverCard userId={booking.organizerId} name={booking.organizerName}>
 *     <span className="cursor-pointer underline-offset-2 hover:underline">
 *       {booking.organizerName}
 *     </span>
 *   </EmployeeHoverCard>
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/lib/stringUtils';
import { ArrowRight, Briefcase, Building2, Mail, MapPin, Phone, User } from 'lucide-react';
import { EmployeeSheet } from '@/components/employees/EmployeeSheet';

interface EmployeeHoverCardProps {
  /** Convex user ID — used to fetch the full profile. */
  userId?: string | null;
  /** Display name shown as the trigger element text / fallback. */
  name: string;
  /** The trigger element — typically a name or avatar. */
  children: React.ReactNode;
  /** Delay before the card opens (ms). Default 400. */
  openDelay?: number;
}

export function EmployeeHoverCard({
  userId,
  name,
  children,
  openDelay = 400,
}: EmployeeHoverCardProps) {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState<boolean | undefined>(undefined);

  const userData = useQuery(
    api.users.queries.getUserById,
    userId ? { userId: userId as Id<'users'> } : 'skip',
  );

  const hasProfile = !!userId;

  return (
    <>
    <HoverCard openDelay={openDelay} closeDelay={150} open={hoverOpen} onOpenChange={setHoverOpen}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="pointer-events-auto">
        <div className="relative overflow-hidden">
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
              {/* Online dot */}
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

            {/* Details */}
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

            {/* Action */}
            {hasProfile && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 w-full justify-between text-xs font-medium text-(--brand)"
                onClick={() => { setHoverOpen(false); setSheetOpen(true); }}
              >
                {t('employeeHover.viewProfile', 'View Profile')}
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>

    <EmployeeSheet
      employeeId={sheetOpen ? (userId as Id<'users'>) : null}
      onClose={() => setSheetOpen(false)}
      employeeName={name}
    />
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
