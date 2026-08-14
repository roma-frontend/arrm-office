'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { ServiceBroadcastDialog } from './ServiceBroadcastDialog';
import { ServiceBroadcastsManager } from './ServiceBroadcastsManager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, MessageSquare } from 'lucide-react';
import type { Id } from '../../../convex/_generated/dataModel';
import { useDraftResume } from '@/hooks/useDraftResume';
import { DraftResumeBar } from '@/components/ui/DraftResumeBar';

interface SuperadminBroadcastsPanelProps {
  organizationId?: Id<'organizations'>;
  userId?: Id<'users'>;
}

/**
 * SuperAdmin Service Broadcasts Panel
 * Allows superadmin to send official company-wide announcements and manage them
 */
export function SuperadminBroadcastsPanel({
  organizationId,
  userId,
}: SuperadminBroadcastsPanelProps) {
  const { t } = useTranslation();
  const [broadcastDialogOpen, setBroadcastDialogOpen] = useState(false);
  const broadcastDraft = useDraftResume('service-broadcast', !broadcastDialogOpen);

  const currentUser = useQuery(api.users.queries.getCurrentUser, {});

  const finalOrgId = organizationId || currentUser?.organizationId;
  const finalUserId = userId || currentUser?._id;

  // Don't render if we don't have the required data
  if (!finalOrgId || !finalUserId) {
    return null;
  }

  if (currentUser === undefined)
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Broadcast creation card */}
      <Card
        style={{
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.08)',
        }}
      >
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5" style={{ color: '#f97316' }} />
              <div>
                <CardTitle>{t('broadcasts.title')}</CardTitle>
                <CardDescription>{t('broadcasts.description')}</CardDescription>
              </div>
            </div>
            <Button onClick={() => setBroadcastDialogOpen(true)} className="gap-2" size="sm">
              <MessageSquare className="w-4 h-4" />
              {t('broadcasts.newButton')}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="prose dark:prose-invert text-sm max-w-none">
            <p className="text-muted-foreground">{t('broadcasts.allUsersGetMessage')}</p>

            <div className="mt-4 space-y-2">
              <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {t('broadcasts.typicalScenarios')}
              </h4>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>{t('broadcasts.maintenance')}</li>
                <li>{t('broadcasts.warnings')}</li>
                <li>{t('broadcasts.security')}</li>
                <li>{t('broadcasts.important')}</li>
                <li>{t('broadcasts.critical')}</li>
              </ul>
            </div>
          </div>
        </CardContent>

        {/* Dialog for creating a new broadcast */}
        <ServiceBroadcastDialog
          open={broadcastDialogOpen}
          onOpenChange={setBroadcastDialogOpen}
          organizationId={finalOrgId}
          userId={finalUserId}
        />
      </Card>

      {/* "Draft saved. Restore?" — the broadcast wizard keeps its contents
          after an accidental close; this is what tells the user so. */}
      <DraftResumeBar
        show={broadcastDraft.available}
        label={t('broadcasts.title', 'Service Broadcast')}
        step={broadcastDraft.step}
        onResume={() => {
          broadcastDraft.dismiss();
          setBroadcastDialogOpen(true);
        }}
        onDismiss={broadcastDraft.dismiss}
        onDiscard={broadcastDraft.discard}
      />

      {/* Broadcasts management card */}
      <ServiceBroadcastsManager organizationId={finalOrgId} userId={finalUserId} />
    </div>
  );
}
