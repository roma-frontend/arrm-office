import nextDynamic from 'next/dynamic';
import { getServerUser } from '@/lib/server-auth';
import { redirect } from 'next/navigation';

const ProjectDetailClient = nextDynamic(() => import('@/components/projects/ProjectDetailClient'), {
  loading: () => (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-32 rounded-lg bg-white/5" />
      <div className="h-10 w-64 rounded-lg bg-white/5" />
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-white/5" />
        ))}
      </div>
    </div>
  ),
});

export default async function ProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await getServerUser();
  if (!user) redirect('/login');
  const { id } = await props.params;

  return <ProjectDetailClient projectId={id} />;
}
