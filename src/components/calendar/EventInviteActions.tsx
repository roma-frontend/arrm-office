'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { toast } from 'sonner';
import { Check, Clock, X } from 'lucide-react';
import { logger } from '@/lib/logger';
import type { Id } from '@/convex/_generated/dataModel';

export type RsvpResponse = 'accepted' | 'tentative' | 'declined';

interface EventInviteButtonsProps {
  eventId: string;
  /** Called after an answer is recorded — the caller dismisses its UI. */
  onResponded?: (response: RsvpResponse) => void;
  /** Compact horizontal layout for the bell dropdown / notification banner. */
  compact?: boolean;
}

/**
 * The three answer buttons every invite surface (banner, bell, day card) shares.
 */
export function EventInviteButtons({ eventId, onResponded, compact }: EventInviteButtonsProps) {
  const { t } = useTranslation();
  const respond = useMutation(api.calendarEvents.respondToEventInvite);
  const [busy, setBusy] = useState<RsvpResponse | null>(null);

  const handleRespond = async (response: RsvpResponse) => {
    if (busy) return;
    setBusy(response);
    try {
      const result = await respond({
        eventId: eventId as Id<'calendarEvents'>,
        response,
      });
      if (result.success) {
        toast.success(t('rsvp.responseSaved'));
        onResponded?.(response);
      }
    } catch (err) {
      logger.error('RSVP failed', err);
      toast.error(t('rsvp.responseFailed'));
    } finally {
      setBusy(null);
    }
  };

  const btn = (value: RsvpResponse, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void handleRespond(value);
      }}
      disabled={busy === value}
      className={`inline-flex items-center gap-1 rounded-lg border border-(--border-default) bg-(--surface-1) px-2 py-1 text-xs font-medium text-(--text-secondary) transition-colors hover:bg-(--surface-2) disabled:opacity-60 ${compact ? 'px-1.5' : ''}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {btn('accepted', t('rsvp.accept'), <Check className="h-3 w-3" />)}
      {btn('tentative', t('rsvp.tentative'), <Clock className="h-3 w-3" />)}
      {btn('declined', t('rsvp.decline'), <X className="h-3 w-3" />)}
    </div>
  );
}

interface EventInviteActionsProps {
  eventId: string;
  /** True when the viewer organized the event — they get the summary instead of buttons. */
  isOrganizer: boolean;
  /** The viewer's own answer when they are on the guest list. */
  myResponse?: 'needs_action' | RsvpResponse;
  /** Answer counts for the organizer's summary. */
  responseCounts?: {
    total: number;
    accepted: number;
    tentative: number;
    declined: number;
    needsAction: number;
  };
}

/**
 * The full RSVP block for an event card: answer buttons for a guest, a "3 of 5
 * confirmed" summary for the organizer. Bystanders (org-wide access, superadmin
 * viewers) get nothing — it is not their invitation to answer.
 */
export function EventInviteActions({
  eventId,
  isOrganizer,
  myResponse,
  responseCounts,
}: EventInviteActionsProps) {
  const { t } = useTranslation();

  if (isOrganizer) {
    const counts = responseCounts;
    if (!counts || counts.total === 0) return null;
    const summary = counts.accepted + counts.tentative;
    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-(--text-muted)">
        <span className="inline-flex items-center gap-1.5">
          <Check className="h-3 w-3 text-(--success-text)" />
          {counts.accepted} {t('rsvp.acceptedCount')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-(--warning-text)" />
          {counts.tentative} {t('rsvp.tentativeCount')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <X className="h-3 w-3 text-(--danger-text)" />
          {counts.declined} {t('rsvp.declinedCount')}
        </span>
        <span className="text-(--text-muted)">
          {t('rsvp.organizerSummary', { answered: summary, total: counts.total })}
        </span>
      </div>
    );
  }

  if (myResponse === undefined) return null;
  // The invitation is answered — one click retires it from every surface, so
  // the buttons must not come back here just because the day card re-renders.
  if (myResponse !== 'needs_action') return null;
  return <EventInviteButtons eventId={eventId} compact />;
}
