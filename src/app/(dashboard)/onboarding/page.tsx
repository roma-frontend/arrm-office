import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { requireRoles } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

const OnboardingClient = nextDynamic(() => import('@/components/OnboardingClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default async function OnboardingPage() {
  // Mirrors nav.ts: onboarding is managed by supervisors and up. Employees
  // follow their program from /dashboard, not from this admin surface.
  await requireRoles(['superadmin', 'admin', 'supervisor']);
  return <OnboardingClient />;
}
