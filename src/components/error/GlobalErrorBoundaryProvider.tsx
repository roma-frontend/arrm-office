'use client';

import { ErrorBoundary } from './ErrorBoundary';
import { ReactNode } from 'react';
import { logger } from '@/lib/logger';

interface GlobalErrorBoundaryProviderProps {
  children: ReactNode;
}

/**
 * Global Error Boundary Provider
 * Wraps the entire application with error boundary protection
 */
export function GlobalErrorBoundaryProvider({ children }: GlobalErrorBoundaryProviderProps) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // Global error logging
        logger.error('Global error caught:', error, errorInfo);
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
