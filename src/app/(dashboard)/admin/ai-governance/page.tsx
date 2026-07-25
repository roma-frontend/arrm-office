import nextDynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';
import { ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

const AIGovernancePanel = nextDynamic(() => import('@/components/ai/AIGovernancePanel'), {
  loading: () => (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 bg-(--background-subtle) rounded-lg w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-(--background-subtle) rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-(--background-subtle) rounded-xl" />
    </div>
  ),
});

export default function AIGovernancePage() {
  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 mb-6 bg-(--background)/95 backdrop-blur supports-[backdrop-filter]:bg-(--background)/60 border-b border-(--border)">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-blue-500" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-(--text-primary)">
              AI Governance
            </h1>
            <p className="text-sm text-(--text-muted) mt-1">
              Monitor, control, and audit AI agent activity
            </p>
          </div>
        </div>
      </div>
      <AIGovernancePanel />
    </div>
  );
}
