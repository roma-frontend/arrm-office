import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { requireRoles } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

const OffboardingClient = nextDynamic(() => import('@/components/OffboardingClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default async function OffboardingPage() {
  // Mirrors nav.ts: offboarding is managed by supervisors and up.
  await requireRoles(['superadmin', 'admin', 'supervisor']);
  return <OffboardingClient />;
}
