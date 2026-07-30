'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, PowerOff } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';

interface MaintenanceModeManagerProps {
  organizationId?: Id<'organizations'> | string;
  userId?: Id<'users'> | string;
}

export function MaintenanceModeManager({ organizationId, userId }: MaintenanceModeManagerProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'hy' ? 'hy-AM' : 'en-US';
  const [disabling, setDisabling] = useState(false);
  const maintenance = useQuery(
    api.admin.getMaintenanceMode,
    organizationId && userId ? { organizationId: organizationId as Id<'organizations'> } : 'skip',
  );
  const disableMaintenanceMode = useMutation(api.admin.disableMaintenanceMode);

  if (maintenance === undefined) {
    return null; // Loading
  }

  if (!maintenance?.isActive) {
    return null; // No active maintenance
  }

  const handleDisable = async () => {
    if (!organizationId || !userId) return;
    setDisabling(true);
    try {
      await disableMaintenanceMode({
        organizationId: organizationId as Id<'organizations'>,
        userId: userId as Id<'users'>,
      });
    } finally {
      setDisabling(false);
    }
  };

  const startTime = new Date(maintenance.startTime);
  const endTime = maintenance.endTime ? new Date(maintenance.endTime) : null;

  return (
    <Card className="border-destructive/30 bg-destructive/10">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-destructive mt-0.5" />
            <div>
              <CardTitle className="text-destructive">{t('maintenance.siteMaintenance')}</CardTitle>
              <CardDescription>{maintenance.title}</CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Status Message */}
        <div className="bg-destructive/10 p-3 rounded-lg border border-destructive/20">
          <p className="text-sm text-destructive">{maintenance.message}</p>
        </div>

        {/* Timeline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground font-medium">
              {t('maintenance.maintenanceStarted')}
            </p>
            <p className="text-sm font-semibold">{startTime.toLocaleString(locale)}</p>
          </div>

          {maintenance.estimatedDuration && (
            <div>
              <p className="text-xs text-muted-foreground font-medium">
                {t('maintenance.estimatedDuration')}
              </p>
              <p className="text-sm font-semibold">{maintenance.estimatedDuration}</p>
            </div>
          )}

          {endTime && (
            <div>
              <p className="text-xs text-muted-foreground font-medium">
                {t('maintenance.expectedEnd')}
              </p>
              <p className="text-sm font-semibold">{endTime.toLocaleString(locale)}</p>
            </div>
          )}
        </div>

        {/* Warning */}
        <div className="bg-warning/10 p-3 rounded-lg border border-warning/20">
          <p className="text-xs text-warning">{t('maintenance.warning')}</p>
        </div>

        {/* Action Button */}
        <Button
          onClick={handleDisable}
          disabled={disabling}
          className="w-full bg-success hover:bg-success/90 text-white gap-2"
        >
          {disabling ? (
            <>
              <ShieldLoader size="xs" variant="inline" />
              {t('maintenance.enablingSite')}
            </>
          ) : (
            <>
              <PowerOff className="w-4 h-4" />
              {t('maintenance.enableSite')}
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          {t('maintenance.siteWillBeAvailable')}
        </p>
      </CardContent>
    </Card>
  );
}
