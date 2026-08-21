'use client';

/**
 * MeetingRoomSettings — lets admins configure how far in advance (5, 10,
 * 15, or 30 minutes) meeting room reminders fire before a booking starts.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation } from 'convex/react';
import { Clock } from 'lucide-react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useAuthStore } from '@/store/useAuthStore';
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const LEAD_TIMES = [
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
];

export function MeetingRoomSettings() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const selectedOrgId = useSelectedOrganization();
  const organizationId = (selectedOrgId ?? user?.organizationId) as Id<'organizations'> | undefined;

  const leadTime = useQuery(
    api.meetingRooms.getMeetingReminderLeadTime,
    organizationId ? { organizationId } : 'skip',
  );
  const updateLeadTime = useMutation(api.meetingRooms.updateMeetingReminderLeadTime);

  const [selected, setSelected] = useState(15);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (leadTime !== undefined) setSelected(leadTime);
  }, [leadTime]);

  const handleSave = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      await updateLeadTime({ organizationId, leadTimeMinutes: selected });
      toast.success(t('settings.meetingRooms.leadTimeSaved', 'Reminder timing updated'));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('settings.meetingRooms.leadTimeError', 'Failed to update'),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border border-(--border) bg-(--card)">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Clock className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <CardTitle className="text-base">
              {t('settings.meetingRooms.title', 'Meeting Room Reminders')}
            </CardTitle>
            <CardDescription className="text-xs">
              {t(
                'settings.meetingRooms.description',
                'How far before a meeting should participants be notified?',
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-medium text-(--text-muted)">
              {t('settings.meetingRooms.leadTime', 'Reminder lead time')}
            </Label>
            <div className="flex gap-2">
              {LEAD_TIMES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelected(value)}
                  className={cn(
                    'flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all cursor-pointer',
                    selected === value
                      ? 'border-(--primary) bg-(--primary)/10 text-(--primary) shadow-sm'
                      : 'border-(--border) bg-(--background-subtle) text-(--text-muted) hover:text-(--text-primary) hover:border-(--primary)/30',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-(--text-muted) mt-1">
              {t(
                'settings.meetingRooms.leadTimeHint',
                'Participants will receive a notification {{minutes}} minutes before the meeting starts.',
                { minutes: selected },
              )}
            </p>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} disabled={saving || leadTime === selected}>
              {saving ? t('buttons.saving', 'Saving...') : t('buttons.saveChanges', 'Save Changes')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
