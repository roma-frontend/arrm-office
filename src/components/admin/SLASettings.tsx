'use client';

import { useTranslation } from 'react-i18next';

import React, { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Save, AlertCircle } from 'lucide-react';
import { motion } from '@/lib/cssMotion';
import { useAuthStore } from '@/store/useAuthStore';
import { ShieldLoader } from '../ui/ShieldLoader';

function SLASettings() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const config = useQuery(api.sla.getSLAConfig);
  const updateConfig = useMutation(api.sla.updateSLAConfig);

  const [targetHours, setTargetHours] = useState(24);
  const [warningThreshold, setWarningThreshold] = useState(75);
  const [criticalThreshold, setCriticalThreshold] = useState(90);
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    if (config) {
      setTargetHours(config.targetResponseTimeHours);
      setWarningThreshold(config.warningThresholdPercent);
      setCriticalThreshold(config.criticalThresholdPercent);
    }
  }, [config]);

  const handleSave = async () => {
    if (!user?.id) return;

    setIsSaving(true);
    try {
      await updateConfig({
        userId: user.id as Id<'users'>,
        targetResponseTime: targetHours,
        warningThreshold: warningThreshold,
        criticalThreshold: criticalThreshold,
        businessHoursOnly: false,
        businessStartHour: 9,
        businessEndHour: 17,
        excludeWeekends: false,
        notifyOnWarning: false,
        notifyOnCritical: false,
        notifyOnBreach: false,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-(--border) bg-(--card)">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <CardTitle className="text-lg font-bold text-(--text-primary)">
              {t('sla.title')}
            </CardTitle>
            <CardDescription className="text-sm text-(--text-muted)">
              {t('sla.description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Target Response Time */}
        <div className="space-y-2">
          <Label htmlFor="target" className="text-sm font-medium text-(--text-primary)">
            {t('sla.targetHours')}
          </Label>
          <Input
            id="target"
            type="number"
            min="1"
            max="168"
            value={targetHours}
            onChange={(e) => setTargetHours(Number(e.target.value))}
            className="max-w-xs"
          />
          <p className="text-xs text-(--text-muted)">
            {t('sla.targetHint', { hours: targetHours })}
          </p>
        </div>

        {/* Warning Threshold */}
        <div className="space-y-2">
          <Label htmlFor="warning" className="text-sm font-medium text-(--text-primary)">
            {t('sla.warningThreshold')}
          </Label>
          <div className="flex items-center gap-3">
            <Input
              id="warning"
              type="number"
              min="1"
              max="100"
              value={warningThreshold}
              onChange={(e) => setWarningThreshold(Number(e.target.value))}
              className="max-w-xs"
            />
            <span className="text-sm text-(--text-muted)">
              = {Math.round((targetHours * warningThreshold) / 100)} {t('common.hoursShort')}
            </span>
          </div>
          <p className="text-xs text-(--text-muted)">
            {t('sla.warningHint', { percent: warningThreshold })}
          </p>
        </div>

        {/* Critical Threshold */}
        <div className="space-y-2">
          <Label htmlFor="critical" className="text-sm font-medium text-(--text-primary)">
            {t('sla.criticalThreshold')}
          </Label>
          <div className="flex items-center gap-3">
            <Input
              id="critical"
              type="number"
              min="1"
              max="100"
              value={criticalThreshold}
              onChange={(e) => setCriticalThreshold(Number(e.target.value))}
              className="max-w-xs"
            />
            <span className="text-sm text-(--text-muted)">
              = {Math.round((targetHours * criticalThreshold) / 100)} {t('common.hoursShort')}
            </span>
          </div>
          <p className="text-xs text-(--text-muted)">
            {t('sla.criticalHint', { percent: criticalThreshold })}
          </p>
        </div>

        {/* Validation Alert */}
        {warningThreshold >= criticalThreshold && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg"
          >
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-600 dark:text-amber-400">
              {t('sla.thresholdError')}
            </div>
          </motion.div>
        )}

        {/* Save Button */}
        <div className="flex justify-end pt-4 border-t border-(--border)">
          <Button
            onClick={handleSave}
            disabled={isSaving || warningThreshold >= criticalThreshold}
            className="btn-gradient"
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? <ShieldLoader /> : t('sla.saveConfig')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SLASettings;
