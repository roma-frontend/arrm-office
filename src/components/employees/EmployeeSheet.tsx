'use client';

/**
 * Employee profile in a slide-over.
 *
 * Replaces a full page navigation. Clicking a colleague used to unmount the
 * employees list — losing the search text, the filters, the view mode and the
 * scroll position — and getting back meant a second navigation that re-fetched
 * the whole roster. For the common case, "check one detail about someone and
 * carry on down the list", that is the wrong cost: the panel keeps the list
 * behind it, and Escape returns you to exactly where you were.
 *
 * `/employees/[id]` stays as-is. It is the shareable URL and the target of every
 * link from a notification or an email, and the page there is a thin shell around
 * the same body this sheet renders — so the two cannot drift.
 *
 * The body is loaded lazily: EmployeeProfileDetail pulls in tabs, charts, a
 * rating form and three edit modals, and none of that belongs in the bundle of a
 * list page that may never open it.
 */

import React, { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Share2 } from 'lucide-react';

import { DetailSheet } from '@/components/ui/detail-sheet';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Button } from '@/components/ui/button';
import type { Id } from '../../../convex/_generated/dataModel';

const EmployeeProfileDetail = dynamic(
  () => import('@/components/employees/EmployeeProfileDetail'),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-64 items-center justify-center">
        <ShieldLoader size="md" />
      </div>
    ),
  },
);

export interface EmployeeSheetProps {
  /** The employee to show, or null when the sheet is closed. */
  employeeId: Id<'users'> | null;
  onClose: () => void;
  /** Name of the row that was clicked, so the header has a title before the
   *  profile query resolves. */
  employeeName?: string;
  /** When true, the sheet opens above the parent modal (z-[70]). */
  elevated?: boolean;
}

export function EmployeeSheet({ employeeId, onClose, employeeName, elevated }: EmployeeSheetProps) {
  const { t } = useTranslation();

  const handleShare = useCallback(async () => {
    if (!employeeId) return;
    const url = `${window.location.origin}/employees/${employeeId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: employeeName || 'Employee', url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(t('employeeSheet.linkCopied', 'Profile link copied to clipboard'));
      }
    } catch {
      // User cancelled share or clipboard failed — ignore
    }
  }, [employeeId, employeeName, t]);

  const shareButton = employeeId ? (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 text-(--text-muted) hover:text-(--text-primary)"
      onClick={handleShare}
      title={t('employeeSheet.share', 'Share profile')}
    >
      <Share2 className="h-4 w-4" />
    </Button>
  ) : null;

  return (
    <DetailSheet
      open={employeeId !== null}
      onClose={onClose}
      size="xl"
      title={employeeName || t('nav.employees', 'Employees')}
      headerActions={shareButton}
      {...(employeeId ? { deepLink: `/employees/${employeeId}` } : {})}
      {...(elevated ? { contentClassName: 'z-[70]', overlayClassName: 'z-[70]' } : {})}
    >
      {/* Keyed on the id so switching rows remounts the body: the profile keeps
          tab state internally, and without this a colleague would open on
          whichever tab the previous one was left on. */}
      {employeeId && (
        <EmployeeProfileDetail key={employeeId} employeeId={employeeId} elevated={elevated} />
      )}
    </DetailSheet>
  );
}

export default EmployeeSheet;
