'use client';

import { useTranslation } from 'react-i18next';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Users } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

interface ConflictDetectionProps {
  organizationId?: string;
}

export default function ConflictDetection({ organizationId }: ConflictDetectionProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'hy' ? 'hy-AM' : 'en-US';
  const conflicts = useQuery(api.admin.detectConflicts, {
    organizationId: organizationId as Id<'organizations'> | undefined,
  });

  if (!conflicts) {
    return (
      <Card className="border-(--border)">
        <CardContent className="flex items-center justify-center p-8">
          <ShieldLoader size="lg" />
        </CardContent>
      </Card>
    );
  }

  const criticalCount = conflicts.filter((c) => c.severity === 'critical').length;
  const warningCount = conflicts.filter((c) => c.severity === 'warning').length;

  return (
    <Card className="border-(--border)">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-(--warning-text)" />
            {t('conflicts.title')}
          </CardTitle>
          <div className="flex gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive">
                {criticalCount} {t('conflicts.critical')}
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="secondary">
                {warningCount} {t('conflicts.warnings')}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {conflicts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Users className="mb-3 h-12 w-12 text-(--success-text) opacity-50" />
            <p className="text-sm font-medium text-(--text-primary)">
              {t('conflicts.noConflicts')}
            </p>
            <p className="text-xs text-(--text-secondary)">{t('conflicts.balanced')}</p>
          </div>
        ) : (
          <div className="max-h-[400px] space-y-3 overflow-y-auto">
            {conflicts.map((conflict) => (
              <div
                key={conflict.id}
                className={`rounded-lg border p-3 ${
                  conflict.severity === 'critical'
                    ? 'border-(--danger-outline) bg-(--danger-quiet)'
                    : 'border-(--warning-outline) bg-(--warning-quiet)'
                }`}
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <p className="font-medium text-(--text-primary)">{conflict.department}</p>
                    <p className="text-xs text-(--text-secondary)">
                      {new Date(conflict.date).toLocaleDateString(locale, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <Badge variant={conflict.severity === 'critical' ? 'destructive' : 'secondary'}>
                    {t(`conflicts.severity.${conflict.severity}`)}
                  </Badge>
                </div>

                <p className="mb-2 text-sm text-(--text-primary)">
                  {t(
                    conflict.recommendationKey,
                    conflict.recommendationParams as Record<string, unknown>,
                  )}
                </p>

                <div className="text-xs text-(--text-secondary)">
                  <p className="mb-1 font-medium">{t('conflicts.employeesOut')}</p>
                  <div className="flex flex-wrap gap-1">
                    {conflict.employeesOut.map((name, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
