import { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/Skeleton';

const StrategyMapsClient = dynamic(() => import('@/components/strategy-map/StrategyMapsClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

export const metadata: Metadata = {
  title: 'Strategy Map',
  description: 'Visual cascade of company objectives to individual goals',
};

export default function StrategyPage() {
  return <StrategyMapsClient />;
}
