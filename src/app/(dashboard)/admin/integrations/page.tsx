import nextDynamic from 'next/dynamic';
import { getServerUser } from '@/lib/server-auth';
import { redirect } from 'next/navigation';

const NewIntegrationSettings = nextDynamic(
  () => import('@/components/settings/NewIntegrationSettings'),
  {
    loading: () => (
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-lg bg-white/5" />
        <div className="h-32 rounded-2xl bg-white/5" />
        <div className="h-32 rounded-2xl bg-white/5" />
      </div>
    ),
  },
);

export default async function IntegrationSettingsPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');

  return <NewIntegrationSettings />;
}
