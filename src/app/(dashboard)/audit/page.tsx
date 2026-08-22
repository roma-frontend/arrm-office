import { Suspense } from 'react';
import nextDynamic from 'next/dynamic';
import { redirect } from 'next/navigation';

import { Skeleton } from '@/components/ui/skeleton';
import { getServerUser } from '@/lib/server-auth';

/**
 * `/audit` — the organization audit log.
 *
 * Gated twice on purpose: here, so a non-admin is redirected instead of shown an
 * empty page, and again inside `listAuditTrail`/`getAuditTrailStats`, which
 * derive the caller from the session and refuse to read another tenant's rows.
 * The redirect is UX; the Convex check is the actual boundary.
 *
 * `force-dynamic` because the page is a live, per-session view — there is nothing
 * here worth caching, and a cached shell would leak one org's counters shape to
 * the next request.
 */
export const dynamic = 'force-dynamic';

const AuditLogClient = nextDynamic(() => import('@/components/audit/AuditLogClient'), {
  loading: () => (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  ),
});

export default async function AuditPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin' && user.role !== 'superadmin') redirect('/dashboard');

  // The client reads its filters from the query string, so it needs a Suspense
  // boundary: `useSearchParams` suspends during the server render otherwise.
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
      <AuditLogClient />
    </Suspense>
  );
}
