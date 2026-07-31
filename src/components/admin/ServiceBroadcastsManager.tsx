'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldLoader } from '@/components/ui/ShieldLoader';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { logger } from '@/lib/logger';
import { Edit2, Trash2, MessageCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { enUS, ru, hy } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import type { Id } from '../../../convex/_generated/dataModel';

interface ServiceBroadcastsManagerProps {
  organizationId: Id<'organizations'>;
  userId: Id<'users'>;
}

export function ServiceBroadcastsManager({
  organizationId,
  userId,
}: ServiceBroadcastsManagerProps) {
  const { t, i18n } = useTranslation();
  const broadcasts = useQuery(api.chat.queries.getServiceBroadcasts, {
    organizationId,
  });
  const lang = i18n.language || 'en';
  const dateFnsLocale = lang === 'ru' ? ru : lang === 'hy' ? hy : enUS;

  const deleteMessage = useMutation(api.chat.mutations.deleteMessage);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<Id<'chatMessages'> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteClick = (broadcastId: Id<'chatMessages'>) => {
    setSelectedBroadcastId(broadcastId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedBroadcastId) return;

    try {
      setIsDeleting(true);
      logger.log(
        `[ServiceBroadcastsManager] Deleting broadcast ${selectedBroadcastId} by user ${userId}`,
      );
      await deleteMessage({
        messageId: selectedBroadcastId,
        userId,
        deleteForEveryone: true,
      });
      logger.log(`[ServiceBroadcastsManager] ✓ Broadcast deleted successfully`);
      setDeleteDialogOpen(false);
      setSelectedBroadcastId(null);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[ServiceBroadcastsManager] ✗ Failed to delete broadcast:', errorMsg);
      toast.error(t('broadcasts.deleteFailed', { error: errorMsg }));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!broadcasts) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            {t('broadcasts.historyTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <ShieldLoader size="sm" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (broadcasts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            {t('broadcasts.historyTitle')}
          </CardTitle>
          <CardDescription>{t('broadcasts.noAnnouncements')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            {t('broadcasts.createNewAbove')}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            {t('broadcasts.historyTitle')} ({broadcasts.length})
          </CardTitle>
          <CardDescription>{t('broadcasts.manageBroadcasts')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {broadcasts.map((broadcast: any) => (
              <div
                key={broadcast._id}
                className="flex flex-col sm:flex-row  items-start justify-between gap-4 p-4 rounded-lg transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--card-hover)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }}
              >
                {/* Left: Icon & Content */}
                <div className="flex flex-col sm:flex-row items-start gap-3 flex-1">
                  <div className="text-2xl shrink-0 pt-1">{broadcast.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-semibold truncate"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {broadcast.title}
                    </div>
                    <p className="text-sm line-clamp-2 mt-1" style={{ color: 'var(--text-muted)' }}>
                      {broadcast.content}
                    </p>
                    <div
                      className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-2 text-xs"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {format(new Date(broadcast.createdAt), 'd MMM yyyy, HH:mm', {
                          locale: dateFnsLocale,
                        })}
                      </div>
                      <div>{t('broadcasts.fromSender', { sender: broadcast.senderName })}</div>
                    </div>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    disabled
                    title={t('broadcasts.editSoon')}
                    style={{
                      backgroundColor: 'var(--background-subtle)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-muted)',
                    }}
                    onMouseEnter={(e) => {
                      if (!e.currentTarget.disabled) {
                        (e.currentTarget as HTMLElement).style.backgroundColor =
                          'var(--card-hover)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        'var(--background-subtle)';
                    }}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleDeleteClick(broadcast._id)}
                    style={{
                      backgroundColor: 'var(--destructive)',
                      color: 'var(--destructive-foreground)',
                      borderColor: 'var(--destructive)',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.opacity = '0.9';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.opacity = '1';
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('broadcasts.delete')}</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent
          style={{
            backgroundColor: 'var(--popover)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: 'var(--text-primary)' }}>
              {t('broadcasts.deleteConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: 'var(--text-muted)' }}>
              {t('broadcasts.deleteConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogCancel
            type="button"
            disabled={isDeleting}
            onClick={() => setDeleteDialogOpen(false)}
            style={{
              backgroundColor: 'var(--background-subtle)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--card-hover)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--background-subtle)';
            }}
          >
            {t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirmDelete}
            disabled={isDeleting}
            style={{
              backgroundColor: 'var(--destructive)',
              color: 'var(--destructive-foreground)',
              borderColor: 'var(--destructive)',
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) {
                (e.currentTarget as HTMLElement).style.opacity = '0.9';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '1';
            }}
          >
            {isDeleting ? t('broadcasts.deleting') : t('broadcasts.deleteForever')}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
