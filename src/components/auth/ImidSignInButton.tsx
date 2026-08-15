'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { logger } from '@/lib/logger';

/**
 * "Login with imID" button for the login page.
 *
 * Checks which organizations have imID login enabled and either:
 * - Redirects immediately (single org with imID)
 * - Shows an org picker dialog (multiple orgs with imID)
 * - Hides the button (no org has imID enabled)
 */
export function ImidSignInButton() {
  const { t } = useTranslation();
  const enabledOrgs = useQuery(api.integrations.imidListEnabledOrgs);
  const [isLoading, setIsLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hide the button while loading and if no orgs have imID.
  if (enabledOrgs === undefined) return null;
  if (!enabledOrgs || enabledOrgs.length === 0) return null;

  const handleImidLogin = async (orgId?: string) => {
    setIsLoading(true);
    setError(null);
    setShowPicker(false);

    try {
      const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
      if (!convexUrl) throw new Error('Convex URL not configured');

      const resolvedOrgId = orgId ?? (enabledOrgs.length === 1 ? enabledOrgs[0]!.id : null);

      if (!resolvedOrgId) {
        // Should not happen — picker should be shown first.
        setShowPicker(true);
        setIsLoading(false);
        return;
      }

      // Call the Convex mutation to get the authorization URL and save OAuth state.
      const response = await fetch(`${convexUrl}/api/mutation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'integrations:imidGetAuthorizationUrl',
          args: { organizationId: resolvedOrgId },
          format: 'json',
        }),
      });

      if (!response.ok) {
        const errData = (await response.json().catch(() => ({}))) as unknown;
        throw new Error(
          (errData as { errorMessage?: string } | null)?.errorMessage ||
            'Failed to initiate imID login',
        );
      }

      const data = (await response.json()) as { value?: { url: string } };
      const authUrl = data.value?.url;

      if (!authUrl) throw new Error('No authorization URL returned');

      // Redirect to imID.
      window.location.href = authUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to imID';
      setError(message);
      logger.error('imID login error:', err);
      setIsLoading(false);
    }
  };

  const singleOrg = enabledOrgs.length === 1 ? enabledOrgs[0] : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (singleOrg) {
            handleImidLogin(singleOrg.id);
          } else {
            setShowPicker(true);
          }
        }}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: 'var(--background)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        {isLoading ? (
          <>
            <ShieldLoader size="sm" variant="inline" />
            <span>{t('auth.signingIn', 'Signing in...')}</span>
          </>
        ) : (
          <>
            {/* imID icon — Armenian tricolor badge */}
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="16" rx="3" fill="#D90012" />
              <rect x="2" y="8" width="20" height="8" fill="#0033A0" />
              <rect x="2" y="12" width="20" height="4" fill="#FF6600" />
              <circle cx="12" cy="12" r="4" fill="white" opacity="0.9" />
              <text
                x="12"
                y="13.5"
                textAnchor="middle"
                fontSize="6"
                fontWeight="bold"
                fill="#0033A0"
              >
                im
              </text>
            </svg>
            <span>{t('auth.continueWithImid', 'Login with imID')}</span>
            {singleOrg && <span className="text-[10px] opacity-60 ml-auto">{singleOrg.name}</span>}
          </>
        )}
      </button>

      {/* Error toast */}
      {error && <p className="text-xs text-(--danger-text) mt-1 text-center">{error}</p>}

      {/* Org picker dialog for multi-org */}
      <Dialog open={showPicker} onOpenChange={setShowPicker}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('auth.selectOrganization', 'Select your organization')}</DialogTitle>
            <DialogDescription>
              {t(
                'auth.selectOrgForImid',
                'Choose the organization you want to sign in to with imID.',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {enabledOrgs
              .filter((o): o is NonNullable<typeof o> => o !== null)
              .map((org) => (
                <Button
                  key={org.id}
                  variant="outline"
                  className="w-full justify-start gap-3 py-3"
                  onClick={() => handleImidLogin(org.id)}
                  disabled={isLoading}
                >
                  <span className="text-lg">🏢</span>
                  <span className="font-medium">{org.name}</span>
                  <span className="text-xs text-(--text-muted) ml-auto">@{org.slug}</span>
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
