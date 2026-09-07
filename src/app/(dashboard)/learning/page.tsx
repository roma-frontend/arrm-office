import nextDynamic from 'next/dynamic';
import { redirect } from 'next/navigation';

import { Skeleton } from '@/components/ui/skeleton';
import { getServerUser } from '@/lib/server-auth';

export const dynamic = 'force-dynamic';

const LearningClient = nextDynamic(() => import('@/components/learning/LearningClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export default async function LearningPage() {
  // /learning is the one Talent leaf employees may open (nav.ts), so no role
  // gate here — only the sign-in check the other dashboard pages rely on.
  const user = await getServerUser();
  if (!user) redirect('/login');
  return <LearningClient />;
}
