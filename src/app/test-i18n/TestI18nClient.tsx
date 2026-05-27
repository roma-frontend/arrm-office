'use client';

import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useEffect, useState } from 'react';

export default function TestI18nClient() {
  const { t, i18n } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Debug logs are gated by the parent server page (dev-only).
    console.warn('i18n initialized:', i18n.isInitialized);
    console.warn('Current language:', i18n.language);
    console.warn('Available languages:', i18n.languages);
    console.warn('Test translation:', t('common.welcome'));
  }, [i18n, t]);

  if (!mounted) {
    return (
      <div className="container mx-auto p-8">
        <Card className="p-6 max-w-2xl mx-auto">
          <div className="animate-pulse">Loading translations...</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <Card className="p-6 max-w-2xl mx-auto">
        <div className="mb-4 p-3 bg-blue-100 dark:bg-blue-900 rounded text-sm space-y-2">
          <p>
            Current Language: <strong>{i18n.language}</strong>
          </p>
          <p>
            Initialized: <strong>{i18n.isInitialized ? 'Yes' : 'No'}</strong>
          </p>
          <p>
            Available languages: <strong>{i18n.languages.join(', ')}</strong>
          </p>
          <p>
            Translation test: <strong>{t('common.welcome')}</strong>
          </p>
          <p>
            Direct key: <strong>common.welcome</strong>
          </p>
          <hr className="my-2" />
          <details>
            <summary className="cursor-pointer font-bold">Click to see loaded translations</summary>
            <pre className="text-xs mt-2 overflow-auto max-h-40 bg-white dark:bg-black p-2 rounded">
              {JSON.stringify(i18n.getResourceBundle(i18n.language, 'translation'), null, 2)}
            </pre>
          </details>
        </div>

        <h1 className="text-3xl font-bold mb-4">RAW: {t('common.welcome')}</h1>

        <div className="space-y-4">
          <p className="text-lg">Dashboard welcome: {t('dashboard.welcome')}</p>
          <p className="text-lg bg-yellow-100 dark:bg-yellow-900 p-2 rounded">
            Testing direct: {JSON.stringify(t('common.save'))}
          </p>

          <div className="flex gap-2">
            <Button>{t('common.save')}</Button>
            <Button variant="outline">{t('common.cancel')}</Button>
            <Button variant="destructive">{t('common.delete')}</Button>
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h2 className="font-semibold mb-2">{t('nav.dashboard')}</h2>
            <ul className="space-y-1">
              <li>• {t('nav.employees')}</li>
              <li>• {t('nav.leave')}</li>
              <li>• {t('nav.attendance')}</li>
              <li>• {t('nav.reports')}</li>
              <li>• {t('nav.settings')}</li>
            </ul>
          </div>

          <div className="mt-6">
            <h3 className="font-semibold mb-2">{t('leave.title')}</h3>
            <div className="space-y-2">
              <p>• {t('leave.requestLeave')}</p>
              <p>• {t('leave.myLeaves')}</p>
              <p>• {t('leave.pending')}</p>
              <p>• {t('leave.approved')}</p>
              <p>• {t('leave.rejected')}</p>
            </div>
          </div>

          <div className="mt-6 p-4 border border-green-500 rounded-lg bg-green-50 dark:bg-green-950">
            <p className="text-green-800 dark:text-green-200 font-semibold">
              ✅ Если вы видите армянский текст после переключения языка - i18n работает!
            </p>
            <p className="text-sm text-green-700 dark:text-green-300 mt-2">
              Используйте Language Switcher (🌐) в Navbar сверху
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
