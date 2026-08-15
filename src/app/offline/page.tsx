'use client';

import { useTranslation } from 'react-i18next';

export default function OfflinePage() {
  const { t } = useTranslation();

  // suppressHydrationWarning on translated elements: the server renders English
  // (i18n initialises with 'en' without browser APIs), but the client hydrates
  // with the user's detected locale. The text is semantically identical, only
  // a different language — mismatched text is harmless here.
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold mb-2" suppressHydrationWarning>
          {t('offline.title')}
        </h1>
        <p className="text-muted-foreground mb-4" suppressHydrationWarning>
          {t('offline.description')}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium"
          suppressHydrationWarning
        >
          {t('offline.retry')}
        </button>
      </div>
    </div>
  );
}
