import nextDynamic from 'next/dynamic';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';

function TeamSkeleton() {
  return (
    <div className="space-y-4 animate-pulse sm:space-y-6">
      <div className="h-56 rounded-3xl bg-white/5" />
      <div className="h-32 rounded-3xl bg-white/5" />
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}

const TeamClient = nextDynamic(() => import('@/components/team/TeamClient'), {
  loading: () => <TeamSkeleton />,
});

export default function TeamPage() {
  return (
    <WidgetErrorBoundary name="TeamPage">
      <TeamClient />
    </WidgetErrorBoundary>
  );
}
