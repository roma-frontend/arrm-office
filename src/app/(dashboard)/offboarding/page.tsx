import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

export const dynamic = 'force-dynamic';

const OffboardingClient = nextDynamic(() => import('@/components/OffboardingClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default function OffboardingPage() {
  return <OffboardingClient />;
}
