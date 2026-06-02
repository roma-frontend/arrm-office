'use client';

import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Download, ExternalLink, CheckCircle2, Lock } from 'lucide-react';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import { toast } from 'sonner';
import {
  generateICalendar,
  downloadICalFile,
  getGoogleCalendarAuthUrl,
  getOutlookAuthUrl,
} from '@/lib/calendar-sync';
import { useUpgradeModal } from '@/components/subscription/PlanGate';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';

interface HolidayCalendarSyncProps {
  organizationId?: string;
}

export default function HolidayCalendarSync({ organizationId }: HolidayCalendarSyncProps) {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  const [isSyncingGoogle, setIsSyncingGoogle] = useState(false);
  const [isSyncingOutlook, setIsSyncingOutlook] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const calendarData = useQuery(api.admin.getCalendarExportData, {
    organizationId: organizationId as Id<'organizations'> | undefined,
  });

  // Plan gating
  const { canAccess } = usePlanFeatures();
  const hasCalendarSync = canAccess('calendarSync');
  const { openModal, modal: upgradeModal } = useUpgradeModal();

  // Check connection status on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('google_calendar') === 'connected') {
      setGoogleConnected(true);
      toast.success(t('calendarSync.googleSuccess'));
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('outlook_calendar') === 'connected') {
      setOutlookConnected(true);
      toast.success(t('calendarSync.outlookSuccess'));
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('error')) {
      toast.error(t('calendarSync.connectionFailed', 'Failed to connect to calendar'));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleExportICS = async () => {
    if (!calendarData) return;

    setIsExporting(true);
    try {
      const icsContent = generateICalendar(calendarData);
      const filename = t('calendarSync.icsFilename', {
        date: new Date().toISOString().split('T')[0],
      });
      downloadICalFile(icsContent, filename);
      toast.success(t('calendarSync.icalDownloadSuccess', 'iCal file downloaded successfully'));
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('calendarSync.exportFailed', 'Failed to export calendar'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleGoogleCalendar = async () => {
    if (googleConnected) {
      // Already connected, sync events
      if (!calendarData || calendarData.length === 0) {
        toast.info(t('calendarSync.noEventsToSync', 'No events to sync'));
        return;
      }

      setIsSyncingGoogle(true);
      try {
        const response = await fetch('/api/calendar/google/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: calendarData }),
        });

        if (!response.ok) {
          throw new Error('Sync failed');
        }

        const result = await response.json();
        toast.success(result.message);
      } catch (error) {
        console.error('Google sync error:', error);
        toast.error(t('calendarSync.googleSyncFailed', 'Failed to sync with Google Calendar'));
        setGoogleConnected(false);
      } finally {
        setIsSyncingGoogle(false);
      }
    } else {
      // Need to authenticate
      try {
        const redirectUri = `${window.location.origin}/api/calendar/google/callback`;
        const authUrl = getGoogleCalendarAuthUrl(redirectUri);
        window.location.href = authUrl;
      } catch (error) {
        console.error('Google auth error:', error);
        toast.error(t('calendarSync.googleNotConfigured', 'Google Calendar is not configured'));
      }
    }
  };

  const handleOutlook = async () => {
    if (outlookConnected) {
      // Already connected, sync events
      if (!calendarData || calendarData.length === 0) {
        toast.info(t('calendarSync.noEventsToSync', 'No events to sync'));
        return;
      }

      setIsSyncingOutlook(true);
      try {
        const response = await fetch('/api/calendar/outlook/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: calendarData }),
        });

        if (!response.ok) {
          throw new Error('Sync failed');
        }

        const result = await response.json();
        toast.success(result.message);
      } catch (error) {
        console.error('Outlook sync error:', error);
        toast.error(t('calendarSync.outlookSyncFailed', 'Failed to sync with Outlook Calendar'));
        setOutlookConnected(false);
      } finally {
        setIsSyncingOutlook(false);
      }
    } else {
      // Need to authenticate
      try {
        const redirectUri = `${window.location.origin}/api/calendar/outlook/callback`;
        const authUrl = getOutlookAuthUrl(redirectUri);
        window.location.href = authUrl;
      } catch (error) {
        console.error('Outlook auth error:', error);
        toast.error(t('calendarSync.outlookNotConfigured', 'Outlook Calendar is not configured'));
      }
    }
  };

  if (!calendarData) {
    return (
      <Card className="border-(--border)">
        <CardContent className="flex items-center justify-center p-8">
          <ShieldLoader size="lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {upgradeModal}
      <Card className="border-(--border)">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-500" />
            {t('calendarSync.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="rounded-lg bg-linear-to-br from-blue-500/10 to-cyan-500/10 p-4">
            <p className="text-sm text-(--text-secondary)">{t('calendarSync.upcomingLeaves')}</p>
            <p className="text-3xl font-bold text-(--text-primary)">{calendarData.length}</p>
          </div>

          {/* Export Options */}
          <div className="space-y-2">
            <h4 className="mb-2 text-sm font-semibold text-(--text-primary)">
              {t('calendarSync.exportCalendar')}
            </h4>

            <Button
              onClick={handleExportICS}
              disabled={isExporting || calendarData.length === 0}
              className="w-full justify-start"
              variant="outline"
            >
              {isExporting ? (
                <ShieldLoader size="xs" variant="inline" className="mr-2" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {t('calendarSync.downloadIcal')}
            </Button>

            <div className="relative">
              <Button
                onClick={() => {
                  if (!hasCalendarSync) {
                    openModal({
                      featureTitle: t('calendarSync.googleCalendarSync'),
                      featureDescription: t('calendarSync.googleCalendarSyncDesc'),
                      recommendedPlan: 'professional',
                    });
                    return;
                  }
                  handleGoogleCalendar();
                }}
                className="w-full justify-start"
                variant="outline"
                disabled={isSyncingGoogle || calendarData.length === 0}
              >
                {isSyncingGoogle ? (
                  <ShieldLoader size="xs" variant="inline" className="mr-2" />
                ) : !hasCalendarSync ? (
                  <Lock className="mr-2 h-4 w-4 text-(--text-muted)" />
                ) : googleConnected ? (
                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                {googleConnected && hasCalendarSync
                  ? t('calendarSync.syncWithGoogle')
                  : t('calendarSync.connectGoogle')}
              </Button>
              {googleConnected && hasCalendarSync && (
                <Badge
                  variant="secondary"
                  className="absolute -right-2 -top-2 bg-green-500 text-white"
                >
                  {t('calendarSync.connected')}
                </Badge>
              )}
              {!hasCalendarSync && (
                <Badge
                  variant="secondary"
                  className="absolute -right-2 -top-2 bg-linear-to-r from-amber-500 to-orange-500 text-white text-[10px]"
                >
                  {t('calendarSync.pro')}
                </Badge>
              )}
            </div>

            <div className="relative">
              <Button
                onClick={() => {
                  if (!hasCalendarSync) {
                    openModal({
                      featureTitle: t('calendarSync.outlookCalendarSync'),
                      featureDescription: t('calendarSync.outlookCalendarSyncDesc'),
                      recommendedPlan: 'professional',
                    });
                    return;
                  }
                  handleOutlook();
                }}
                className="w-full justify-start"
                variant="outline"
                disabled={isSyncingOutlook || calendarData.length === 0}
              >
                {isSyncingOutlook ? (
                  <ShieldLoader size="xs" variant="inline" className="mr-2" />
                ) : !hasCalendarSync ? (
                  <Lock className="mr-2 h-4 w-4 text-(--text-muted)" />
                ) : outlookConnected ? (
                  <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                {outlookConnected && hasCalendarSync
                  ? t('calendarSync.syncWithOutlook')
                  : t('calendarSync.connectOutlook')}
              </Button>
              {outlookConnected && hasCalendarSync && (
                <Badge
                  variant="secondary"
                  className="absolute -right-2 -top-2 bg-green-500 text-white"
                >
                  {t('calendarSync.connected')}
                </Badge>
              )}
              {!hasCalendarSync && (
                <Badge
                  variant="secondary"
                  className="absolute -right-2 -top-2 bg-linear-to-r from-amber-500 to-orange-500 text-white text-[10px]"
                >
                  {t('calendarSync.pro')}
                </Badge>
              )}
            </div>
          </div>

          {calendarData.length === 0 && (
            <p className="text-center text-sm text-(--text-secondary)">
              {t('calendarSync.noUpcoming')}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
