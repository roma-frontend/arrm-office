import nextDynamic from 'next/dynamic';

const RecruitmentClient = nextDynamic(() => import('@/components/RecruitmentClient'), {
  loading: () => (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-white/5" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 rounded-2xl bg-white/5" />
      ))}
    </div>
  ),
});

export default function RecruitmentPage() {
  return <RecruitmentClient />;
}
