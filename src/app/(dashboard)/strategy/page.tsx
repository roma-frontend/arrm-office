'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { ListChecks } from 'lucide-react';

const StrategyMapsClient = dynamic(() => import('@/components/strategy-map/StrategyMapsClient'), {
  loading: () => <Skeleton className="h-96 w-full" />,
});

const BalancedScorecardDashboard = dynamic(
  () => import('@/components/strategy-map/BalancedScorecardDashboard'),
  {
    loading: () => <Skeleton className="h-96 w-full" />,
  },
);

const AlignmentViewDashboard = dynamic(
  () => import('@/components/strategy-map/AlignmentViewDashboard'),
  {
    loading: () => <Skeleton className="h-96 w-full" />,
  },
);

export default function StrategyPage() {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = t('strategyPage.title', 'Strategy & Balanced Scorecard');
  }, [t]);

  return (
    <Tabs defaultValue="alignment-view" className="w-full">
      <TabsList className="w-full sm:w-auto my-6">
        <TabsTrigger value="alignment-view" className="gap-2">
          <ListChecks className="w-4 h-4" />
          {t('strategyPage.alignmentView', 'Alignment View')}
        </TabsTrigger>
        <TabsTrigger value="strategy-tree" className="gap-2">
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          {t('strategyPage.strategyTree', 'Strategy Tree')}
        </TabsTrigger>
        <TabsTrigger value="balanced-scorecard" className="gap-2">
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          {t('strategyPage.balancedScorecard', 'Balanced Scorecard')}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="alignment-view">
        <AlignmentViewDashboard />
      </TabsContent>
      <TabsContent value="strategy-tree">
        <StrategyMapsClient />
      </TabsContent>
      <TabsContent value="balanced-scorecard">
        <BalancedScorecardDashboard />
      </TabsContent>
    </Tabs>
  );
}
