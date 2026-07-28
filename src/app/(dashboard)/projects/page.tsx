import nextDynamic from 'next/dynamic';
import { getServerUser } from '@/lib/server-auth';
import { redirect } from 'next/navigation';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';

const ProjectsClient = nextDynamic(() => import('@/components/projects/ProjectsClient'), {
  loading: () => (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-white/5" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-24 rounded-2xl bg-white/5" />
      ))}
    </div>
  ),
});

export default async function ProjectsPage() {
  const user = await getServerUser();
  if (!user) redirect('/login');

  return (
    <WidgetErrorBoundary name="ProjectsPage">
      <ProjectsClient userId={user.userId} userRole={user.role} />
    </WidgetErrorBoundary>
  );
}
