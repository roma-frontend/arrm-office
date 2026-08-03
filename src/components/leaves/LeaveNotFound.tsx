'use client';

import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Empty state for the leave detail/edit pages — rendered when getLeaveById
 * returns null (the request does not exist, or the caller has no access to
 * it). Keeps the unauthorized/missing case distinct from the loading skeleton.
 */
export default function LeaveNotFound() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-(--background-subtle) flex items-center justify-center">
          <FileQuestion className="w-8 h-8 text-(--text-muted)" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-(--text-primary)">
            {t('leave.notFound', 'Request not found')}
          </h2>
          <p className="text-sm text-(--text-muted) mt-1 max-w-sm">
            {t(
              'leave.notFoundHint',
              'This request does not exist or you do not have access to it.',
            )}
          </p>
        </div>
        <Button onClick={() => router.push('/leaves')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('leave.backToLeaves', 'Back to Leaves')}
        </Button>
      </div>
    </div>
  );
}
