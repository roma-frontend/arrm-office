'use client';

/**
 * Leave request detail in a slide-over, opened from the requests list.
 *
 * This is the one where the panel changes the work, not just the navigation.
 * Reviewing a queue of requests used to be: click a row, land on a page, approve,
 * get pushed back to the list, find your place again, repeat. The panel approves
 * in place and closes itself, and the list — including its filters and scroll
 * position — never moved. Deciding ten requests stops being ten round trips.
 *
 * `onDone` is what makes that work: LeaveDetailClient navigates to `/leaves`
 * after a terminal action on the page, and dismisses the panel here instead.
 */

import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';

import { DetailSheet } from '@/components/ui/detail-sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import type { Id } from '../../../convex/_generated/dataModel';

const LeaveDetailClient = dynamic(() => import('@/components/leaves/LeaveDetailClient'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-64 items-center justify-center">
      <ShieldLoader size="md" />
    </div>
  ),
});

export interface LeaveSheetProps {
  leaveId: Id<'leaveRequests'> | null;
  onClose: () => void;
  /** Requester's name, shown as the title before the query resolves. */
  requesterName?: string;
  /** Raise the panel above a fullscreen overlay (e.g. the timesheet at z-70). */
  elevated?: boolean;
  /** Open the edit wizard in a sheet instead of navigating to the edit page. */
  onEdit?: (leaveId: Id<'leaveRequests'>) => void;
}

export function LeaveSheet({ leaveId, onClose, requesterName, elevated, onEdit }: LeaveSheetProps) {
  const { t } = useTranslation();

  return (
    <DetailSheet
      open={leaveId !== null}
      onClose={onClose}
      size="xl"
      title={t('leave.requestDetails', 'Request details')}
      {...(requesterName ? { subtitle: requesterName } : {})}
      {...(leaveId ? { deepLink: `/leaves/${leaveId}` } : {})}
      {...(elevated ? { contentClassName: 'z-[75]', overlayClassName: 'z-[74]' } : {})}
    >
      {leaveId && (
        <LeaveDetailClient key={leaveId} leaveId={leaveId} onDone={onClose} onEdit={onEdit} />
      )}
    </DetailSheet>
  );
}

export default LeaveSheet;
