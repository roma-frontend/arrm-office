import nextDynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-auth';

const PlansClient = nextDynamic(
  () => import('@/components/superadmin/PlansClient').then((m) => m.PlansClient),
  {
    loading: () => <SkeletonLoader />,
  },
);

function SkeletonLoader() {
  return (
    <div className="mx-auto w-full max-w-7xl animate-pulse space-y-4 p-6">
      <div className="h-8 w-56 rounded-lg bg-white/5" />
      <div className="grid grid-cols-3 gap-4">
        <div className="h-64 rounded-2xl bg-white/5" />
        <div className="h-64 rounded-2xl bg-white/5" />
        <div className="h-64 rounded-2xl bg-white/5" />
      </div>
      <div className="h-96 rounded-2xl bg-white/5" />
    </div>
  );
}

export const metadata = {
  title: 'Plans & Tariffs',
};

export default async function SuperadminPlansPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  if (user.role !== 'superadmin') redirect('/dashboard');

  return <PlansClient />;
}
