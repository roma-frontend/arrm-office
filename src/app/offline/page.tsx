'use client';

import { useTranslation } from 'react-i18next';

export default function OfflinePage() {
  const { t } = useTranslation();

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold mb-2">{t('offline.title')}</h1>
        <p className="text-muted-foreground mb-4">{t('offline.description')}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium"
        >
          {t('offline.retry')}
        </button>
      </div>
    </div>
  );
}
