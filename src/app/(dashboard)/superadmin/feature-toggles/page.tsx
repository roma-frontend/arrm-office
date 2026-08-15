import nextDynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-auth';

const FeatureTogglesClient = nextDynamic(
  () => import('@/components/superadmin/FeatureTogglesClient'),
  {
    loading: () => (
      <div className="mx-auto w-full max-w-5xl animate-pulse space-y-4 p-6">
        <div className="h-8 w-56 rounded-lg bg-white/5" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-white/5" />
          ))}
        </div>
      </div>
    ),
  },
);

export default async function SuperadminFeatureTogglesPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  if (user.role !== 'superadmin') redirect('/dashboard');

  return <FeatureTogglesClient />;
}
