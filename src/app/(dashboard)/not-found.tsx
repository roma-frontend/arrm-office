'use client';

import Link from 'next/link';
import { FileQuestion, ArrowLeft, Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function DashboardNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 px-4">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <FileQuestion className="h-10 w-10 text-muted-foreground" />
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{t('pageNotFound')}</h1>
        <p className="text-muted-foreground max-w-md">{t('pageNotFoundDesc')}</p>
      </div>

      <div className="flex gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('backToDashboard')}
        </Link>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-5 py-2.5 text-sm font-medium shadow transition-colors hover:bg-accent"
        >
          <Home className="h-4 w-4" />
          {t('goHome')}
        </Link>
      </div>
    </div>
  );
}
