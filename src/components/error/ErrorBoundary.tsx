'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Bug, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { logger } from '@/lib/logger';
import i18n from 'i18next';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * 🛡️ ERROR BOUNDARY COMPONENT
 *
 * Catches JavaScript errors anywhere in the component tree
 * Prevents whole app crashes and provides user-friendly error UI
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('🛡️ ErrorBoundary caught an error:', error, errorInfo);

    // Log to error reporting service (Sentry)
    if (typeof window !== 'undefined') {
      const sentry = (
        window as Window & {
          Sentry?: { captureException: (e: Error, opts?: { extra?: unknown }) => void };
        }
      ).Sentry;
      if (sentry) {
        sentry.captureException(error, {
          extra: {
            componentStack: errorInfo.componentStack,
          },
        });
      }
    }

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public override render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <Card className="max-w-md w-full border-destructive/50 shadow-lg">
            <CardHeader className="text-center">
              <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
              <CardTitle className="text-xl">
                {i18n.t('errors.oops', 'Oops! Something went wrong')}
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                {i18n.t(
                  'errors.pleaseRefresh',
                  "We're sorry for the inconvenience. Please try refreshing the page.",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error details (development only) */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="p-4 rounded-lg bg-muted/50 text-xs font-mono text-muted-foreground overflow-auto max-h-48">
                  <div className="flex items-start gap-2 mb-2">
                    <Bug className="w-4 h-4 mt-0.5 shrink-0" />
                    <span className="font-semibold">
                      {i18n.t('errors.details', 'Error Details:')}
                    </span>
                  </div>
                  <p>{this.state.error.toString()}</p>
                  {this.state.errorInfo && (
                    <details className="mt-2">
                      <summary className="cursor-pointer hover:text-foreground">
                        {i18n.t('errors.stackTrace', 'Component Stack Trace')}
                      </summary>
                      <pre className="mt-2 whitespace-pre-wrap">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </details>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={this.handleReload} className="flex-1">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  {i18n.t('errors.reloadPage', 'Reload Page')}
                </Button>
                <Button onClick={this.handleGoHome} variant="outline" className="flex-1">
                  <Home className="w-4 h-4 mr-2" />
                  {i18n.t('errors.goHome', 'Go Home')}
                </Button>
              </div>

              {/* Support link */}
              <div className="text-center text-xs text-muted-foreground">
                <p>
                  {i18n.t(
                    'errors.contactSupport',
                    'If the problem persists, please contact support.',
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Functional Error Boundary wrapper for easier usage
 */
interface ErrorBoundaryFallbackProps {
  error?: Error;
  resetError?: () => void;
}

export function ErrorBoundaryFallback({ error, resetError }: ErrorBoundaryFallbackProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <Card className="max-w-md w-full border-destructive/50 shadow-lg">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-xl">
            {i18n.t('errors.somethingWentWrong', 'Something went wrong')}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {error?.message || i18n.t('errors.unexpected', 'An unexpected error occurred')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={resetError} className="w-full">
            <RefreshCw className="w-4 h-4 mr-2" />
            {i18n.t('errors.tryAgain', 'Try Again')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default ErrorBoundary;
