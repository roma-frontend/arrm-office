import nextDynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-auth';

const SessionsClient = nextDynamic(() => import('@/components/superadmin/SessionsClient'), {
  loading: () => (
    <div className="mx-auto w-full max-w-7xl animate-pulse space-y-4 p-6">
      <div className="h-8 w-56 rounded-lg bg-white/5" />
      <div className="h-64 rounded-2xl bg-white/5" />
    </div>
  ),
});

export default async function SuperadminSessionsPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  if (user.role !== 'superadmin') redirect('/dashboard');

  return <SessionsClient />;
}
