import nextDynamic from 'next/dynamic';
import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-auth';

const OrgRequestsClient = nextDynamic(
  () =>
    import('@/components/superadmin/OrgRequestsClient').then((m) => ({
      default: m.OrgRequestsClient,
    })),
  {
    loading: () => (
      <div className="mx-auto w-full max-w-7xl animate-pulse space-y-4 p-6">
        <div className="h-8 w-56 rounded-lg bg-white/5" />
        <div className="h-12 rounded-2xl bg-white/5" />
        <div className="h-64 rounded-2xl bg-white/5" />
      </div>
    ),
  },
);

export const metadata = {
  title: 'Organization requests',
};

export default async function SuperadminOrgRequestsPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');
  if (user.role !== 'superadmin') redirect('/dashboard');

  return <OrgRequestsClient />;
}
