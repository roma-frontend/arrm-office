'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';
import { useTranslation } from 'react-i18next';
import '@/i18n/config';
import { Plus, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/useAuthStore';
import CompensationRecordWizard from '@/components/compensation/CompensationRecordWizard';

const CompensationClient = dynamic(
  () =>
    import('@/components/compensation/CompensationClient').then((m) => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic HOC wrapper
      default: (props: any) => (
        <WidgetErrorBoundary name="CompensationClient">
          <m.default {...props} />
        </WidgetErrorBoundary>
      ),
    })),
  {
    ssr: false,
    loading: () => <CompensationSkeleton />,
  },
);

function CompensationSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-(--card) rounded" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 my-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-(--card) rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-4">
        <div className="h-64 bg-(--card) rounded-lg" />
        <div className="h-64 bg-(--card) rounded-lg" />
      </div>
    </div>
  );
}

export default function CompensationPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const canManage = user?.role === 'admin' || user?.role === 'superadmin';
  const isAdmin = user?.role === 'admin';
  const [showRecordWizard, setShowRecordWizard] = useState(false);

  return (
    <>
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-6 bg-(--background)/95 backdrop-blur supports-backdrop-filter:bg-(--background)/60 border-b border-(--border)">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-(--text-primary)">
              {t('compensation.dashboard')}
            </h1>
            <p className="text-(--text-muted) mt-1">{t('compensation.subtitle')}</p>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-2">
            {canManage && (
              <Button size="sm" onClick={() => setShowRecordWizard(true)}>
                <Plus className="w-4 h-4 mr-2" />
                {t('compensation.newRecord')}
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" size="sm">
                <Download className="w-4 h-4 mr-2" />
                {t('compensation.export')}
              </Button>
            )}
          </div>
        </div>
      </div>
      <CompensationClient />
      {showRecordWizard && (
        <CompensationRecordWizard
          onClose={() => setShowRecordWizard(false)}
          onSuccess={() => setShowRecordWizard(false)}
        />
      )}
    </>
  );
}
