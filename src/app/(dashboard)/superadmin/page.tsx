import nextDynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-auth';

const SuperadminHubClient = nextDynamic(
  () => import('@/components/superadmin/SuperadminHubClient'),
  {
    loading: () => (
      <div className="mx-auto w-full max-w-7xl animate-pulse space-y-4 p-6">
        <div className="h-8 w-64 rounded-lg bg-white/5" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white/5" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="h-64 rounded-2xl bg-white/5" />
          <div className="h-64 rounded-2xl bg-white/5" />
          <div className="h-64 rounded-2xl bg-white/5" />
        </div>
      </div>
    ),
  },
);

export default async function SuperadminHubPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  if (user.role !== 'superadmin') redirect('/dashboard');

  return <SuperadminHubClient />;
}
