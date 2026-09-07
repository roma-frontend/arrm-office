'use client';

import { Component, ErrorInfo, ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import i18n from 'i18next';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string; // Widget name for debugging
  onError?: (error: Error) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 🛡️ WIDGET ERROR BOUNDARY
 *
 * Lightweight error boundary for individual widgets (charts, AI chat, etc.).
 * Unlike the global ErrorBoundary, this shows a minimal inline error UI
 * that doesn't break the surrounding page layout.
 *
 * Usage:
 * ```tsx
 * <WidgetErrorBoundary name="RevenueChart">
 *   <RevenueChart data={data} />
 * </WidgetErrorBoundary>
 * ```
 */
export class WidgetErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const widgetName = this.props.name || 'Unknown Widget';
    logger.error(`🛡️ [${widgetName}] ErrorBoundary caught:`, error, errorInfo.componentStack);

    // Policy: every caught error surfaces as a translated toast, deduped per
    // widget so a dashboard with several failing widgets doesn't spam.
    toast.error(i18n.t('errors.somethingWentWrong', 'Something went wrong'), {
      id: `widget-error-${widgetName}`,
    });

    // Log to Sentry if available
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(error, {
        tags: { widget: widgetName },
        extra: { componentStack: errorInfo.componentStack },
      });
    }

    this.props.onError?.(error);
  }

  public override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const widgetName = this.props.name || 'Widget';
      return (
        <div className="flex flex-col items-center justify-center p-6 rounded-xl border border-dashed border-(--border) bg-(--background-subtle) min-h-[200px] gap-3">
          <AlertTriangle className="w-8 h-8 text-(--warning)" />
          <p className="text-sm text-(--text-muted) text-center">
            <strong>{widgetName}</strong> encountered an error
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="text-xs text-(--text-muted) max-w-sm">
              <summary className="cursor-pointer hover:text-(--text-primary)">
                Show error details
              </summary>
              <pre className="mt-2 p-2 bg-(--background) rounded overflow-auto max-h-32 whitespace-pre-wrap">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => this.setState({ hasError: false, error: null })}
            className="gap-2"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
