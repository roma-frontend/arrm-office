'use client';

import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

interface CostAnalysisProps {
  organizationId?: string;
}

export default function CostAnalysis({ organizationId }: CostAnalysisProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');

  const data = useQuery(api.admin.getCostAnalysis, {
    period,
    organizationId: organizationId as Id<'organizations'> | undefined,
  });

  if (!data) {
    return (
      <Card className="border-(--border)">
        <CardContent className="flex items-center justify-center p-8">
          <ShieldLoader size="lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-(--border)">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-(--success-text)" />
            {t('costAnalysis.title')}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant={period === 'month' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod('month')}
            >
              {t('costAnalysis.month')}
            </Button>
            <Button
              variant={period === 'quarter' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod('quarter')}
            >
              {t('costAnalysis.quarter')}
            </Button>
            <Button
              variant={period === 'year' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod('year')}
            >
              {t('costAnalysis.year')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total Cost */}
        <div className="rounded-lg bg-linear-to-br from-(--success-solid) to-(--success-solid) p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-(--text-secondary)">{t('costAnalysis.totalCost')}</p>
              <p className="text-3xl font-bold text-(--text-primary)">
                ${data.totalCost.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-(--text-secondary)">
                {data.totalLeaves} {t('costAnalysis.leaves')} · {data.totalDays}{' '}
                {t('costAnalysis.days')}
              </p>
            </div>
          </div>
        </div>

        {/* By Department */}
        {data.byDepartment.length > 0 && (
          <div>
            <h4 className="mb-2 font-semibold text-(--text-primary)">
              {t('costAnalysis.byDepartment')}
            </h4>
            <div className="space-y-2">
              {data.byDepartment.map((dept) => (
                <div key={dept.name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-(--text-secondary)">{dept.name}</span>
                    <span className="font-medium text-(--text-primary)">
                      ${dept.cost.toLocaleString()} ({dept.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-(--background-subtle)">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-(--success-solid) to-(--success-solid)"
                      style={{ width: `${dept.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By Type */}
        {data.byType.length > 0 && (
          <div>
            <h4 className="mb-2 font-semibold text-(--text-primary)">
              {t('costAnalysis.byLeaveType')}
            </h4>
            <div className="space-y-2">
              {data.byType.map((typeData) => (
                <div key={typeData.type} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-(--text-secondary) capitalize">{typeData.type}</span>
                    <span className="font-medium text-(--text-primary)">
                      ${typeData.cost.toLocaleString()} ({typeData.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-(--background-subtle)">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-(--brand) to-(--cyan)"
                      style={{ width: `${typeData.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.totalCost === 0 && (
          <p className="text-center text-sm text-(--text-secondary)">{t('costAnalysis.noData')}</p>
        )}
      </CardContent>
    </Card>
  );
}
