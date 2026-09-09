'use client';

import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { useTranslation } from 'react-i18next';

/** Public projection returned by the `sso:findConnectionForEmail` query. */
interface SsoConnectionMatch {
  connectionId: string;
  label: string;
}

/**
 * "Continue with <company> SSO" buttons on the login page.
 *
 * Renders one button per enabled SSO connection whose domain allowlist covers
 * the email the user has typed. The button simply navigates to the Convex
 * OIDC start endpoint `/api/sso/<connectionId>` — from there the flow is
 * entirely server-driven.
 *
 * Uses a plain fetch (not `useQuery`) by design: the login page renders
 * without a `ConvexProvider` in tests, and `ImidSignInButton` on this same
 * page established the direct-Convex-HTTP-API pattern for exactly that
 * reason. The query is public (no auth) so no token is needed.
 */
export function SsoSignInButtons({ email }: { email: string }) {
  const { t } = useTranslation();
  // Convex serves HTTP actions on *.convex.site.
  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.replace('.convex.cloud', '.convex.site');

  const [debouncedEmail, setDebouncedEmail] = useState(email);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedEmail(email), 400);
    return () => clearTimeout(id);
  }, [email]);

  const [matches, setMatches] = useState<SsoConnectionMatch[] | null>(null);
  useEffect(() => {
    if (!siteUrl) return;
    // The query is cheap and public; only fire it for plausible emails.
    // No synchronous setState here — invalid emails are handled by the
    // derived `visibleMatches` below to avoid cascading renders.
    if (!debouncedEmail.includes('@')) return;
    let cancelled = false;
    fetch(`${siteUrl}/api/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: 'sso.main.findConnectionForEmail',
        args: { email: debouncedEmail },
      }),
      cache: 'no-store',
    })
      .then((res) => res.json())
      .then((data: { status?: string; value?: SsoConnectionMatch[] | null }) => {
        if (!cancelled && data.status !== 'error') setMatches(data.value ?? []);
      })
      .catch(() => {
        if (!cancelled) setMatches(null);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedEmail, siteUrl]);

  const [pending, setPending] = useState<string | null>(null);

  const visibleMatches = debouncedEmail.includes('@') ? matches : null;
  if (!siteUrl) return null;
  if (!visibleMatches || visibleMatches.length === 0) return null;

  const start = (connectionId: string) => {
    setPending(connectionId);
    window.location.assign(`${siteUrl}/api/sso/${connectionId}`);
  };

  return (
    <div className="space-y-2">
      {visibleMatches.map((conn) => (
        <button
          key={conn.connectionId}
          type="button"
          onClick={() => start(conn.connectionId)}
          disabled={pending !== null}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'var(--background)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          {pending === conn.connectionId ? (
            <>
              <ShieldLoader size="sm" variant="inline" />
              <span>{t('auth.signingIn')}</span>
            </>
          ) : (
            <>
              <Building2 className="w-5 h-5 opacity-70" />
              <span>
                {t('auth.continueWithSso', {
                  provider: conn.label,
                  defaultValue: `Continue with ${conn.label}`,
                })}
              </span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
