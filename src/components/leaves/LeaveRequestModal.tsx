/**
 * Leave Request — slide-over wrapper around LeaveRequestWizard.
 *
 * A right-hand panel rather than a centred dialog: the request is always
 * started from the calendar or the leaves list, and a centred modal covers
 * exactly the dates the user was looking at when they decided to ask for time
 * off. The panel keeps that context on screen.
 */

'use client';

import { useTranslation } from 'react-i18next';
import { Palmtree } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { LeaveRequestWizard } from './LeaveRequestWizard';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import type { Id } from '@/convex/_generated/dataModel';

interface LeaveRequestModalProps {
  open: boolean;
  onClose: () => void;
  preselectedStartDate?: string;
  preselectedEndDate?: string;
}

export function LeaveRequestModal({
  open,
  onClose,
  preselectedStartDate,
  preselectedEndDate,
}: LeaveRequestModalProps) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();

  const isSuperadmin = user?.role === 'superadmin' || false;
  const userId = user?.id as Id<'users'> | undefined;
  const orgId = user?.organizationId as Id<'organizations'> | undefined;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" size="md" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-field bg-(--success-quiet) text-(--success-text)">
              <Palmtree className="size-4" />
            </span>
            <SheetTitle>{t('leaveRequest.newLeaveRequest', 'New Leave Request')}</SheetTitle>
          </div>
          <SheetDescription>
            {isSuperadmin
              ? t('leaveRequest.adminDesc', 'Submit a leave request for an employee')
              : t('leaveRequest.selfDesc', 'Submit a leave request for yourself')}
          </SheetDescription>
        </SheetHeader>
        {userId && (
          <LeaveRequestWizard
            userId={userId}
            orgId={orgId}
            isSuperadmin={isSuperadmin || false}
            selectedOrgId={selectedOrgId as Id<'organizations'> | undefined}
            onComplete={onClose}
            onCancel={onClose}
            preselectedStartDate={preselectedStartDate}
            preselectedEndDate={preselectedEndDate}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
