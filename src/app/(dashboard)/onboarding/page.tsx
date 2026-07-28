import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const OnboardingClient = nextDynamic(() => import('@/components/OnboardingClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function OnboardingPage() {
  return <OnboardingClient />;
}
