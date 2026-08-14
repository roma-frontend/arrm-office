/**
 * DriverCalendarDialog - Shows driver's weekly schedule with translations
 */

'use client';

import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle } from '@/components/ui/sheet';
import { DriverCalendar } from '../DriverCalendar';
import type { Id } from '@/convex/_generated/dataModel';

interface DriverCalendarDialogProps {
  open: boolean;
  onClose: () => void;
  driverId: string | null;
  organizationId: Id<'organizations'>;
  role?: 'admin' | 'driver';
}

export function DriverCalendarDialog({
  open,
  onClose,
  driverId,
  organizationId,
  role,
}: DriverCalendarDialogProps) {
  const { t } = useTranslation();

  if (!driverId) return null;

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" size="full" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle>{t('driverCalendar.dialogTitle', 'Driver Schedule')}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <DriverCalendar
            driverId={driverId as Id<'drivers'>}
            organizationId={organizationId}
            role={role}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
