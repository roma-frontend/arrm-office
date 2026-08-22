'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';

import { DetailSheet } from '@/components/ui/detail-sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import type { Id } from '../../../convex/_generated/dataModel';

const LeaveEditClient = dynamic(() => import('@/components/leaves/LeaveEditClient'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-64 items-center justify-center">
      <ShieldLoader size="md" />
    </div>
  ),
});

export interface LeaveEditSheetProps {
  leaveId: Id<'leaveRequests'> | null;
  onClose: () => void;
  /** Requester's name, shown as the subtitle. */
  requesterName?: string;
  /** Raise the panel above the detail sheet overlay. */
  elevated?: boolean;
}

export function LeaveEditSheet({ leaveId, onClose, requesterName, elevated }: LeaveEditSheetProps) {
  const { t } = useTranslation();

  return (
    <DetailSheet
      open={leaveId !== null}
      onClose={onClose}
      size="xl"
      title={t('leave.edit', 'Edit Leave Request')}
      {...(requesterName ? { subtitle: requesterName } : {})}
      {...(elevated ? { contentClassName: 'z-[80]', overlayClassName: 'z-[79]' } : {})}
    >
      {leaveId && <LeaveEditClient leaveId={leaveId} onClose={onClose} />}
    </DetailSheet>
  );
}

export default LeaveEditSheet;
