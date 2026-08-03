import nextDynamic from 'next/dynamic';
import { WidgetErrorBoundary } from '@/components/error/WidgetErrorBoundary';

const RoomsBoard = nextDynamic(() => import('@/components/rooms/RoomsBoard'), {
  loading: () => (
    <div className="space-y-4 p-6 animate-pulse">
      <div className="h-8 w-56 rounded-lg bg-white/5" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-64 rounded-2xl bg-white/5" />
        <div className="h-64 rounded-2xl bg-white/5" />
        <div className="h-64 rounded-2xl bg-white/5" />
      </div>
    </div>
  ),
});

export default function RoomsPage() {
  return (
    <WidgetErrorBoundary name="RoomsPage">
      <RoomsBoard />
    </WidgetErrorBoundary>
  );
}
