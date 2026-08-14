'use client';

/**
 * Request Driver Modal - Wrapper for RequestDriverWizard
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetBody, SheetTitle } from '@/components/ui/sheet';
import { RequestDriverWizard } from '../RequestDriverWizard';
import type { Id } from '@/convex/_generated/dataModel';

interface RequestDriverModalProps {
  open: boolean;
  onClose: () => void;
  userId: Id<'users'>;
  preselectedDriverId?: string;
}

export function RequestDriverModal({
  open,
  onClose,
  userId,
  preselectedDriverId,
}: RequestDriverModalProps) {
  const { t } = useTranslation();

  // Block body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      return () => {
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" size="lg" closeLabel={t('common.close', 'Close')}>
        <SheetHeader>
          <SheetTitle className="text-lg md:text-xl">
            {t('driver.requestDriver', 'Request Driver')}
          </SheetTitle>
        </SheetHeader>
        <SheetBody>
          <RequestDriverWizard
            userId={userId}
            onComplete={onClose}
            onCancel={onClose}
            preselectedDriverId={preselectedDriverId}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
