'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConvexAuth } from 'convex/react';
import { Shield, AlertTriangle, Lock, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { logger } from '@/lib/logger';

interface SecurityMetrics {
  blockedIPs: number;
  rateLimitHits: number;
  failedLogins: number;
  anomalyScore: number;
  lastIncident?: {
    type: string;
    timestamp: number;
  };
}

export function SecurityMonitor() {
  const { t } = useTranslation();
  const { isAuthenticated } = useConvexAuth();
  const [metrics, setMetrics] = useState<SecurityMetrics>({
    blockedIPs: 0,
    rateLimitHits: 0,
    failedLogins: 0,
    anomalyScore: 0,
  });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Проверяем, является ли пользователь админом
    // В реальном приложении проверьте роль пользователя
    const checkAdmin = async () => {
      try {
        const response = await fetch('/api/security/metrics');
        if (response.ok) {
          const data = (await response.json()) as SecurityMetrics;
          setMetrics(data);
          setIsVisible(true);
        }
      } catch (error) {
        logger.error('Failed to fetch security metrics:', error);
      }
    };

    checkAdmin();

    // Обновление каждые 30 секунд
    const interval = setInterval(checkAdmin, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  if (!isVisible) return null;

  const getAnomalyStatus = (score: number) => {
    if (score >= 80) return { label: 'Critical', color: 'bg-(--danger-solid)' };
    if (score >= 60) return { label: 'High', color: 'bg-(--warning-solid)' };
    if (score >= 40) return { label: 'Medium', color: 'bg-(--warning-solid)' };
    return { label: 'Normal', color: 'bg-(--success-solid)' };
  };

  const anomalyStatus = getAnomalyStatus(metrics.anomalyScore);

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <Card className="border-2 border-(--brand-outline) shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Shield className="w-4 h-4 text-(--brand-text)" />
            {t('security.monitor')}
            <Badge variant="outline" className="ml-auto">
              {t('security.live')}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Anomaly Score */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-(--text-3)" />
              <span className="text-sm">{t('security.threatLevel')}</span>
            </div>
            <Badge className={`${anomalyStatus.color} text-white`}>{anomalyStatus.label}</Badge>
          </div>

          {/* Blocked IPs */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-(--text-3)" />
              <span className="text-sm">{t('security.blockedIPs')}</span>
            </div>
            <span className="font-bold text-sm">{metrics.blockedIPs}</span>
          </div>

          {/* Rate Limit Hits */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-(--text-3)" />
              <span className="text-sm">{t('security.rateLimitHits')}</span>
            </div>
            <span className="font-bold text-sm">{metrics.rateLimitHits}</span>
          </div>

          {/* Failed Logins */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-(--text-3)" />
              <span className="text-sm">{t('security.failedLogins')}</span>
            </div>
            <span className="font-bold text-sm">{metrics.failedLogins}</span>
          </div>

          {/* Last Incident */}
          {metrics.lastIncident && (
            <div className="pt-2 border-t border-(--border-default) dark:border-(--border-default)">
              <p className="text-xs text-(--text-3)">{t('security.lastIncident')}</p>
              <p className="text-xs font-medium">{metrics.lastIncident.type}</p>
              <p className="text-xs text-(--text-3)">
                {new Date(metrics.lastIncident.timestamp).toLocaleString()}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
