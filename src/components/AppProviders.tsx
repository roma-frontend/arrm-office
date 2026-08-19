'use client';

import type { ReactNode } from 'react';
import { GlobalErrorBoundaryProvider } from '@/components/error/GlobalErrorBoundaryProvider';
import { MonitoringProvider } from '@/components/providers/MonitoringProvider';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { I18nProvider } from '@/components/I18nProvider';
import { StatusUpdateProvider } from '@/context/StatusUpdateContext';
import { ConvexClientProvider } from '@/lib/convex';
import { AuthSyncProvider } from '@/components/providers/AuthSyncProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { BrandingProvider } from '@/components/providers/BrandingProvider';
import { BrandingPreviewProvider } from '@/context/BrandingPreviewContext';
import { Toaster } from 'sonner';
import { MaintenanceAutoLogout } from '@/components/MaintenanceAutoLogout';
import { HtmlLangUpdater } from '@/components/HtmlLangUpdater';
import { RadixScrollLockFix } from './RadixScrollLockFix';

/**
 * Combined app provider to reduce nesting depth in layout.
 * Replaces 8 levels of provider nesting with a single component.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <GlobalErrorBoundaryProvider>
      <MonitoringProvider>
        <SessionProvider>
          <I18nProvider>
            <HtmlLangUpdater />
            <StatusUpdateProvider>
              <ConvexClientProvider>
                <AuthSyncProvider>
                  <MaintenanceAutoLogout />
                  <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                  >
                    <BrandingPreviewProvider>
                      <BrandingProvider>
                        {children}
                        <RadixScrollLockFix />
                        <Toaster
                          position="top-right"
                          closeButton
                          expand={false}
                          duration={4000}
                          toastOptions={{
                            style: {
                              background: 'var(--card)',
                              border: '1px solid var(--border)',
                              color: 'var(--foreground)',
                            },
                            className: 'sonner-toast',
                          }}
                        />
                      </BrandingProvider>
                    </BrandingPreviewProvider>
                  </ThemeProvider>
                </AuthSyncProvider>
              </ConvexClientProvider>
            </StatusUpdateProvider>
          </I18nProvider>
        </SessionProvider>
      </MonitoringProvider>
    </GlobalErrorBoundaryProvider>
  );
}
