'use client';

import { FileQuestion, Home, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t, ready } = useTranslation();
  const tr = (key: string, fallback: string) => {
    if (!ready) return fallback;
    const result = t(key);
    return result === key ? fallback : result;
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
        <FileQuestion className="h-12 w-12 text-muted-foreground" />
      </div>

      <div className="text-center space-y-2">
        <h1 className="text-6xl font-bold tracking-tighter text-foreground">404</h1>
        <h2 className="text-xl font-semibold text-foreground">
          {tr('idleModal.pageNotFound', 'Page not found')}
        </h2>
        <p className="text-muted-foreground max-w-md">
          {tr(
            'idleModal.pageNotFoundDesc',
            "The page you're looking for doesn't exist or has been moved.",
          )}
        </p>
      </div>

      <div className="flex gap-3 mt-2">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
        >
          <Home className="h-4 w-4" />
          {tr('idleModal.goHome', 'Home page')}
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-lg border border-input bg-background px-6 py-3 text-sm font-medium shadow transition-colors hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          {tr('nav.dashboard', 'Dashboard')}
        </Link>
      </div>
    </div>
  );
}
